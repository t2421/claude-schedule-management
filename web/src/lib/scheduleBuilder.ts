export type ScheduleBuilder = {
  minute: number;
  startHour: number;
  endHour: number;
  weekdays: number[];
};

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const DEFAULT_SCHEDULE_BUILDER: ScheduleBuilder = {
  minute: 0,
  startHour: 9,
  endHour: 18,
  weekdays: [1, 2, 3, 4, 5],
};

export function parseNumberList(
  raw: string,
  min: number,
  max: number,
): number[] | null {
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (!s) return null;
    const range = s.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b) return null;
      for (let v = a; v <= b; v++) out.push(v);
      continue;
    }
    if (!/^\d+$/.test(s)) return null;
    out.push(Number(s));
  }
  if (out.some((v) => v < min || v > max)) return null;
  return [...new Set(out)].sort((a, b) => a - b);
}

export function parseBuilderFromCron(cron: string): ScheduleBuilder | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minuteRaw, hourRaw, dom, mon, dowRaw] = fields;
  if (dom !== "*" || mon !== "*") return null;
  if (!/^\d+$/.test(minuteRaw)) return null;
  const minute = Number(minuteRaw);
  if (minute < 0 || minute > 59) return null;

  let startHour: number;
  let endHour: number;
  const hourRange = hourRaw.match(/^(\d+)-(\d+)$/);
  if (hourRange) {
    startHour = Number(hourRange[1]);
    endHour = Number(hourRange[2]);
  } else if (/^\d+$/.test(hourRaw)) {
    startHour = Number(hourRaw);
    endHour = Number(hourRaw);
  } else {
    return null;
  }
  if (
    startHour < 0 ||
    startHour > 23 ||
    endHour < 0 ||
    endHour > 23 ||
    startHour > endHour
  ) {
    return null;
  }

  const weekdays =
    dowRaw === "*"
      ? ([...WEEKDAY_ORDER].sort((a, b) => a - b) as number[])
      : parseNumberList(dowRaw, 0, 6);
  if (!weekdays || weekdays.length === 0) return null;

  return { minute, startHour, endHour, weekdays };
}

function compactToRanges(sorted: number[]): string {
  if (sorted.length === 0) return "*";
  const parts: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      parts.push(start === end ? String(start) : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  parts.push(start === end ? String(start) : `${start}-${end}`);
  return parts.join(",");
}

export function buildCronFromBuilder(builder: ScheduleBuilder): string {
  const minute = Math.max(0, Math.min(59, builder.minute));
  const startHour = Math.max(0, Math.min(23, builder.startHour));
  const endHour = Math.max(startHour, Math.min(23, builder.endHour));
  const weekdays = [...new Set(builder.weekdays)].sort((a, b) => a - b);
  const hourField =
    startHour === endHour ? String(startHour) : `${startHour}-${endHour}`;
  const dowField = weekdays.length === 7 ? "*" : compactToRanges(weekdays);
  return `${minute} ${hourField} * * ${dowField}`;
}

// Night mode: a fixed window that wraps past midnight (23:00–4:00) with a
// freely configurable interval. The regular ScheduleBuilder can't express
// this window because it requires startHour <= endHour, so night schedules
// get their own tiny builder driven by a single "interval" value.
export const NIGHT_START_HOUR = 23;
export const NIGHT_END_HOUR = 4;

// Minutes between runs offered in the UI. Sub-hour values map to a minute
// step across the whole window; hour multiples map to stepped hours at :00.
export const NIGHT_INTERVAL_OPTIONS = [15, 30, 60, 120, 180, 240] as const;

// Number of hours spanned by the window, e.g. 23:00 → 4:00 is 5 hours.
const NIGHT_WINDOW_LENGTH = (NIGHT_END_HOUR - NIGHT_START_HOUR + 24) % 24;

// Every clock hour inside the window, ascending: [0, 1, 2, 3, 4, 23].
const NIGHT_WINDOW_HOURS = Array.from(
  { length: NIGHT_WINDOW_LENGTH + 1 },
  (_, off) => (NIGHT_START_HOUR + off) % 24,
).sort((a, b) => a - b);

export function buildNightCron(intervalMinutes: number): string {
  if (intervalMinutes < 60) {
    const hourField = compactToRanges(NIGHT_WINDOW_HOURS);
    return `*/${intervalMinutes} ${hourField} * * *`;
  }
  const stepHours = Math.max(1, Math.round(intervalMinutes / 60));
  const hours: number[] = [];
  for (let off = 0; off <= NIGHT_WINDOW_LENGTH; off += stepHours) {
    hours.push((NIGHT_START_HOUR + off) % 24);
  }
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  return `0 ${compactToRanges(sorted)} * * *`;
}

// Recognise a night-window cron and recover its interval. Matching by
// round-tripping each supported interval keeps this in lock-step with
// buildNightCron without a second, fragile parser.
export function parseNightFromCron(cron: string): number | null {
  const normalized = cron.trim().replace(/\s+/g, " ");
  for (const interval of NIGHT_INTERVAL_OPTIONS) {
    if (buildNightCron(interval) === normalized) return interval;
  }
  return null;
}
