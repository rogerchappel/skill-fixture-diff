import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { compareFixtures, compareJsonFixture, shouldFail } from "../src/index.js";

test("passing fixtures produce a pass summary", async () => {
  const report = await compareFixtures({
    fixtureDir: "fixtures/pass",
    requiredSections: ["Safety Notes"]
  });

  assert.equal(report.summary.pass, 1);
  assert.equal(report.summary.warn, 0);
  assert.equal(report.summary.fail, 0);
  assert.equal(shouldFail(report), false);
});

test("failing fixtures classify boundary drift as failures", async () => {
  const report = await compareFixtures({
    fixtureDir: "fixtures/fail",
    requiredSections: ["Safety Notes"]
  });

  assert.equal(shouldFail(report), true);
  assert.ok(report.findings.some((finding) => finding.check === "markdown.required_section"));
  assert.ok(report.findings.some((finding) => finding.check === "json.boundary_value"));
});

test("hyphenated boundary keys classify value drift as failures", () => {
  const findings = compareJsonFixture(
    { caseName: "hyphenated", fileStem: "hyphenated.json" },
    JSON.stringify({ "side-effect": "approval required" }),
    JSON.stringify({ "side-effect": "auto publish" })
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].check, "json.boundary_value");
  assert.equal(findings[0].severity, "fail");
});

test("empty fixture directories produce an explicit failure", async (t) => {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-empty-"));
  t.after(() => rm(fixtureDir, { recursive: true, force: true }));

  const report = await compareFixtures({ fixtureDir });

  assert.deepEqual(report.cases, []);
  assert.equal(report.summary.pass, 0);
  assert.equal(report.summary.fail, 1);
  assert.equal(report.findings[0].check, "fixture.empty");
  assert.equal(shouldFail(report), true);
});

test("cli exits zero for pass fixtures", () => {
  const result = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", "--fixtures", "fixtures/pass"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No drift found/);
});

test("cli exits non-zero for fail fixtures", () => {
  const result = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", "--fixtures", "fixtures/fail", "--format", "json"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.summary.fail > 0);
});

test("cli exits non-zero for empty fixture directories", async (t) => {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-empty-cli-"));
  t.after(() => rm(fixtureDir, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", "--fixtures", fixtureDir, "--format", "json"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.summary.pass, 0);
  assert.equal(parsed.findings[0].check, "fixture.empty");
});

test("cli help exits zero and prints usage", () => {
  const result = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", "--help"], { encoding: "utf8" });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Usage: skill-fixture-diff/);
  assert.equal(result.stderr, "");
});

for (const testCase of [
  { name: "an unknown option", args: ["--bogus"], diagnostic: "Unknown option: --bogus" },
  { name: "a missing --fixtures value", args: ["--fixtures"], diagnostic: "--fixtures requires a value" },
  { name: "a missing --format value", args: ["--format"], diagnostic: "--format requires a value" },
  { name: "a missing --fail-on value", args: ["--fail-on"], diagnostic: "--fail-on requires a value" },
  {
    name: "a missing --require-section value",
    args: ["--require-section"],
    diagnostic: "--require-section requires a value"
  },
  { name: "an invalid --format value", args: ["--format", "xml"], diagnostic: "--format must be markdown or json" },
  { name: "an invalid --fail-on value", args: ["--fail-on", "error"], diagnostic: "--fail-on must be warn or fail" }
]) {
  test(`cli reports ${testCase.name} as a usage error`, () => {
    const result = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", ...testCase.args], { encoding: "utf8" });

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, new RegExp(`^skill-fixture-diff: ${testCase.diagnostic}`));
    assert.match(result.stderr, /\nUsage: skill-fixture-diff/);
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  });
}
