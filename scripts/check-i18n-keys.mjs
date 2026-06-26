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

const load = (file) => JSON.parse(readFileSync(join(localesDir, file), 'utf8'));
const files = readdirSync(localesDir).filter((f) => f.endsWith('.json'));
const baseKeys = new Set(flatten(load(`${BASE}.json`)));

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
  if (missing.length || extra.length) {
    failed = true;
    console.error(`✗ ${lang}: ${missing.length} missing, ${extra.length} extra`);
    missing.forEach((k) => console.error(`    missing: ${k}`));
    extra.forEach((k) => console.error(`    extra:   ${k}`));
  } else {
    console.log(`✓ ${lang}: in sync with ${BASE}`);
  }
}

if (failed) {
  console.error('\ni18n key-parity check FAILED');
  process.exit(1);
}
console.log(`\nAll ${files.length} locales in sync ✅`);
