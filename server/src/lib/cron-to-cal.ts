// Convert a 5-field cron expression into launchd StartCalendarInterval entries.
//
// Supported per field:
//   *          → wildcard (key omitted)
//   N          → exact value
//   A,B,C      → list (cross-product across fields)
//   A-B        → inclusive range
//   *\/N        → every Nth starting at the min of the field
//
// Fields: minute(0-59) hour(0-23) dom(1-31) month(1-12) dow(0-6, 0=Sun)

type CalEntry = {
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

function parseField(
  raw: string,
  kind: keyof typeof RANGES,
): FieldSpec {
  const [min, max] = RANGES[kind];
  raw = raw.trim();
  if (raw === "*") return { wildcard: true, values: [] };

  const stepMatch = raw.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`invalid step in ${kind}: ${raw}`);
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
      if (a > b) throw new Error(`invalid range in ${kind}: ${part}`);
      for (let v = a; v <= b; v++) values.push(v);
    } else {
      const n = Number(part);
      if (!Number.isInteger(n)) {
        throw new Error(`invalid value in ${kind}: ${part}`);
      }
      values.push(n);
    }
  }

  for (const v of values) {
    if (v < min || v > max) {
      throw new Error(`${kind} value ${v} out of range ${min}-${max}`);
    }
  }
  return { wildcard: false, values: [...new Set(values)].sort((a, b) => a - b) };
}

export function cronToCalendarIntervals(cron: string): CalEntry[] {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `cron must have 5 fields (minute hour dom month dow); got: "${cron}"`,
    );
  }
  const [m, h, dom, mon, dow] = fields;
  const minute = parseField(m, "minute");
  const hour = parseField(h, "hour");
  const day = parseField(dom, "dom");
  const month = parseField(mon, "month");
  const weekday = parseField(dow, "dow");

  // Cross product. Wildcard fields contribute [undefined] to skip.
  const dims: { key: keyof CalEntry; values: (number | undefined)[] }[] = [
    { key: "Minute", values: minute.wildcard ? [undefined] : minute.values },
    { key: "Hour", values: hour.wildcard ? [undefined] : hour.values },
    { key: "Day", values: day.wildcard ? [undefined] : day.values },
    { key: "Month", values: month.wildcard ? [undefined] : month.values },
    { key: "Weekday", values: weekday.wildcard ? [undefined] : weekday.values },
  ];

  let acc: CalEntry[] = [{}];
  for (const { key, values } of dims) {
    const next: CalEntry[] = [];
    for (const e of acc) {
      for (const v of values) {
        const copy: CalEntry = { ...e };
        if (v !== undefined) copy[key] = v;
        next.push(copy);
      }
    }
    acc = next;
  }

  // Edge: "* * * * *" → single empty dict (launchd interprets as every minute)
  if (acc.length === 1 && Object.keys(acc[0]).length === 0) {
    return [{ Minute: 0 }, ...Array.from({ length: 59 }, (_, i) => ({ Minute: i + 1 }))];
  }
  return acc;
}
