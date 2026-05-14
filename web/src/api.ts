export type Job = {
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { cron: string };
  working_directory?: string;
  prompt: string;
  claude_args?: string[];
  env?: Record<string, string>;
  timeout_seconds?: number;
};

export type JobStatus = {
  name: string;
  loaded: boolean;
  pid?: number;
  lastExitStatus?: number;
};

export type JobWithStatus = Job & { status: JobStatus };

export type LogFile = { file: string; size: number; mtime: string };

const BASE = "/api";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listJobs: () =>
    http<{ jobs: JobWithStatus[]; orphans: string[] }>("/jobs"),
  getJob: (name: string) =>
    http<{ job: Job; status: JobStatus }>(`/jobs/${name}`),
  saveJob: (name: string, job: Job) =>
    http<{ ok: boolean }>(`/jobs/${name}`, {
      method: "PUT",
      body: JSON.stringify(job),
    }),
  deleteJob: (name: string) =>
    http<{ ok: boolean }>(`/jobs/${name}`, { method: "DELETE" }),
  applyJob: (name: string) =>
    http<{ ok: boolean }>(`/jobs/${name}/apply`, { method: "POST" }),
  removeOrphan: (name: string) =>
    http<{ ok: boolean }>(`/jobs/orphans/${name}/remove`, { method: "POST" }),
  kickstart: (name: string) =>
    http<{ ok: boolean; error?: string }>(`/runs/${name}/kickstart`, {
      method: "POST",
    }),
  listLogFiles: (name: string) =>
    http<{ files: LogFile[] }>(`/logs/${name}`),
  readLog: async (name: string, file: string, tail?: number) => {
    const q = tail ? `?tail=${tail}` : "";
    const res = await fetch(`${BASE}/logs/${name}/${file}${q}`);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.text();
  },
  pickFolder: () =>
    http<{ ok: boolean; path?: string; error?: string }>("/picker/folder", {
      method: "POST",
    }),
};
