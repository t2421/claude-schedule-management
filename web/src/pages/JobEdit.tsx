import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Job, type Provider, PROVIDERS } from "../api";
import {
  buildCronFromBuilder,
  buildNightCron,
  DEFAULT_SCHEDULE_BUILDER,
  NIGHT_INTERVAL_OPTIONS,
  parseBuilderFromCron,
  parseNightFromCron,
  type ScheduleBuilder,
  WEEKDAY_ORDER,
} from "../lib/scheduleBuilder";

type Props = { mode: "new" | "edit" };

const MODELS: Record<Provider, { value: string; label: string }[]> = {
  claude: [
    { value: "", label: "Default" },
    { value: "claude-fable-5", label: "Claude Fable 5" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  gemini: [
    { value: "", label: "Default" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  codex: [
    { value: "", label: "Default" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "o3", label: "o3" },
    { value: "codex-mini-latest", label: "codex-mini-latest" },
  ],
};

const EMPTY: Job = {
  name: "",
  description: "",
  enabled: true,
  schedule: { cron: "0 9 * * *" },
  working_directory: "",
  prompt: "",
  provider: "claude",
  model: "",
  claude_args: ["-p"],
};

// Mirror of the server's defaultArgsFor (domain/job/Job.ts): claude / gemini
// use -p for non-interactive mode, codex relies on its `exec` subcommand.
function defaultArgsText(provider: Provider): string {
  return provider === "codex" ? "" : "-p";
}

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
  { key: "night", value: buildNightCron(60) },
  { key: "weekday9", value: "0 9 * * 1-5" },
  { key: "monday9", value: "0 9 * * 1" },
  { key: "monthly1", value: "0 0 1 * *" },
];

// CLI permission / approval presets, per provider. Scheduled runs have no TTY,
// so a job that triggers an interactive approval prompt will fail or hang —
// pick one of these strategies before saving. For gemini, `-p` takes the
// prompt as its value, so it must come last in the arg list.
const PERMISSION_PRESETS: Record<Provider, { key: string; value: string }[]> = {
  claude: [
    { key: "claudePlan", value: "-p --permission-mode plan" },
    { key: "claudeAllowedTools", value: "-p --allowedTools Read,Grep,Glob" },
    { key: "claudeBypass", value: "-p --dangerously-skip-permissions" },
  ],
  gemini: [
    { key: "geminiAutoEdit", value: "--approval-mode auto_edit -p" },
    { key: "geminiYolo", value: "--yolo -p" },
  ],
  codex: [
    { key: "codexReadOnly", value: "--sandbox read-only" },
    { key: "codexFullAuto", value: "--full-auto" },
    { key: "codexBypass", value: "--dangerously-bypass-approvals-and-sandbox" },
  ],
};

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

  const provider: Provider = job.provider ?? "claude";

  const permissionPresets = useMemo(
    () =>
      PERMISSION_PRESETS[provider].map((p) => ({
        label: t(`permissionPresets.${p.key}`),
        value: p.value,
      })),
    [t, provider],
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
          if (!job.model) update("model", "");
        })
        .catch((e) => setErr((e as Error).message));
    }
  }, [mode, name]);

  const parsedBuilder = useMemo(
    () => parseBuilderFromCron(job.schedule.cron),
    [job.schedule.cron],
  );
  const nightInterval = useMemo(
    () => parseNightFromCron(job.schedule.cron),
    [job.schedule.cron],
  );
  const isNight = nightInterval !== null;
  const builderEditable = parsedBuilder !== null;
  const scheduleBuilder = parsedBuilder ?? DEFAULT_SCHEDULE_BUILDER;

  function applyBuilder(next: ScheduleBuilder) {
    update("schedule", { cron: buildCronFromBuilder(next) });
  }

  function update<K extends keyof Job>(k: K, v: Job[K]) {
    setJob((j) => ({ ...j, [k]: v }));
  }

  // Switching provider resets the args to that provider's default, because
  // flags are not portable across CLIs (e.g. claude's --permission-mode has no
  // codex equivalent). The user can then pick a preset for the new provider.
  function changeProvider(next: Provider) {
    update("provider", next);
    update("model", "");
    setArgsText(defaultArgsText(next));
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
      const fallbackArgs = defaultArgsText(provider);
      const argsSource = argsText.trim() || fallbackArgs;
      const parsedArgs = argsSource ? argsSource.split(/\s+/) : [];
      const payload: Job = {
        ...job,
        provider,
        model: job.model || undefined,
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
              {!builderEditable && !isNight && (
                <div className="schedule-builder-note">
                  {t("edit.field.builder.unsupported")}
                </div>
              )}
              {isNight ? (
                <div className="schedule-builder-row schedule-builder-controls">
                  <span className="schedule-builder-label">
                    {t("edit.field.builder.nightWindow")}
                  </span>
                  <label>
                    {t("edit.field.builder.interval")}
                    <select
                      value={nightInterval ?? 60}
                      onChange={(e) =>
                        update("schedule", {
                          cron: buildNightCron(Number(e.target.value)),
                        })
                      }
                    >
                      {NIGHT_INTERVAL_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {t(`edit.field.builder.intervalOption.${m}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <>
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
                </>
              )}
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
        <div className="row">
          <label>
            {t("edit.field.provider")}{" "}
            <span className="cron-hint">({t("edit.field.providerHint")})</span>
            <select
              value={provider}
              onChange={(e) => changeProvider(e.target.value as Provider)}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {t(`providers.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("edit.field.model")}{" "}
            <span className="cron-hint">({t("edit.field.modelHint")})</span>
            <select
              value={job.model ?? ""}
              onChange={(e) => update("model", e.target.value)}
            >
              {MODELS[provider].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
            <span className="cron-hint">
              (
              {t("edit.field.claudeArgsHint", {
                provider,
                default: defaultArgsText(provider) || t("edit.field.argsNone"),
              })}
              )
            </span>
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
