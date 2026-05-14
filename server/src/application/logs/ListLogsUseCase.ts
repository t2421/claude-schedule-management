import type { JobName } from "../../domain/job/JobName.js";
import type { LogFile, LogReader } from "../../domain/logs/LogReader.js";

export type ListLogsDeps = { logs: LogReader };

export function makeListLogs(deps: ListLogsDeps) {
  return async (name: JobName): Promise<LogFile[]> => deps.logs.list(name);
}
