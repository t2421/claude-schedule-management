// Composition root. The only place in the codebase that wires concrete
// implementations to interfaces. Everything below depends on abstractions;
// this file knows the concrete map.

import { JOBS_DIR, RUNNER } from "./config/paths.js";
import { makeApplyJob } from "./application/jobs/ApplyJobUseCase.js";
import { makeDeleteJob } from "./application/jobs/DeleteJobUseCase.js";
import { makeGetJob } from "./application/jobs/GetJobUseCase.js";
import { makeListJobs } from "./application/jobs/ListJobsUseCase.js";
import { makeSaveJob } from "./application/jobs/SaveJobUseCase.js";
import { makeListLogs } from "./application/logs/ListLogsUseCase.js";
import { makeReadLog } from "./application/logs/ReadLogUseCase.js";
import { makeRemoveOrphan } from "./application/orphans/RemoveOrphanUseCase.js";
import { makePickFolder } from "./application/picker/PickFolderUseCase.js";
import { makeKickstartJob } from "./application/runs/KickstartJobUseCase.js";

import { FileLogReader } from "./infrastructure/logs/FileLogReader.js";
import { YamlJobRepository } from "./infrastructure/persistence/YamlJobRepository.js";
import { OsascriptFolderPicker } from "./infrastructure/picker/OsascriptFolderPicker.js";
import { LaunchdOrphanScanner } from "./infrastructure/scheduler/LaunchdOrphanScanner.js";
import { LaunchdScheduler } from "./infrastructure/scheduler/LaunchdScheduler.js";
import { PlistBuilder } from "./infrastructure/scheduler/PlistBuilder.js";

export type Composition = ReturnType<typeof compose>;

export function compose() {
  // Infrastructure
  const jobs = new YamlJobRepository(JOBS_DIR);
  const plistBuilder = new PlistBuilder({ runnerPath: RUNNER });
  const scheduler = new LaunchdScheduler(plistBuilder);
  const orphans = new LaunchdOrphanScanner();
  const picker = new OsascriptFolderPicker();
  const logs = new FileLogReader();

  // Use cases — explicit dependency injection, no global container.
  const useCases = {
    listJobs: makeListJobs({ jobs, scheduler, orphans }),
    getJob: makeGetJob({ jobs, scheduler }),
    saveJob: makeSaveJob({ jobs, scheduler }),
    deleteJob: makeDeleteJob({ jobs, scheduler }),
    applyJob: makeApplyJob({ jobs, scheduler }),
    kickstartJob: makeKickstartJob({ jobs, scheduler }),
    removeOrphan: makeRemoveOrphan({ orphans }),
    listLogs: makeListLogs({ logs }),
    readLog: makeReadLog({ logs }),
    pickFolder: makePickFolder({ picker }),
  } as const;

  return { useCases };
}
