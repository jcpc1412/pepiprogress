#!/usr/bin/env node
// Cross-cutting rule #1 (spec 09): all locale catalogs must stay in lockstep.
// Fails CI if any locale is missing keys present in the base (en) — or has extra ones.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');
const BASE = 'en';

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, key) : [key];
  });
}

// Collect every string value (O-06: em dashes are banned in user-facing copy).
function flattenValues(obj, out = []) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') flattenValues(v, out);
    else if (typeof v === 'string') out.push(v);
  }
  return out;
}

// Flatten to a key→value map so we can detect untranslated values.
function flattenMap(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenMap(v, key, out);
    else out[key] = v;
  }
  return out;
}

// Keys whose value may legitimately equal the English value in some locale:
// units/symbols, codes, brand/proper nouns, and cross-language identical words
// (e.g. French "Nutrition"/"Dose"/"Date", German "Protein"/"Name"). A NEW key
// added with an English value in a non-EN locale (a real miss) is NOT in this
// list and will fail the check. Keep this tight — only add verified identicals.
const IDENTICAL_OK = new Set([
  'ask.ratingSuffix', 'ask.sampleCount', 'ask.aggSum', 'ask.doses', 'ask.dosesUnit',
  'addCompound.reconTitle', 'ageGate.ageOk', 'ageGate.dayPlaceholder', 'ageGate.monthPlaceholder',
  'app.name', 'appearance.auto', 'checkin.nutrition', 'common.ok', 'compounds.customName',
  'compounds.injectable', 'doseUnits.mcg', 'doseUnits.mg', 'doseUnits.iu', 'fields.calories',
  'fields.inflammation', 'fields.libido', 'fields.note', 'fields.protein', 'goalCat.body_comp', 'insights.trends', 'insights.trendsLabel',
  'integrations.appleHealth', 'integrations.healthConnect', 'integrations.terra', 'inventory.kind',
  'inventory.label', 'inventory.ok', 'inventoryKinds.vial', 'lab.range', 'lab.vialResult',
  'markers.estradiol', 'markers.glucose', 'me.name', 'measurements.unitCm', 'measurements.unitIn',
  'photos.comparable', 'photos.dayShort', 'photos.filterTitle', 'photos.heading', 'photos.partName',
  'photos.tagWeek', 'photos.timer3', 'photos.timer10', 'photos.timerOff',
  // "Auto" is universal; "Pose" is a cognate in es/pt/de (the pose name is interpolated).
  'photos.poseAuto', 'photos.poseSet',
  'protocol.dose', 'protocol.nominal',
  'protocol.vialCount_one', 'report.date', 'dose.date', 'journal.source.pepi', 'journal.scaleValue',
  // Journal cognates that legitimately equal English in some locales (fr/pt "doses"/"dose",
  // fr "Journal"/"photos", de "Check-in").
  'tabs.journal', 'journal.checkin', 'journal.doses', 'journal.photos', 'journal.doseGeneric',
  'routes.im', 'routes.nasal', 'routes.oral',
  'settings.footer', 'sex.ftm', 'sex.mtf', 'symptoms.minutesShort', 'tabs.pepi', 'tabs.photos',
  'units.g', 'units.imperial', 'units.kcal', 'units.kg', 'units.lb',
  'verdict.unitScale', 'verdict.type.body_comp', 'verdict.role.neutral',
  'signal.source.manual', 'signal.event.symptom', 'signal.event.dose',
  'pepi.ansValue', 'pepi.ansCompare', 'pepi.ansExtremum', 'quicklog.tplDose',
  'photos.angleLabel', 'typical.group.nutrition', 'training.title', 'measurements.ffmiRange',
  // Brand wordmark stamped on shared images (W6-27): a trademark, never translated.
  'share.wordmark',
]);

const load = (file) => JSON.parse(readFileSync(join(localesDir, file), 'utf8'));
const files = readdirSync(localesDir).filter((f) => f.endsWith('.json'));
const baseObj = load(`${BASE}.json`);
const baseKeys = new Set(flatten(baseObj));
const baseMap = flattenMap(baseObj);

let failed = false;
for (const file of files) {
  const lang = file.replace('.json', '');
  const emDashes = flattenValues(load(file)).filter((s) => s.includes('—'));
  if (emDashes.length) {
    failed = true;
    console.error(`✗ ${lang}: ${emDashes.length} string(s) contain an em dash (—)`);
    emDashes.forEach((s) => console.error(`    em dash: ${s}`));
  }
  if (lang === BASE) continue;
  const keys = new Set(flatten(load(file)));
  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseKeys.has(k));
  // Untranslated: value identical to English and not an allowlisted identical.
  const map = flattenMap(load(file));
  const untranslated = Object.keys(baseMap).filter(
    (k) => typeof baseMap[k] === 'string' && map[k] === baseMap[k] && !IDENTICAL_OK.has(k),
  );
  if (missing.length || extra.length || untranslated.length) {
    failed = true;
    console.error(`✗ ${lang}: ${missing.length} missing, ${extra.length} extra, ${untranslated.length} untranslated`);
    missing.forEach((k) => console.error(`    missing:      ${k}`));
    extra.forEach((k) => console.error(`    extra:        ${k}`));
    untranslated.forEach((k) => console.error(`    untranslated: ${k} = "${baseMap[k]}"`));
  } else {
    console.log(`✓ ${lang}: in sync with ${BASE}`);
  }
}

if (failed) {
  console.error('\ni18n key-parity check FAILED');
  process.exit(1);
}
console.log(`\nAll ${files.length} locales in sync ✅`);
