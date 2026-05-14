import type { FolderPicker } from "../../domain/picker/FolderPicker.js";

export type PickFolderDeps = { picker: FolderPicker };

export function makePickFolder(deps: PickFolderDeps) {
  return (): Promise<string> => deps.picker.pick();
}
