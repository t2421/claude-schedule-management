import { useTranslation } from "react-i18next";
import { NavLink, Route, Routes } from "react-router-dom";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { JobsList } from "./pages/JobsList";
import { JobEdit } from "./pages/JobEdit";
import { LogViewer } from "./pages/LogViewer";

export function App() {
  const { t } = useTranslation();
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>{t("app.title")}</h1>
        <nav>
          <NavLink to="/" end>{t("nav.jobs")}</NavLink>
          <NavLink to="/new">{t("nav.newJob")}</NavLink>
        </nav>
        <div className="sidebar-footer">
          <LanguageSwitcher />
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<JobsList />} />
          <Route path="/new" element={<JobEdit mode="new" />} />
          <Route path="/jobs/:name" element={<JobEdit mode="edit" />} />
          <Route path="/jobs/:name/logs" element={<LogViewer />} />
        </Routes>
      </main>
    </div>
  );
}
