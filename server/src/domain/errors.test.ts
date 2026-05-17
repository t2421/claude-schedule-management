import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DomainError,
  NotFoundError,
  PickerCancelledError,
  SchedulerError,
  ValidationError,
} from "./errors.js";

describe("DomainError", () => {
  it("is an instance of Error", () => {
    const err = new DomainError("msg");
    assert.ok(err instanceof Error);
  });

  it("preserves message", () => {
    const err = new DomainError("something went wrong");
    assert.equal(err.message, "something went wrong");
  });

  it("sets name to class name", () => {
    const err = new DomainError("msg");
    assert.equal(err.name, "DomainError");
  });
});

describe("ValidationError", () => {
  it("is an instance of DomainError and Error", () => {
    const err = new ValidationError("bad input");
    assert.ok(err instanceof DomainError);
    assert.ok(err instanceof Error);
  });

  it("sets name to ValidationError", () => {
    const err = new ValidationError("bad input");
    assert.equal(err.name, "ValidationError");
  });

  it("preserves message", () => {
    const err = new ValidationError("bad input");
    assert.equal(err.message, "bad input");
  });
});

describe("NotFoundError", () => {
  it("is an instance of DomainError and Error", () => {
    const err = new NotFoundError("job not found");
    assert.ok(err instanceof DomainError);
    assert.ok(err instanceof Error);
  });

  it("sets name to NotFoundError", () => {
    const err = new NotFoundError("job not found");
    assert.equal(err.name, "NotFoundError");
  });

  it("preserves message", () => {
    const err = new NotFoundError("job not found");
    assert.equal(err.message, "job not found");
  });
});

describe("SchedulerError", () => {
  it("is an instance of DomainError and Error", () => {
    const err = new SchedulerError("launchctl failed");
    assert.ok(err instanceof DomainError);
    assert.ok(err instanceof Error);
  });

  it("sets name to SchedulerError", () => {
    const err = new SchedulerError("launchctl failed");
    assert.equal(err.name, "SchedulerError");
  });

  it("preserves message", () => {
    const err = new SchedulerError("launchctl failed");
    assert.equal(err.message, "launchctl failed");
  });
});

describe("PickerCancelledError", () => {
  it("is an instance of DomainError and Error", () => {
    const err = new PickerCancelledError();
    assert.ok(err instanceof DomainError);
    assert.ok(err instanceof Error);
  });

  it("sets name to PickerCancelledError", () => {
    const err = new PickerCancelledError();
    assert.equal(err.name, "PickerCancelledError");
  });

  it("has the fixed message 'picker cancelled'", () => {
    const err = new PickerCancelledError();
    assert.equal(err.message, "picker cancelled");
  });
});
