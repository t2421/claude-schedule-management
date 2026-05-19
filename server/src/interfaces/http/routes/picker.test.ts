import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickerRoutes } from "./picker.js";
import { PickerCancelledError } from "../../../domain/errors.js";
import type { Composition } from "../../../composition.js";

function makeComposition(
  pickFolderFn: () => Promise<string> = async () => "/chosen/path",
): Composition {
  return { useCases: { pickFolder: pickFolderFn } } as unknown as Composition;
}

describe("pickerRoutes", () => {
  describe("POST /folder", () => {
    it("returns ok:true and the chosen path", async () => {
      const app = pickerRoutes(makeComposition(async () => "/home/user/project"));

      const res = await app.request("/folder", { method: "POST" });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean; path: string };
      assert.equal(body.ok, true);
      assert.equal(body.path, "/home/user/project");
    });

    it("returns ok:false with error 'cancelled' when user cancels the picker", async () => {
      const app = pickerRoutes(
        makeComposition(async () => {
          throw new PickerCancelledError();
        }),
      );

      const res = await app.request("/folder", { method: "POST" });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.equal(body.error, "cancelled");
    });

    it("returns 500 for unexpected errors", async () => {
      const app = pickerRoutes(
        makeComposition(async () => {
          throw new Error("osascript failed");
        }),
      );

      const res = await app.request("/folder", { method: "POST" });

      assert.equal(res.status, 500);
    });
  });
});
