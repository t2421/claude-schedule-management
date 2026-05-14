import type { JobName } from "../../domain/job/JobName.js";
import type { LogReader } from "../../domain/logs/LogReader.js";

export type ReadLogDeps = { logs: LogReader };

export function makeReadLog(deps: ReadLogDeps) {
  return (name: JobName, file: string, tailBytes?: number): Promise<string> =>
    deps.logs.read(name, file, tailBytes);
}
