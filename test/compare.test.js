import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { compareFixtures, shouldFail } from "../src/index.js";

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
