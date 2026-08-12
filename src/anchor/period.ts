/**
 * Weeks, not rolling windows.
 *
 * An anchor covers a named calendar week, so a week nobody anchored is a period
 * with no record — visible as an absence. A window running from "whenever we
 * last anchored" would absorb the skipped days into the next root and leave
 * nothing to notice.
 *
 * ISO 8601 weeks: Monday starts the week, and week 1 is the one containing the
 * year's first Thursday. That last rule is why a January date can belong to the
 * previous year's final week, and it is the reason this is computed rather than
 * approximated by dividing the epoch by 604800.
 */

declare const periodBrand: unique symbol;

/**
 * A week that exists, not merely a string shaped like one.
 *
 * Branded so the only way to obtain one is `periodId` or `periodOf`, both of
 * which check. Without that, `"2025-W53"` — a week that does not exist, since
 * 2025 has 52 — would flow from a command line into bounds arithmetic and come
 * out denoting a different week entirely.
 */
export type PeriodId = string & { readonly [periodBrand]: true };

const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;

function parseUtc(iso: string): Date {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw new Error(`unparseable timestamp: ${iso}`);
  return at;
}

/** Midnight UTC on the Monday of the week containing `at`. */
function mondayOf(at: Date): Date {
  const day = at.getUTCDay();
  // getUTCDay is Sunday-based; ISO weeks are Monday-based.
  const offset = day === 0 ? 6 : day - 1;
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - offset, 0, 0, 0, 0),
  );
}

/** The Thursday of a week decides which year the week belongs to. */
function isoYearWeek(at: Date): { year: number; week: number } {
  const monday = mondayOf(at);
  const thursday = new Date(monday.getTime() + 3 * DAY * 1000);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const firstThursday = new Date(mondayOf(jan4).getTime() + 3 * DAY * 1000);
  const week = Math.round((thursday.getTime() - firstThursday.getTime()) / (WEEK * 1000)) + 1;
  return { year, week };
}

const format = (year: number, week: number): string =>
  `${year}-W${String(week).padStart(2, "0")}`;

/** Bounds by arithmetic alone, valid or not — the checking lives in `periodId`. */
function boundsOf(year: number, week: number): { start: number; end: number } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const start = Math.floor(mondayOf(jan4).getTime() / 1000) + (week - 1) * WEEK;
  return { start, end: start + WEEK };
}

/**
 * Turn a string into a period, or refuse it.
 *
 * Existence is checked by asking which period the computed days land in.
 * Arithmetic alone will happily produce a start for a week that never happened —
 * `2025-W53` lands in `2026-W01`, `2026-W99` eighteen months out — so the id
 * would silently denote a different week and `gapsIn` would name weeks nobody
 * could anchor. The round trip catches an impossible week and an out-of-range
 * one by the same rule, with no hardcoded 53.
 */
export function periodId(value: string): PeriodId {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) throw new Error(`unparseable period: ${value}`);

  const year = Number(match[1]);
  const week = Number(match[2]);
  const { start } = boundsOf(year, week);
  const landed = isoYearWeek(new Date(start * 1000));
  const landsIn = format(landed.year, landed.week);

  if (landsIn !== value) {
    throw new Error(`no such ISO week: ${value} (those days belong to ${landsIn})`);
  }
  return value as PeriodId;
}

export function periodOf(iso: string): PeriodId {
  const { year, week } = isoYearWeek(parseUtc(iso));
  // Computed from a real instant, so it exists by construction.
  return format(year, week) as PeriodId;
}

/** Half-open [start, end) in Unix seconds. */
export function periodBounds(id: PeriodId): { start: number; end: number } {
  const match = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!match) throw new Error(`unparseable period: ${id}`);
  return boundsOf(Number(match[1]), Number(match[2]));
}

export function periodsBetween(from: PeriodId, to: PeriodId): PeriodId[] {
  const first = periodBounds(from).start;
  const last = periodBounds(to).start;
  if (last < first) throw new Error(`period range runs backwards: ${from} to ${to}`);

  const out: PeriodId[] = [];
  for (let t = first; t <= last; t += WEEK) {
    out.push(periodOf(new Date(t * 1000).toISOString()));
  }
  return out;
}
