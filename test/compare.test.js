import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("boundary matching does not treat token substrings as boundaries", () => {
  for (const key of ["sender", "writer", "rewrite"]) {
    const findings = compareJsonFixture(
      { caseName: key, fileStem: `${key}.json` },
      JSON.stringify({ [key]: "before" }),
      JSON.stringify({ [key]: "after" })
    );

    assert.equal(findings[0].check, "json.value");
    assert.equal(findings[0].severity, "warn");
  }
});

test("exact and multi-token boundary keys classify value drift as failures", () => {
  for (const key of ["send", "side effect", "side-effect"]) {
    const findings = compareJsonFixture(
      { caseName: key, fileStem: `${key}.json` },
      JSON.stringify({ [key]: "before" }),
      JSON.stringify({ [key]: "after" })
    );

    assert.equal(findings[0].check, "json.boundary_value");
    assert.equal(findings[0].severity, "fail");
  }
});

test("added boundary keys and subtrees fail while ordinary additions warn", () => {
  const fixtureCase = { caseName: "added", fileStem: "added.json" };
  const cases = [
    { actual: { approval: "required" }, severity: "fail" },
    { actual: { policy: { send: "allowed" } }, severity: "fail" },
    { actual: { "side effect": "publish" }, severity: "fail" },
    { actual: { "side-effect": "publish" }, severity: "fail" },
    { actual: { metadata: { label: "new" } }, severity: "warn" }
  ];

  for (const { actual, severity } of cases) {
    const findings = compareJsonFixture(fixtureCase, "{}", JSON.stringify(actual));

    assert.equal(findings.length, 1);
    assert.equal(findings[0].check, "json.added_key");
    assert.equal(findings[0].severity, severity);
  }
});

test("array length drift fails when removed or added values contain boundary paths", () => {
  const fixtureCase = { caseName: "nested", fileStem: "nested.json" };
  const removed = compareJsonFixture(
    fixtureCase,
    JSON.stringify({ rules: [{ nested: { approval: "required" } }] }),
    JSON.stringify({ rules: [] })
  );
  const added = compareJsonFixture(
    fixtureCase,
    JSON.stringify({ rules: [] }),
    JSON.stringify({ rules: [[{ "side-effect": "publish" }]] })
  );

  assert.equal(removed[0].check, "json.array_length");
  assert.equal(removed[0].severity, "fail");
  assert.equal(added[0].severity, "fail");
});

test("array length drift under a boundary path fails while ordinary drift warns", () => {
  const fixtureCase = { caseName: "arrays", fileStem: "arrays.json" };
  const boundary = compareJsonFixture(fixtureCase, JSON.stringify({ approval: ["one"] }), JSON.stringify({ approval: [] }));
  const ordinary = compareJsonFixture(fixtureCase, JSON.stringify({ names: ["one"] }), JSON.stringify({ names: [] }));

  assert.equal(boundary[0].severity, "fail");
  assert.equal(ordinary[0].severity, "warn");
});

test("markdown boundary matching ignores substrings but recognizes spaced and hyphenated terms", async (t) => {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-boundaries-"));
  t.after(() => rm(fixtureDir, { recursive: true, force: true }));

  await Promise.all([
    writeFile(path.join(fixtureDir, "words.expected.md"), "Rewrite the sender notes for the writer.\n"),
    writeFile(path.join(fixtureDir, "words.actual.md"), "Rewrite the sender guide for the writer.\n"),
    writeFile(path.join(fixtureDir, "boundary.expected.md"), "Keep side-effect approval.\n"),
    writeFile(path.join(fixtureDir, "boundary.actual.md"), "Change side-effect approval.\n")
  ]);

  const report = await compareFixtures({ fixtureDir });
  assert.ok(report.findings.some((finding) => finding.caseName === "words" && finding.check === "markdown.text"));
  assert.ok(report.findings.some((finding) => finding.caseName === "boundary" && finding.check === "markdown.boundary_text"));
});

test("added markdown boundary lines fail while ordinary token substrings only warn", async (t) => {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-added-markdown-"));
  t.after(() => rm(fixtureDir, { recursive: true, force: true }));

  await Promise.all([
    writeFile(path.join(fixtureDir, "case.expected.md"), "# Plan\n\nRoutine local operation.\n"),
    writeFile(
      path.join(fixtureDir, "case.actual.md"),
      "# Plan\n\nRoutine local operation.\n\nExternal writes are allowed without approval.\n"
    ),
    writeFile(path.join(fixtureDir, "ordinary.expected.md"), "Update the sender notes.\n"),
    writeFile(path.join(fixtureDir, "ordinary.actual.md"), "Update the writer notes.\n")
  ]);

  const report = await compareFixtures({ fixtureDir });
  const added = report.findings.filter((finding) => finding.caseName === "case");
  assert.equal(added.length, 1);
  assert.equal(added[0].check, "markdown.boundary_text");
  assert.equal(added[0].severity, "fail");
  assert.match(added[0].message, /text added/);
  assert.ok(report.findings.some((finding) => finding.caseName === "ordinary" && finding.check === "markdown.text"));
});

test("changed markdown boundary lines produce one failure", async (t) => {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-changed-markdown-"));
  t.after(() => rm(fixtureDir, { recursive: true, force: true }));

  await Promise.all([
    writeFile(path.join(fixtureDir, "case.expected.md"), "External writes require approval.\n"),
    writeFile(path.join(fixtureDir, "case.actual.md"), "External writes need no approval.\n")
  ]);

  const report = await compareFixtures({ fixtureDir });
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].check, "markdown.boundary_text");
  assert.equal(report.findings[0].severity, "fail");
  assert.match(report.findings[0].message, /changed from/);
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

test("cli --fail-on distinguishes ordinary substring warnings from boundary failures", async (t) => {
  const ordinaryDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-ordinary-cli-"));
  const boundaryDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-boundary-cli-"));
  t.after(() => Promise.all([ordinaryDir, boundaryDir].map((dir) => rm(dir, { recursive: true, force: true }))));

  await Promise.all([
    writeFile(path.join(ordinaryDir, "case.expected.json"), JSON.stringify({ sender: "before" })),
    writeFile(path.join(ordinaryDir, "case.actual.json"), JSON.stringify({ sender: "after" })),
    writeFile(
      path.join(boundaryDir, "case.expected.json"),
      JSON.stringify({ rules: [{ nested: { approval: "required" } }] })
    ),
    writeFile(path.join(boundaryDir, "case.actual.json"), JSON.stringify({ rules: [] }))
  ]);

  const ordinaryDefault = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", "--fixtures", ordinaryDir], {
    encoding: "utf8"
  });
  const ordinaryWarn = spawnSync(
    process.execPath,
    ["bin/skill-fixture-diff.js", "--fixtures", ordinaryDir, "--fail-on", "warn"],
    { encoding: "utf8" }
  );
  const boundaryDefault = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", "--fixtures", boundaryDir], {
    encoding: "utf8"
  });

  assert.equal(ordinaryDefault.status, 0);
  assert.equal(ordinaryWarn.status, 1);
  assert.equal(boundaryDefault.status, 1);
});

test("cli defaults fail for boundary additions and --fail-on warn catches ordinary additions", async (t) => {
  const ordinaryDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-added-ordinary-cli-"));
  const boundaryDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-added-boundary-cli-"));
  t.after(() => Promise.all([ordinaryDir, boundaryDir].map((dir) => rm(dir, { recursive: true, force: true }))));

  await Promise.all([
    writeFile(path.join(ordinaryDir, "case.expected.json"), "{}"),
    writeFile(path.join(ordinaryDir, "case.actual.json"), JSON.stringify({ metadata: { label: "new" } })),
    writeFile(path.join(boundaryDir, "case.expected.json"), "{}"),
    writeFile(path.join(boundaryDir, "case.actual.json"), JSON.stringify({ policy: { "side-effect": "publish" } }))
  ]);

  const ordinaryDefault = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", "--fixtures", ordinaryDir], {
    encoding: "utf8"
  });
  const ordinaryWarn = spawnSync(
    process.execPath,
    ["bin/skill-fixture-diff.js", "--fixtures", ordinaryDir, "--fail-on", "warn"],
    { encoding: "utf8" }
  );
  const boundaryDefault = spawnSync(process.execPath, ["bin/skill-fixture-diff.js", "--fixtures", boundaryDir], {
    encoding: "utf8"
  });

  assert.equal(ordinaryDefault.status, 0);
  assert.equal(ordinaryWarn.status, 1);
  assert.equal(boundaryDefault.status, 1);
});

test("cli defaults fail for added and changed markdown boundary lines", async (t) => {
  const addedDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-added-markdown-cli-"));
  const changedDir = await mkdtemp(path.join(tmpdir(), "skill-fixture-diff-changed-markdown-cli-"));
  t.after(() => Promise.all([addedDir, changedDir].map((dir) => rm(dir, { recursive: true, force: true }))));

  await Promise.all([
    writeFile(path.join(addedDir, "case.expected.md"), "Routine local operation.\n"),
    writeFile(path.join(addedDir, "case.actual.md"), "Routine local operation.\nExternal writes are allowed.\n"),
    writeFile(path.join(changedDir, "case.expected.md"), "Publishing requires approval.\n"),
    writeFile(path.join(changedDir, "case.actual.md"), "Publishing needs no approval.\n")
  ]);

  for (const fixtureDir of [addedDir, changedDir]) {
    const result = spawnSync(
      process.execPath,
      ["bin/skill-fixture-diff.js", "--fixtures", fixtureDir, "--format", "json"],
      { encoding: "utf8" }
    );

    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].check, "markdown.boundary_text");
  }
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
