export interface FolderPicker {
  // Open a native folder selection dialog. Returns the absolute path of the
  // chosen folder. Throws PickerCancelledError if the user dismisses.
  pick(): Promise<string>;
}
