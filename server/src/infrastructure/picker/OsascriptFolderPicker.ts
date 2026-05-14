import { PickerCancelledError } from "../../domain/errors.js";
import type { FolderPicker } from "../../domain/picker/FolderPicker.js";
import { run } from "../shell/processRunner.js";

export class OsascriptFolderPicker implements FolderPicker {
  async pick(): Promise<string> {
    const script = `POSIX path of (choose folder with prompt "Working directory")`;
    const r = await run("osascript", ["-e", script]);
    if (r.code === 0) {
      return r.stdout.trim().replace(/\/$/, "");
    }
    if (/canceled|cancelled/i.test(r.stderr)) {
      throw new PickerCancelledError();
    }
    throw new Error(r.stderr.trim() || `osascript exit ${r.code}`);
  }
}
