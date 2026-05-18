import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OsascriptFolderPicker } from "./OsascriptFolderPicker.js";
import { PickerCancelledError } from "../../domain/errors.js";
import type { RunResult } from "../shell/processRunner.js";

function makeRunner(result: RunResult) {
  return (_cmd: string, _args: string[]) => Promise.resolve(result);
}

describe("OsascriptFolderPicker.pick", () => {
  it("returns trimmed path without trailing slash on success", async () => {
    const picker = new OsascriptFolderPicker(
      makeRunner({ code: 0, stdout: "/Users/x/projects/\n", stderr: "" }),
    );
    assert.equal(await picker.pick(), "/Users/x/projects");
  });

  it("removes only the trailing slash (not an interior one)", async () => {
    const picker = new OsascriptFolderPicker(
      makeRunner({ code: 0, stdout: "/Users/x/my-project", stderr: "" }),
    );
    assert.equal(await picker.pick(), "/Users/x/my-project");
  });

  it("returns a single slash root path as-is", async () => {
    const picker = new OsascriptFolderPicker(
      makeRunner({ code: 0, stdout: "/\n", stderr: "" }),
    );
    assert.equal(await picker.pick(), "");
  });

  it('throws PickerCancelledError when stderr contains "canceled" (US spelling)', async () => {
    const picker = new OsascriptFolderPicker(
      makeRunner({ code: 1, stdout: "", stderr: "User canceled." }),
    );
    await assert.rejects(() => picker.pick(), PickerCancelledError);
  });

  it('throws PickerCancelledError when stderr contains "cancelled" (British spelling)', async () => {
    const picker = new OsascriptFolderPicker(
      makeRunner({ code: 1, stdout: "", stderr: "User cancelled." }),
    );
    await assert.rejects(() => picker.pick(), PickerCancelledError);
  });

  it("throws Error with stderr message for non-cancel failures", async () => {
    const picker = new OsascriptFolderPicker(
      makeRunner({ code: 1, stdout: "", stderr: "execution error: -10000" }),
    );
    await assert.rejects(() => picker.pick(), /execution error: -10000/);
  });

  it("falls back to 'osascript exit <code>' when stderr is empty on failure", async () => {
    const picker = new OsascriptFolderPicker(
      makeRunner({ code: 127, stdout: "", stderr: "" }),
    );
    await assert.rejects(() => picker.pick(), /osascript exit 127/);
  });
});
