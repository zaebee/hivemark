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

export type PeriodId = string;

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

export function periodOf(iso: string): PeriodId {
  const { year, week } = isoYearWeek(parseUtc(iso));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function parsePeriod(id: PeriodId): { year: number; week: number } {
  const match = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!match) throw new Error(`unparseable period: ${id}`);
  return { year: Number(match[1]), week: Number(match[2]) };
}

/** Half-open [start, end) in Unix seconds. */
export function periodBounds(id: PeriodId): { start: number; end: number } {
  const { year, week } = parsePeriod(id);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = mondayOf(jan4);
  const start = Math.floor(week1Monday.getTime() / 1000) + (week - 1) * WEEK;
  return { start, end: start + WEEK };
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
