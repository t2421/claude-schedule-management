// An "orphan" is a scheduler artifact (loaded service, plist file) that
// belongs to this tool (i.e. references our runner) but has no corresponding
// job in the repository.
export type Orphan = {
  name: string;        // job name extracted from artifact if available
  label: string;       // full launchd label
  loaded: boolean;
  inAgentsDir: boolean;
  inLocalPlists: boolean;
};
