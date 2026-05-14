import os from "node:os";
import path from "node:path";
import type { Job } from "../../domain/job/Job.js";
import { jobLogsDir, labelFor } from "../../config/paths.js";
import {
  cronToCalendarIntervals,
  type CalendarInterval,
} from "./cronToCalendarInterval.js";

// launchd's default PATH is bare. Inject likely tool locations so claude / yq
// resolve from runner.sh.
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

function xstr(value: string): string { return `<string>${escapeXml(value)}</string>`; }
function xint(value: number): string { return `<integer>${value}</integer>`; }
function xbool(value: boolean): string { return value ? "<true/>" : "<false/>"; }

function xdict(entries: Record<string, string>, indent = 2): string {
  const pad = " ".repeat(indent);
  const inner = Object.entries(entries)
    .map(([k, v]) => `${pad}<key>${escapeXml(k)}</key>\n${pad}${v}`)
    .join("\n");
  return `<dict>\n${inner}\n${" ".repeat(indent - 2)}</dict>`;
}

function calendarIntervalsXml(entries: CalendarInterval[]): string {
  const toDict = (e: CalendarInterval, indent: number) => {
    const d: Record<string, string> = {};
    if (e.Minute !== undefined) d.Minute = xint(e.Minute);
    if (e.Hour !== undefined) d.Hour = xint(e.Hour);
    if (e.Day !== undefined) d.Day = xint(e.Day);
    if (e.Month !== undefined) d.Month = xint(e.Month);
    if (e.Weekday !== undefined) d.Weekday = xint(e.Weekday);
    return xdict(d, indent);
  };
  if (entries.length === 1) return toDict(entries[0], 4);
  const items = entries.map((e) => `    ${toDict(e, 6)}`).join("\n");
  return `<array>\n${items}\n  </array>`;
}

export type PlistBuildContext = {
  runnerPath: string;
};

export class PlistBuilder {
  constructor(private readonly ctx: PlistBuildContext) {}

  build(job: Job): string {
    const label = labelFor(job.name.value);
    const intervals = cronToCalendarIntervals(job.schedule.expression);
    const logsDir = jobLogsDir(job.name.value);

    const programArgs = [this.ctx.runnerPath, job.name.value]
      .map((a) => `    ${xstr(a)}`)
      .join("\n");

    const envEntries: Record<string, string> = {
      PATH: xstr(job.env?.PATH ?? defaultPath()),
    };
    if (job.env) {
      for (const [k, v] of Object.entries(job.env)) {
        envEntries[k] = xstr(v);
      }
    }
    const envBlock = `  <key>EnvironmentVariables</key>\n  ${xdict(envEntries, 4)}\n`;
    const workingDirBlock = job.workingDirectory
      ? `  <key>WorkingDirectory</key>\n  ${xstr(job.workingDirectory)}\n`
      : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  ${xstr(label)}
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>
  <key>StartCalendarInterval</key>
  ${calendarIntervalsXml(intervals)}
  <key>StandardOutPath</key>
  ${xstr(`${logsDir}/launchd-stdout.log`)}
  <key>StandardErrorPath</key>
  ${xstr(`${logsDir}/launchd-stderr.log`)}
${workingDirBlock}${envBlock}  <key>RunAtLoad</key>
  ${xbool(false)}
  <key>AbandonProcessGroup</key>
  ${xbool(true)}
</dict>
</plist>
`;
  }
}
