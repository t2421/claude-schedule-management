import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Job } from "../api";

type Props = { mode: "new" | "edit" };

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
    () =>
      PRESET_DEFS.map((p) => ({ label: t(`presets.${p.key}`), value: p.value })),
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

  const presetMatch =
    presets.find((p) => p.value === job.schedule.cron)?.value ?? "";
  const permissionPresetMatch =
    permissionPresets.find((p) => p.value === argsText.trim())?.value ?? "";

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
                  if (e.target.value) update("schedule", { cron: e.target.value });
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
