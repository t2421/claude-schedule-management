import os from "node:os";
import path from "node:path";
import { cronToCalendarIntervals } from "./cron-to-cal.js";
import { RUNNER, jobLogsDirFor, labelFor } from "./paths.js";
import type { Job } from "./types.js";

// launchd's default PATH is bare. Inject likely tool locations so claude and
// yq can be found from runner.sh.
function defaultPath(): string {
  const home = os.homedir();
  return [
    path.join(home, ".local/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlString(value: string): string {
  return `<string>${escapeXml(value)}</string>`;
}

function xmlInt(value: number): string {
  return `<integer>${value}</integer>`;
}

function xmlBool(value: boolean): string {
  return value ? "<true/>" : "<false/>";
}

function xmlDict(entries: Record<string, string>, indent = 2): string {
  const pad = " ".repeat(indent);
  const inner = Object.entries(entries)
    .map(([k, v]) => `${pad}<key>${escapeXml(k)}</key>\n${pad}${v}`)
    .join("\n");
  return `<dict>\n${inner}\n${" ".repeat(indent - 2)}</dict>`;
}

function xmlCalIntervals(entries: ReturnType<typeof cronToCalendarIntervals>): string {
  if (entries.length === 1) {
    const e = entries[0];
    const dict: Record<string, string> = {};
    if (e.Minute !== undefined) dict.Minute = xmlInt(e.Minute);
    if (e.Hour !== undefined) dict.Hour = xmlInt(e.Hour);
    if (e.Day !== undefined) dict.Day = xmlInt(e.Day);
    if (e.Month !== undefined) dict.Month = xmlInt(e.Month);
    if (e.Weekday !== undefined) dict.Weekday = xmlInt(e.Weekday);
    return xmlDict(dict, 4);
  }
  const items = entries
    .map((e) => {
      const dict: Record<string, string> = {};
      if (e.Minute !== undefined) dict.Minute = xmlInt(e.Minute);
      if (e.Hour !== undefined) dict.Hour = xmlInt(e.Hour);
      if (e.Day !== undefined) dict.Day = xmlInt(e.Day);
      if (e.Month !== undefined) dict.Month = xmlInt(e.Month);
      if (e.Weekday !== undefined) dict.Weekday = xmlInt(e.Weekday);
      return `    ${xmlDict(dict, 6)}`;
    })
    .join("\n");
  return `<array>\n${items}\n  </array>`;
}

export function buildPlist(job: Job): string {
  const label = labelFor(job.name);
  const logsDir = jobLogsDirFor(job.name);
  const intervals = cronToCalendarIntervals(job.schedule.cron);

  const programArgs = [RUNNER, job.name]
    .map((a) => `    ${xmlString(a)}`)
    .join("\n");

  const envEntries: Record<string, string> = {
    PATH: xmlString(job.env?.PATH ?? defaultPath()),
  };
  if (job.env) {
    for (const [k, v] of Object.entries(job.env)) {
      envEntries[k] = xmlString(v);
    }
  }
  const envBlock = `  <key>EnvironmentVariables</key>\n  ${xmlDict(envEntries, 4)}\n`;

  const workingDirBlock = job.working_directory
    ? `  <key>WorkingDirectory</key>\n  ${xmlString(job.working_directory)}\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  ${xmlString(label)}
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>
  <key>StartCalendarInterval</key>
  ${xmlCalIntervals(intervals)}
  <key>StandardOutPath</key>
  ${xmlString(`${logsDir}/launchd-stdout.log`)}
  <key>StandardErrorPath</key>
  ${xmlString(`${logsDir}/launchd-stderr.log`)}
${workingDirBlock}${envBlock}  <key>RunAtLoad</key>
  ${xmlBool(false)}
  <key>AbandonProcessGroup</key>
  ${xmlBool(true)}
</dict>
</plist>
`;
}
