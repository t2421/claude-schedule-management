import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Job } from "../api";

type Props = { mode: "new" | "edit" };

type ScheduleBuilder = {
  minute: number;
  startHour: number;
  endHour: number;
  weekdays: number[];
};

const EMPTY: Job = {
  name: "",
  description: "",
  enabled: true,
  schedule: { cron: "0 9 * * *" },
  working_directory: "",
  prompt: "",
  claude_args: ["-p"],
};

const PRESET_DEFS: { key: string; value: string }[] = [
  { key: "everyMinute", value: "* * * * *" },
  { key: "every5Minutes", value: "*/5 * * * *" },
  { key: "every15Minutes", value: "*/15 * * * *" },
  { key: "every30Minutes", value: "*/30 * * * *" },
  { key: "hourly", value: "0 * * * *" },
  { key: "daily9", value: "0 9 * * *" },
  { key: "daily12", value: "0 12 * * *" },
  { key: "daily18", value: "0 18 * * *" },
  { key: "daily0", value: "0 0 * * *" },
  { key: "weekday9", value: "0 9 * * 1-5" },
  { key: "monday9", value: "0 9 * * 1" },
  { key: "monthly1", value: "0 0 1 * *" },
];

// claude CLI permission presets. Scheduled runs have no TTY, so a job that
// triggers a permission prompt will fail or hang — pick one of these
// strategies before saving.
const PERMISSION_PRESETS: { key: string; value: string }[] = [
  { key: "plan", value: "-p --permission-mode plan" },
  { key: "allowedTools", value: "-p --allowedTools Read,Grep,Glob" },
  { key: "bypass", value: "-p --dangerously-skip-permissions" },
];

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const DEFAULT_SCHEDULE_BUILDER: ScheduleBuilder = {
  minute: 0,
  startHour: 9,
  endHour: 18,
  weekdays: [1, 2, 3, 4, 5],
};

function parseNumberList(raw: string, min: number, max: number): number[] | null {
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (!s) return null;
    const range = s.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) return null;
      for (let v = a; v <= b; v++) out.push(v);
      continue;
    }
    if (!/^\d+$/.test(s)) return null;
    out.push(Number(s));
  }
  if (out.some((v) => v < min || v > max)) return null;
  return [...new Set(out)].sort((a, b) => a - b);
}

function parseBuilderFromCron(cron: string): ScheduleBuilder | null {
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

  const weekdays = dowRaw === "*" ? [...WEEKDAY_ORDER] : parseNumberList(dowRaw, 0, 6);
  if (!weekdays || weekdays.length === 0) return null;

  return { minute, startHour, endHour, weekdays };
}

function buildCronFromBuilder(builder: ScheduleBuilder): string {
  const minute = Math.max(0, Math.min(59, builder.minute));
  const startHour = Math.max(0, Math.min(23, builder.startHour));
  const endHour = Math.max(startHour, Math.min(23, builder.endHour));
  const weekdays = [...new Set(builder.weekdays)].sort((a, b) => a - b);
  const hourField =
    startHour === endHour ? String(startHour) : `${startHour}-${endHour}`;
  const dowField = weekdays.length ? weekdays.join(",") : "*";
  return `${minute} ${hourField} * * ${dowField}`;
}

export function JobEdit({ mode }: Props) {
  const { t } = useTranslation();
  const { name } = useParams<{ name: string }>();
  const nav = useNavigate();
  const [job, setJob] = useState<Job>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [envText, setEnvText] = useState("");
  const [argsText, setArgsText] = useState("-p");

  const presets = useMemo(
    () => PRESET_DEFS.map((p) => ({ label: t(`presets.${p.key}`), value: p.value })),
    [t],
  );

  const permissionPresets = useMemo(
    () =>
      PERMISSION_PRESETS.map((p) => ({
        label: t(`permissionPresets.${p.key}`),
        value: p.value,
      })),
    [t],
  );

  useEffect(() => {
    if (mode === "edit" && name) {
      api
        .getJob(name)
        .then(({ job }) => {
          setJob(job);
          setEnvText(
            job.env
              ? Object.entries(job.env)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("\n")
              : "",
          );
          setArgsText((job.claude_args ?? ["-p"]).join(" "));
        })
        .catch((e) => setErr((e as Error).message));
    }
  }, [mode, name]);

  const parsedBuilder = useMemo(
    () => parseBuilderFromCron(job.schedule.cron),
    [job.schedule.cron],
  );
  const builderEditable = parsedBuilder !== null;
  const scheduleBuilder = parsedBuilder ?? DEFAULT_SCHEDULE_BUILDER;

  function applyBuilder(next: ScheduleBuilder) {
    update("schedule", { cron: buildCronFromBuilder(next) });
  }

  function update<K extends keyof Job>(k: K, v: Job[K]) {
    setJob((j) => ({ ...j, [k]: v }));
  }

  async function pickFolder() {
    setPicking(true);
    setErr(null);
    try {
      const r = await api.pickFolder();
      if (r.ok && r.path) {
        update("working_directory", r.path.replace(/\/$/, ""));
      } else if (r.error && r.error !== "cancelled") {
        setErr(r.error);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPicking(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      // Mirror the server-side rule so the user gets immediate feedback
      // instead of waiting for a round-trip.
      if (!job.working_directory || !job.working_directory.trim()) {
        throw new Error(t("edit.field.workdirRequired"));
      }
      const parsedEnv: Record<string, string> = {};
      for (const line of envText.split("\n")) {
        const s = line.trim();
        if (!s || s.startsWith("#")) continue;
        const i = s.indexOf("=");
        if (i < 0) throw new Error(`invalid env line: ${s}`);
        parsedEnv[s.slice(0, i)] = s.slice(i + 1);
      }
      const parsedArgs = argsText.trim() ? argsText.trim().split(/\s+/) : ["-p"];
      const payload: Job = {
        ...job,
        env: Object.keys(parsedEnv).length ? parsedEnv : undefined,
        claude_args: parsedArgs,
      };
      await api.saveJob(job.name, payload);
      nav("/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const presetMatch = presets.find((p) => p.value === job.schedule.cron)?.value ?? "";
  const permissionPresetMatch =
    permissionPresets.find((p) => p.value === argsText.trim())?.value ?? "";

  function toggleWeekday(day: number) {
    const exists = scheduleBuilder.weekdays.includes(day);
    // Keep at least one weekday so the cron stays valid.
    if (exists && scheduleBuilder.weekdays.length === 1) return;
    const weekdays = exists
      ? scheduleBuilder.weekdays.filter((d) => d !== day)
      : [...scheduleBuilder.weekdays, day].sort((a, b) => a - b);
    applyBuilder({ ...scheduleBuilder, weekdays });
  }

  return (
    <>
      <div className="h-row">
        <h2>{mode === "new" ? t("edit.newTitle") : t("edit.editTitle", { name })}</h2>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="form">
        <label>
          {t("edit.field.name")}{" "}
          <span className="cron-hint">({t("edit.field.nameHint")})</span>
          <input
            value={job.name}
            disabled={mode === "edit"}
            onChange={(e) => update("name", e.target.value)}
            placeholder={t("edit.field.namePlaceholder")}
          />
        </label>
        <label>
          {t("edit.field.description")}
          <input
            value={job.description ?? ""}
            onChange={(e) => update("description", e.target.value)}
            placeholder={t("edit.field.descriptionPlaceholder")}
          />
        </label>
        <div className="row">
          <label>
            {t("edit.field.schedule")}
            <div className="input-group">
              <select
                className="input-group-select"
                value={presetMatch}
                onChange={(e) => {
                  if (e.target.value) {
                    update("schedule", { cron: e.target.value });
                  }
                }}
              >
                <option value="">
                  {presetMatch
                    ? t("edit.field.presetSelected")
                    : t("edit.field.presetPlaceholder")}
                </option>
                {presets.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                className="input-group-input mono"
                value={job.schedule.cron}
                onChange={(e) => update("schedule", { cron: e.target.value })}
                placeholder={t("edit.field.schedulePlaceholder")}
              />
            </div>
            <span className="cron-hint">{t("edit.field.scheduleHint")}</span>
            <div className="schedule-builder">
              {!builderEditable && (
                <div className="schedule-builder-note">
                  {t("edit.field.builder.unsupported")}
                </div>
              )}
              <div className="schedule-builder-row">
                <span className="schedule-builder-label">
                  {t("edit.field.builder.weekdays")}
                </span>
                <div
                  className="weekday-chips"
                  role="group"
                  aria-label={t("edit.field.builder.weekdays")}
                >
                  {WEEKDAY_ORDER.map((day) => {
                    const active = scheduleBuilder.weekdays.includes(day);
                    return (
                      <button
                        type="button"
                        key={day}
                        className={`weekday-chip${active ? " active" : ""}`}
                        aria-pressed={active}
                        disabled={!builderEditable}
                        onClick={() => toggleWeekday(day)}
                      >
                        {t(`edit.field.builder.day.${day}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="schedule-builder-row schedule-builder-controls">
                <label>
                  {t("edit.field.builder.minute")}
                  <select
                    value={scheduleBuilder.minute}
                    disabled={!builderEditable}
                    onChange={(e) =>
                      applyBuilder({
                        ...scheduleBuilder,
                        minute: Number(e.target.value),
                      })
                    }
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("edit.field.builder.startHour")}
                  <select
                    value={scheduleBuilder.startHour}
                    disabled={!builderEditable}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      applyBuilder({
                        ...scheduleBuilder,
                        startHour: value,
                        endHour:
                          scheduleBuilder.endHour < value
                            ? value
                            : scheduleBuilder.endHour,
                      });
                    }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("edit.field.builder.endHour")}
                  <select
                    value={scheduleBuilder.endHour}
                    disabled={!builderEditable}
                    onChange={(e) =>
                      applyBuilder({
                        ...scheduleBuilder,
                        endHour: Math.max(
                          scheduleBuilder.startHour,
                          Number(e.target.value),
                        ),
                      })
                    }
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={job.enabled}
              onChange={(e) => update("enabled", e.target.checked)}
            />
            {t("edit.field.enabled")}
          </label>
        </div>
        <label>
          {t("edit.field.workdir")}
          <div className="input-group">
            <input
              className="input-group-input"
              value={job.working_directory ?? ""}
              onChange={(e) => update("working_directory", e.target.value)}
              placeholder={t("edit.field.workdirPlaceholder")}
              required
            />
            <button
              type="button"
              className="input-group-button"
              onClick={pickFolder}
              disabled={picking}
            >
              {picking ? "..." : t("common.browse")}
            </button>
          </div>
        </label>
        <label>
          {t("edit.field.prompt")}
          <textarea
            value={job.prompt}
            onChange={(e) => update("prompt", e.target.value)}
            placeholder={t("edit.field.promptPlaceholder")}
          />
        </label>
        <div className="row">
          <label>
            {t("edit.field.claudeArgs")}{" "}
            <span className="cron-hint">({t("edit.field.claudeArgsHint")})</span>
            <div className="input-group">
              <select
                className="input-group-select"
                value={permissionPresetMatch}
                onChange={(e) => {
                  if (e.target.value) setArgsText(e.target.value);
                }}
              >
                <option value="">
                  {permissionPresetMatch
                    ? t("edit.field.permissionPreset.selected")
                    : t("edit.field.permissionPreset.placeholder")}
                </option>
                {permissionPresets.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                className="input-group-input mono"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
              />
            </div>
            <span className="cron-hint">{t("edit.field.permissionPreset.hint")}</span>
          </label>
          <label>
            {t("edit.field.timeout")}
            <input
              type="number"
              value={job.timeout_seconds ?? ""}
              onChange={(e) =>
                update(
                  "timeout_seconds",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              placeholder={t("edit.field.timeoutPlaceholder")}
            />
          </label>
        </div>
        <label>
          {t("edit.field.env")}{" "}
          <span className="cron-hint">({t("edit.field.envHint")})</span>
          <textarea
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            placeholder={t("edit.field.envPlaceholder")}
            style={{ minHeight: 60 }}
          />
        </label>
        <div className="actions">
          <button onClick={() => nav("/")}>{t("common.cancel")}</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("common.saveAndApply")}
          </button>
        </div>
      </div>
    </>
  );
}
