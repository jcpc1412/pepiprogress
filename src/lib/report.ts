import * as Print from 'expo-print';
import { t as i18nT } from 'i18next';
import { shareAsync } from 'expo-sharing';

import type { PersistedState } from '@/lib/store';

const t = (key: string, opts?: Record<string, unknown>): string =>
  i18nT(key as never, opts as never) as unknown as string;

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function row(cells: (string | number | undefined)[]): string {
  return `<tr>${cells.map((c) => `<td>${esc(c ?? '—')}</td>`).join('')}</tr>`;
}

/**
 * Build a self-contained HTML coach/doctor report from local state (spec 03/12).
 * Localized via i18next; user-entered text is HTML-escaped. Pure — no I/O.
 */
export function buildReportHtml(state: PersistedState, locale: string): string {
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString(locale) : iso;
  };

  const checkins = Object.values(state.entries)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 60);
  const doses = state.doseEvents.slice(0, 60);
  const symptoms = state.symptomEvents.slice(0, 60);

  const checkinRows = checkins
    .map((e) => row([e.date, e.weight, e.wellness, e.energy, e.sleep_quality]))
    .join('');
  const doseRows = doses
    .map((d) => row([fmtDate(d.takenAt), d.compoundSlug, d.dose ? `${d.dose} ${d.doseUnit ?? ''}`.trim() : undefined, d.site]))
    .join('');
  const symptomRows = symptoms
    .map((s) => row([fmtDate(s.onsetAt), s.type, s.severity]))
    .join('');

  const hasData = checkins.length || doses.length || symptoms.length;

  const section = (title: string, headers: string[], rows: string) =>
    rows
      ? `<h2>${esc(title)}</h2><table><thead><tr>${headers
          .map((h) => `<th>${esc(h)}</th>`)
          .join('')}</tr></thead><tbody>${rows}</tbody></table>`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, system-ui, sans-serif; color: #1a1a18; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
  .meta { color: #777; font-size: 12px; margin-bottom: 8px; }
  .disclaimer { color: #999; font-size: 11px; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; }
  th { color: #555; font-weight: 600; }
</style></head><body>
  <h1>${esc(t('report.title'))}</h1>
  <div class="meta">${esc(t('report.generated', { date: new Date().toLocaleDateString(locale) }))}</div>
  ${
    hasData
      ? section(t('report.checkins'), [t('checkin.delta'), t('fields.weight'), t('fields.wellness'), t('fields.energy'), t('fields.sleep_quality')], checkinRows) +
        section(t('report.doses'), [t('report.date'), t('protocol.compound'), t('protocol.dose'), t('protocol.site')], doseRows) +
        section(t('report.symptoms'), [t('report.date'), t('symptoms.type'), t('symptoms.severity')], symptomRows)
      : `<p>${esc(t('report.empty'))}</p>`
  }
  <div class="disclaimer">${esc(t('report.disclaimer'))}</div>
</body></html>`;
}

/** Generate the report PDF and open the share sheet (spec 03/12). */
export async function exportCoachReport(state: PersistedState, locale: string): Promise<void> {
  const html = buildReportHtml(state, locale);
  const { uri } = await Print.printToFileAsync({ html });
  await shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
