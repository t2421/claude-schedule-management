import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  return (
    <div className="lang-switch">
      <label htmlFor="lang">{t("nav.language")}</label>
      <select
        id="lang"
        value={i18n.resolvedLanguage ?? "en"}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
