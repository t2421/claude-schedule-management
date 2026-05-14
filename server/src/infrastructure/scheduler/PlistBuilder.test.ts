import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { PlistBuilder } from "./PlistBuilder.js";
import { Job } from "../../domain/job/Job.js";
import { jobLogsDir, labelFor } from "../../config/paths.js";

const RUNNER = "/repo/bin/runner.sh";

function buildJob(overrides: Record<string, unknown> = {}) {
  return Job.fromPlain({
    name: "daily-review",
    schedule: { cron: "0 9 * * *" },
    prompt: "do the thing",
    enabled: true,
    working_directory: "/Users/x/proj",
    ...overrides,
  });
}

describe("PlistBuilder.build", () => {
  const builder = new PlistBuilder({ runnerPath: RUNNER });

  it("produces a valid XML/plist document header", () => {
    const xml = builder.build(buildJob());
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<!DOCTYPE plist PUBLIC/);
    assert.match(xml, /<plist version="1\.0">/);
    assert.match(xml, /<\/plist>\s*$/);
  });

  it("emits Label derived from job name", () => {
    const xml = builder.build(buildJob());
    const expected = labelFor("daily-review");
    assert.ok(
      xml.includes(`<key>Label</key>\n  <string>${expected}</string>`),
      `expected Label entry for ${expected}`,
    );
  });

  it("includes runner path and job name in ProgramArguments", () => {
    const xml = builder.build(buildJob());
    assert.match(xml, /<key>ProgramArguments<\/key>/);
    assert.ok(xml.includes(`<string>${RUNNER}</string>`));
    assert.ok(xml.includes(`<string>daily-review</string>`));
  });

  it("renders a single CalendarInterval as a dict, not an array", () => {
    const xml = builder.build(buildJob({ schedule: { cron: "0 9 * * *" } }));
    const startBlock = xml.split("<key>StartCalendarInterval</key>")[1];
    assert.ok(startBlock);
    // Single entry should be a <dict>, not wrapped in <array>.
    assert.match(startBlock, /^\s*<dict>/);
    assert.ok(!/<array>[\s\S]*?<dict>[\s\S]*?<key>Minute<\/key>/.test(startBlock));
  });

  it("renders multiple CalendarIntervals inside an <array>", () => {
    const xml = builder.build(buildJob({ schedule: { cron: "0 9,17 * * *" } }));
    const startBlock = xml.split("<key>StartCalendarInterval</key>")[1];
    assert.ok(startBlock);
    assert.match(startBlock, /^\s*<array>/);
    assert.equal(
      (startBlock.match(/<key>Hour<\/key>\s*<integer>(?:9|17)<\/integer>/g) || [])
        .length,
      2,
    );
  });

  it("points stdout/stderr paths under the job logs directory", () => {
    const xml = builder.build(buildJob());
    const logs = jobLogsDir("daily-review");
    assert.ok(
      xml.includes(`<string>${path.join(logs, "launchd-stdout.log")}</string>`),
    );
    assert.ok(
      xml.includes(`<string>${path.join(logs, "launchd-stderr.log")}</string>`),
    );
  });

  it("emits WorkingDirectory entry with the job's path", () => {
    const xml = builder.build(buildJob({ working_directory: "/Users/x/proj" }));
    assert.match(
      xml,
      /<key>WorkingDirectory<\/key>\s*<string>\/Users\/x\/proj<\/string>/,
    );
  });

  it("sets RunAtLoad=false and AbandonProcessGroup=true", () => {
    const xml = builder.build(buildJob());
    assert.match(xml, /<key>RunAtLoad<\/key>\s*<false\/>/);
    assert.match(xml, /<key>AbandonProcessGroup<\/key>\s*<true\/>/);
  });

  it("injects a default PATH when env.PATH is not provided", () => {
    const xml = builder.build(buildJob());
    const envBlock = xml.split("<key>EnvironmentVariables</key>")[1];
    assert.ok(envBlock);
    // Should reference common tool locations.
    assert.match(
      envBlock,
      /<key>PATH<\/key>\s*<string>[^<]*\/usr\/local\/bin[^<]*<\/string>/,
    );
    assert.match(envBlock, /\/opt\/homebrew\/bin/);
  });

  it("uses env.PATH when the job supplies one", () => {
    const xml = builder.build(
      buildJob({ env: { PATH: "/custom/bin:/usr/bin", FOO: "bar" } }),
    );
    assert.match(xml, /<key>PATH<\/key>\s*<string>\/custom\/bin:\/usr\/bin<\/string>/);
    assert.match(xml, /<key>FOO<\/key>\s*<string>bar<\/string>/);
  });

  it("escapes XML metacharacters in env values", () => {
    // Job validation bans newline / NUL in env values but allows < > & ".
    const xml = builder.build(buildJob({ env: { CFG: `a&b<c>d"e` } }));
    assert.ok(xml.includes(`<string>a&amp;b&lt;c&gt;d&quot;e</string>`));
    // And the raw, unescaped value MUST NOT appear.
    assert.ok(!xml.includes(`a&b<c>d"e`));
  });

  it("escapes XML metacharacters in working directory", () => {
    // Pathological but legal absolute path with XML-special chars.
    const xml = builder.build(buildJob({ working_directory: "/home/u&r/<dir>" }));
    assert.ok(xml.includes(`<string>/home/u&amp;r/&lt;dir&gt;</string>`));
    assert.ok(!xml.includes("/home/u&r/<dir>"));
  });
});
