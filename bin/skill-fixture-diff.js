#!/usr/bin/env node
import { compareFixtures, shouldFail } from "../src/index.js";
import { renderJson, renderMarkdown } from "../src/report.js";

const usage = "Usage: skill-fixture-diff --fixtures <dir> [--format markdown|json] [--fail-on warn|fail] [--require-section <name>]";

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`skill-fixture-diff: ${error.message}\n${usage}\n`);
  process.exit(2);
}

if (args.help || !args.fixtures) {
  if (args.help) {
    process.stdout.write(`${usage}\n`);
    process.exit(0);
  }
  process.stderr.write(`skill-fixture-diff: --fixtures is required\n${usage}\n`);
  process.exit(2);
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
    else if (token === "--fixtures") parsed.fixtures = readOptionValue(argv, ++index, token);
    else if (token === "--format") parsed.format = readOptionValue(argv, ++index, token);
    else if (token === "--fail-on") parsed.failOn = readOptionValue(argv, ++index, token);
    else if (token === "--require-section") parsed.requireSection.push(readOptionValue(argv, ++index, token));
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

function readOptionValue(argv, index, option) {
  const value = argv[index];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}
