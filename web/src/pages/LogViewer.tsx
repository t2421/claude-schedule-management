import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api, type LogFile } from "../api";

export function LogViewer() {
  const { t } = useTranslation();
  const { name } = useParams<{ name: string }>();
  const [files, setFiles] = useState<LogFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (!name) return;
    api
      .listLogFiles(name)
      .then(({ files }) => {
        setFiles(files);
        if (files.length && !selected) setSelected(files[0].file);
      })
      .catch((e) => setErr((e as Error).message));
  }, [name]);

  useEffect(() => {
    if (!name || !selected) return;
    let cancel = false;
    async function tick() {
      try {
        const text = await api.readLog(name!, selected!, 200_000);
        if (!cancel) setContent(text);
      } catch (e) {
        if (!cancel) setErr((e as Error).message);
      }
    }
    tick();
    if (!follow) return;
    const id = setInterval(tick, 2000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [name, selected, follow]);

  return (
    <>
      <div className="h-row">
        <h2>
          <Link to="/">{t("jobs.title")}</Link> / {name} / {t("logs.breadcrumb")}
        </h2>
        <div className="toolbar">
          <label
            className="check"
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}
          >
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
            />
            {t("logs.autoRefresh")}
          </label>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      {files.length === 0 ? (
        <div className="empty">{t("logs.empty", { name })}</div>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <select
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="mono"
              style={{
                background: "var(--bg)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 10px",
              }}
            >
              {files.map((f) => (
                <option key={f.file} value={f.file}>
                  {f.file} ({t("logs.sizeKB", { size: (f.size / 1024).toFixed(1) })})
                </option>
              ))}
            </select>
          </div>
          <pre className="log">{content || t("common.empty")}</pre>
        </>
      )}
    </>
  );
}
