#!/usr/bin/env node
import { compareFixtures, shouldFail } from "../src/index.js";
import { renderJson, renderMarkdown } from "../src/report.js";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.fixtures) {
  process.stdout.write(`Usage: skill-fixture-diff --fixtures <dir> [--format markdown|json] [--fail-on warn|fail]\n`);
  process.exit(args.help ? 0 : 2);
}

try {
  const report = await compareFixtures({
    fixtureDir: args.fixtures,
    requiredSections: args.requireSection
  });
  process.stdout.write(args.format === "json" ? renderJson(report) : renderMarkdown(report));
  process.exitCode = shouldFail(report, args.failOn) ? 1 : 0;
} catch (error) {
  process.stderr.write(`skill-fixture-diff: ${error.message}\n`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const parsed = {
    format: "markdown",
    failOn: "fail",
    requireSection: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") parsed.help = true;
    else if (token === "--fixtures") parsed.fixtures = argv[++index];
    else if (token === "--format") parsed.format = argv[++index];
    else if (token === "--fail-on") parsed.failOn = argv[++index];
    else if (token === "--require-section") parsed.requireSection.push(argv[++index]);
    else throw new Error(`Unknown option: ${token}`);
  }

  if (!["markdown", "json"].includes(parsed.format)) {
    throw new Error("--format must be markdown or json");
  }
  if (!["warn", "fail"].includes(parsed.failOn)) {
    throw new Error("--fail-on must be warn or fail");
  }

  return parsed;
}
