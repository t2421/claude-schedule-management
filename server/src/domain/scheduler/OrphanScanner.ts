import type { Orphan } from "./Orphan.js";

export interface OrphanScanner {
  // Find scheduler artifacts that belong to this tool but have no job in the
  // given set of known names.
  scan(knownJobNames: Set<string>): Promise<Orphan[]>;

  // Remove the scheduler artifacts for the given full label.
  removeByLabel(label: string): Promise<void>;
}
