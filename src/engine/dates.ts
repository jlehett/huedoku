/** Calendar date keys ("YYYY-MM-DD") with time-zone-free arithmetic. */

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Bad date key ${key}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Day number since 1970-01-01 for a date key. */
export function dayNumber(key: string): number {
  const { y, m, d } = parseDateKey(key);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function keyFromDayNumber(n: number): string {
  const dt = new Date(n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export const addDays = (key: string, n: number) => keyFromDayNumber(dayNumber(key) + n);

/** Local calendar date of a JS Date as a key. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(key: string): number {
  return ((dayNumber(key) % 7) + 11) % 7; // 1970-01-01 was a Thursday
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
