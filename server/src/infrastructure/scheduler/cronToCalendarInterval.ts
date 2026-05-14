import { ValidationError } from "../../domain/errors.js";

export type CalendarInterval = {
  Minute?: number;
  Hour?: number;
  Day?: number;
  Month?: number;
  Weekday?: number;
};

type FieldSpec = { wildcard: boolean; values: number[] };

const RANGES = {
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 6],
} as const;

const DECIMAL_INT = /^\d+$/;

function parseField(rawInput: string, kind: keyof typeof RANGES): FieldSpec {
  const [min, max] = RANGES[kind];
  const raw = rawInput.trim();
  if (raw === "*") return { wildcard: true, values: [] };

  const stepMatch = raw.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    if (!Number.isInteger(step) || step <= 0) {
      throw new ValidationError(`invalid step in ${kind}: ${raw}`);
    }
    const values: number[] = [];
    for (let v = min; v <= max; v += step) values.push(v);
    return { wildcard: false, values };
  }

  const values: number[] = [];
  for (const part of raw.split(",")) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b) throw new ValidationError(`invalid range in ${kind}: ${part}`);
      for (let v = a; v <= b; v++) values.push(v);
    } else {
      if (!DECIMAL_INT.test(part)) {
        throw new ValidationError(`invalid value in ${kind}: "${part}"`);
      }
      values.push(Number(part));
    }
  }

  for (const v of values) {
    if (v < min || v > max) {
      throw new ValidationError(`${kind} value ${v} out of range ${min}-${max}`);
    }
  }
  return {
    wildcard: false,
    values: [...new Set(values)].sort((a, b) => a - b),
  };
}

// Convert a 5-field cron expression to an array of launchd-compatible
// StartCalendarInterval entries.
export function cronToCalendarIntervals(cron: string): CalendarInterval[] {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ValidationError(
      `cron must have 5 fields (minute hour dom month dow); got: "${cron}"`,
    );
  }
  const [m, h, dom, mon, dow] = fields;
  const minute = parseField(m, "minute");
  const hour = parseField(h, "hour");
  const day = parseField(dom, "dom");
  const month = parseField(mon, "month");
  const weekday = parseField(dow, "dow");

  const dims: { key: keyof CalendarInterval; values: (number | undefined)[] }[] = [
    { key: "Minute", values: minute.wildcard ? [undefined] : minute.values },
    { key: "Hour", values: hour.wildcard ? [undefined] : hour.values },
    { key: "Day", values: day.wildcard ? [undefined] : day.values },
    { key: "Month", values: month.wildcard ? [undefined] : month.values },
    { key: "Weekday", values: weekday.wildcard ? [undefined] : weekday.values },
  ];

  let acc: CalendarInterval[] = [{}];
  for (const { key, values } of dims) {
    const next: CalendarInterval[] = [];
    for (const e of acc) {
      for (const v of values) {
        const copy: CalendarInterval = { ...e };
        if (v !== undefined) copy[key] = v;
        next.push(copy);
      }
    }
    acc = next;
  }

  // "* * * * *" collapses to a single empty dict, which launchd interprets as
  // "never". Expand to every minute to preserve the user's intent.
  if (acc.length === 1 && Object.keys(acc[0]).length === 0) {
    return Array.from({ length: 60 }, (_, i) => ({ Minute: i }));
  }
  return acc;
}
