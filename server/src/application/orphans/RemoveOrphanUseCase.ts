import { ValidationError } from "../../domain/errors.js";
import type { OrphanScanner } from "../../domain/scheduler/OrphanScanner.js";

export type RemoveOrphanDeps = {
  orphans: OrphanScanner;
};

// launchd labels are reverse-DNS strings with restricted characters. We accept
// only the alphabet that real plist labels use, which doubles as a path
// traversal guard: `..` and `/` would let a crafted label escape the
// LaunchAgents / plists directories during file deletion.
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function makeRemoveOrphan(deps: RemoveOrphanDeps) {
  return async (label: string): Promise<void> => {
    if (!label || typeof label !== "string") {
      throw new ValidationError("label is required");
    }
    if (!LABEL_RE.test(label) || label.includes("..")) {
      throw new ValidationError("invalid label format");
    }
    await deps.orphans.removeByLabel(label);
  };
}
