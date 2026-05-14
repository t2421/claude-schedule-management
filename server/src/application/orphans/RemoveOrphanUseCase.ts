import { ValidationError } from "../../domain/errors.js";
import type { OrphanScanner } from "../../domain/scheduler/OrphanScanner.js";

export type RemoveOrphanDeps = {
  orphans: OrphanScanner;
};

export function makeRemoveOrphan(deps: RemoveOrphanDeps) {
  return async (label: string): Promise<void> => {
    if (!label || typeof label !== "string") {
      throw new ValidationError("label is required");
    }
    await deps.orphans.removeByLabel(label);
  };
}
