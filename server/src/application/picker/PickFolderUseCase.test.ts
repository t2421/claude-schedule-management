import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makePickFolder } from "./PickFolderUseCase.js";
import { PickerCancelledError } from "../../domain/errors.js";
import type { FolderPicker } from "../../domain/picker/FolderPicker.js";

function makePicker(result: () => Promise<string>): FolderPicker {
  return { pick: result };
}

describe("makePickFolder", () => {
  it("returns the folder path chosen by the picker", async () => {
    const picker = makePicker(async () => "/home/user/projects");
    const pickFolder = makePickFolder({ picker });

    const result = await pickFolder();

    assert.equal(result, "/home/user/projects");
  });

  it("propagates PickerCancelledError when the user dismisses the dialog", async () => {
    const picker = makePicker(async () => {
      throw new PickerCancelledError();
    });
    const pickFolder = makePickFolder({ picker });

    await assert.rejects(() => pickFolder(), PickerCancelledError);
  });

  it("propagates unexpected errors from the picker", async () => {
    const picker = makePicker(async () => {
      throw new Error("osascript crashed");
    });
    const pickFolder = makePickFolder({ picker });

    await assert.rejects(() => pickFolder(), /osascript crashed/);
  });
});
