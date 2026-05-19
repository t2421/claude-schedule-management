import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api, type JobWithStatus, type Orphan } from "../api";

export function JobsList() {
  const { t } = useTranslation();
  const [data, setData] = useState<{ jobs: JobWithStatus[]; orphans: Orphan[] } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const nav = useNavigate();

  async function load() {
    try {
      setData(await api.listJobs());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  async function run(name: string) {
    setBusy(name);
    try {
      const r = await api.kickstart(name);
      if (!r.ok) setErr(r.error ?? "kickstart failed");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(name: string) {
    if (!confirm(t("common.deleteConfirm", { name }))) return;
    setBusy(name);
    try {
      await api.deleteJob(name);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeOrphan(label: string) {
    setBusy(label);
    try {
      await api.removeOrphan(label);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <div className="muted">{t("common.loading")}</div>;

  return (
    <>
      <div className="h-row">
        <h2>{t("jobs.title")}</h2>
        <button className="primary" onClick={() => nav("/new")}>
          + {t("nav.newJob")}
        </button>
      </div>
      {err && <div className="error">{err}</div>}
      {data.jobs.length === 0 ? (
        <div className="empty">
          {t("jobs.empty")} <Link to="/new">{t("jobs.emptyCreate")}</Link>.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("jobs.col.name")}</th>
              <th>{t("jobs.col.schedule")}</th>
              <th>{t("jobs.col.status")}</th>
              <th>{t("jobs.col.lastExit")}</th>
              <th>{t("jobs.col.pid")}</th>
              <th style={{ width: 280 }}>{t("jobs.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.name}>
                <td>
                  <Link to={`/jobs/${j.name}`}>{j.name}</Link>
                  {j.description && (
                    <div className="muted" style={{ fontSize: 11 }}>
                      {j.description}
                    </div>
                  )}
                </td>
                <td className="mono">{j.schedule.cron}</td>
                <td>
                  {!j.enabled ? (
                    <span className="badge muted">{t("jobs.status.disabled")}</span>
                  ) : j.status.loaded ? (
                    <span className="badge ok">{t("jobs.status.loaded")}</span>
                  ) : (
                    <span className="badge warn">{t("jobs.status.notLoaded")}</span>
                  )}
                </td>
                <td className="mono">
                  {j.status.lastExitStatus === undefined ? (
                    <span className="muted">—</span>
                  ) : j.status.lastExitStatus === 0 ? (
                    <span className="badge ok">0</span>
                  ) : (
                    <span className="badge err">{j.status.lastExitStatus}</span>
                  )}
                </td>
                <td className="mono">{j.status.pid ?? "—"}</td>
                <td>
                  <div className="toolbar">
                    <button
                      onClick={() => run(j.name)}
                      disabled={busy === j.name || !j.enabled}
                    >
                      {t("jobs.action.runNow")}
                    </button>
                    <button onClick={() => nav(`/jobs/${j.name}/logs`)}>
                      {t("jobs.action.logs")}
                    </button>
                    <button onClick={() => nav(`/jobs/${j.name}`)}>
                      {t("common.edit")}
                    </button>
                    <button className="danger" onClick={() => remove(j.name)}>
                      {t("common.delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data.orphans.length > 0 && (
        <>
          <div className="h-row" style={{ marginTop: 32 }}>
            <h2>
              {t("orphans.title")}{" "}
              <span className="muted" style={{ fontSize: 12 }}>
                {t("orphans.subtitle")}
              </span>
            </h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("orphans.col.label")}</th>
                <th>{t("orphans.col.where")}</th>
                <th>{t("jobs.col.status")}</th>
                <th style={{ width: 200 }}>{t("jobs.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.orphans.map((o) => (
                <tr key={o.label}>
                  <td className="mono">{o.label}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {[o.inAgentsDir && "LaunchAgents", o.inLocalPlists && "plists/"]
                      .filter(Boolean)
                      .join(" + ") || "—"}
                  </td>
                  <td>
                    {o.loaded ? (
                      <span className="badge warn">{t("jobs.status.loaded")}</span>
                    ) : (
                      <span className="badge muted">{t("orphans.notLoaded")}</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="danger"
                      onClick={() => removeOrphan(o.label)}
                      disabled={busy === o.label}
                    >
                      {t("orphans.action.remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
