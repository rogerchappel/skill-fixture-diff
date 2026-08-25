import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SEVERITY_ORDER = { pass: 0, warn: 1, fail: 2 };
const BOUNDARY_TERMS = ["approval", "side effect", "external", "write", "send", "publish"];
const BOUNDARY_TOKEN_SEQUENCES = BOUNDARY_TERMS.map((term) => boundaryTokens(term));

export async function compareFixtures(options) {
  const fixtureDir = options.fixtureDir;
  const requiredSections = options.requiredSections ?? [];
  const cases = await discoverCases(fixtureDir);
  const findings = [];

  if (cases.length === 0) {
    findings.push({
      caseName: null,
      file: null,
      check: "fixture.empty",
      severity: "fail",
      message: "No discoverable fixture pairs found."
    });
  }

  for (const fixtureCase of cases) {
    if (!fixtureCase.expected || !fixtureCase.actual) {
      findings.push({
        caseName: fixtureCase.caseName,
        file: fixtureCase.fileStem,
        check: "fixture.pair",
        severity: "fail",
        message: `Missing ${fixtureCase.expected ? "actual" : "expected"} fixture pair.`
      });
      continue;
    }

    const expected = await readFile(fixtureCase.expected, "utf8");
    const actual = await readFile(fixtureCase.actual, "utf8");
    if (fixtureCase.kind === "json") {
      findings.push(...compareJsonFixture(fixtureCase, expected, actual));
    } else {
      findings.push(...compareMarkdownFixture(fixtureCase, expected, actual, requiredSections));
    }
  }

  return {
    summary: summarize(findings),
    findings,
    cases: cases.map(({ caseName, kind, fileStem }) => ({ caseName, kind, fileStem }))
  };
}

export async function discoverCases(fixtureDir) {
  const entries = await readdir(fixtureDir, { withFileTypes: true });
  const fixtures = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^(?<caseName>.+)\.(?<side>expected|actual)\.(?<kind>md|json)$/);
    if (!match?.groups) continue;
    const { caseName, side, kind } = match.groups;
    const fileStem = `${caseName}.${kind}`;
    const key = `${caseName}:${kind}`;
    const current = fixtures.get(key) ?? { caseName, kind, fileStem };
    current[side] = path.join(fixtureDir, entry.name);
    fixtures.set(key, current);
  }

  return [...fixtures.values()].sort((a, b) => a.fileStem.localeCompare(b.fileStem));
}

export function compareMarkdownFixture(fixtureCase, expected, actual, requiredSections = []) {
  const findings = [];
  const expectedHeadings = headingSet(expected);
  const actualHeadings = headingSet(actual);

  for (const section of requiredSections) {
    if (!actualHeadings.has(normalizeHeading(section))) {
      findings.push(finding(fixtureCase, "markdown.required_section", "fail", `Missing required section "${section}".`));
    }
  }

  for (const heading of expectedHeadings) {
    if (!actualHeadings.has(heading)) {
      findings.push(finding(fixtureCase, "markdown.heading", "warn", `Expected heading disappeared: ${heading}.`));
    }
  }

  const expectedBoundaryLines = boundaryLines(expected);
  const actualBoundaryLines = boundaryLines(actual);
  const removedBoundaryLines = unmatchedOccurrences(expectedBoundaryLines, actualBoundaryLines);
  const addedBoundaryLines = unmatchedOccurrences(actualBoundaryLines, expectedBoundaryLines);
  const changedBoundaryCount = Math.min(removedBoundaryLines.length, addedBoundaryLines.length);

  for (let index = 0; index < changedBoundaryCount; index += 1) {
    findings.push(
      finding(
        fixtureCase,
        "markdown.boundary_text",
        "fail",
        `Boundary or approval text changed from "${removedBoundaryLines[index]}" to "${addedBoundaryLines[index]}".`
      )
    );
  }
  for (const line of removedBoundaryLines.slice(changedBoundaryCount)) {
    findings.push(finding(fixtureCase, "markdown.boundary_text", "fail", `Boundary or approval text removed: "${line}".`));
  }
  for (const line of addedBoundaryLines.slice(changedBoundaryCount)) {
    findings.push(finding(fixtureCase, "markdown.boundary_text", "fail", `Boundary or approval text added: "${line}".`));
  }

  if (findings.length === 0 && normalizeText(expected) !== normalizeText(actual)) {
    findings.push(finding(fixtureCase, "markdown.text", "warn", "Markdown content changed after normalization."));
  }

  return findings;
}

export function compareJsonFixture(fixtureCase, expectedText, actualText) {
  try {
    const expected = JSON.parse(expectedText);
    const actual = JSON.parse(actualText);
    return compareJsonValue(expected, actual, "$").map((item) => ({
      ...item,
      caseName: fixtureCase.caseName,
      file: fixtureCase.fileStem
    }));
  } catch (error) {
    return [finding(fixtureCase, "json.parse", "fail", error.message)];
  }
}

function compareJsonValue(expected, actual, pointer) {
  const findings = [];
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return [{ check: "json.type", severity: "fail", message: `${pointer} changed array type.` }];
    }
    if (expected.length !== actual.length) {
      const boundaryDrift =
        boundaryPath(pointer) || [...expected, ...actual].some((value) => containsBoundaryPath(value));
      findings.push({
        check: "json.array_length",
        severity: boundaryDrift ? "fail" : "warn",
        message: `${pointer} length changed from ${expected.length} to ${actual.length}.`
      });
    }
    expected.forEach((value, index) => {
      if (index < actual.length) findings.push(...compareJsonValue(value, actual[index], `${pointer}[${index}]`));
    });
    return findings;
  }

  if (isObject(expected) || isObject(actual)) {
    if (!isObject(expected) || !isObject(actual)) {
      return [{ check: "json.type", severity: "fail", message: `${pointer} changed object type.` }];
    }
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) {
        findings.push({ check: "json.missing_key", severity: "fail", message: `${pointer}.${key} is missing.` });
      } else {
        findings.push(...compareJsonValue(expected[key], actual[key], `${pointer}.${key}`));
      }
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) {
        const addedPointer = `${pointer}.${key}`;
        const boundaryAddition = boundaryPath(addedPointer) || containsBoundaryPath(actual[key]);
        findings.push({
          check: "json.added_key",
          severity: boundaryAddition ? "fail" : "warn",
          message: `${addedPointer} was added.`
        });
      }
    }
    return findings;
  }

  if (typeof expected !== typeof actual) {
    return [{ check: "json.type", severity: "fail", message: `${pointer} changed from ${typeof expected} to ${typeof actual}.` }];
  }

  if (expected !== actual) {
    findings.push({
      check: boundaryPath(pointer) ? "json.boundary_value" : "json.value",
      severity: boundaryPath(pointer) ? "fail" : "warn",
      message: `${pointer} changed from ${JSON.stringify(expected)} to ${JSON.stringify(actual)}.`
    });
  }

  return findings;
}

export function shouldFail(report, failOn = "fail") {
  return report.findings.some((item) => SEVERITY_ORDER[item.severity] >= SEVERITY_ORDER[failOn]);
}

function summarize(findings) {
  return findings.reduce(
    (summary, item) => {
      summary[item.severity] += 1;
      return summary;
    },
    { pass: findings.length === 0 ? 1 : 0, warn: 0, fail: 0 }
  );
}

function finding(fixtureCase, check, severity, message) {
  return { caseName: fixtureCase.caseName, file: fixtureCase.fileStem, check, severity, message };
}

function headingSet(markdown) {
  return new Set(
    markdownLinesOutsideFences(markdown)
      .map((line) => atxHeading(line))
      .filter((heading) => heading !== undefined)
      .map((heading) => normalizeHeading(heading))
  );
}

function boundaryLines(markdown) {
  return markdownLinesOutsideFences(markdown)
    .filter((line) => atxHeading(line) === undefined)
    .map((line) => normalizeText(line.replace(/^[-*]\s+/, "")))
    .filter((line) => containsBoundaryTerm(line));
}

function atxHeading(line) {
  const match = line.match(/^ {0,3}#{1,6}(?:[ \t]+|$)(.*)$/);
  if (!match) return undefined;
  return match[1].replace(/[ \t]+#+[ \t]*$/, "");
}

function unmatchedOccurrences(lines, comparisonLines) {
  const remainingCounts = new Map();
  for (const line of comparisonLines) {
    remainingCounts.set(line, (remainingCounts.get(line) ?? 0) + 1);
  }

  return lines.filter((line) => {
    const remaining = remainingCounts.get(line) ?? 0;
    if (remaining === 0) return true;
    remainingCounts.set(line, remaining - 1);
    return false;
  });
}

function markdownLinesOutsideFences(markdown) {
  const lines = [];
  let fence;

  for (const line of markdown.split(/\r\n|\n|\r/)) {
    if (fence) {
      const closingFence = line.match(/^ {0,3}(`+|~+)\s*$/);
      if (closingFence && closingFence[1][0] === fence.marker && closingFence[1].length >= fence.length) {
        fence = undefined;
      }
      continue;
    }

    const openingFence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (openingFence && !(openingFence[1][0] === "`" && openingFence[2].includes("`"))) {
      fence = { marker: openingFence[1][0], length: openingFence[1].length };
      continue;
    }

    lines.push(line);
  }

  return lines;
}

function normalizeHeading(value) {
  return normalizeText(value).replace(/:$/, "");
}

function normalizeText(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundaryPath(pointer) {
  return containsBoundaryTerm(pointer);
}

function containsBoundaryPath(value) {
  if (Array.isArray(value)) return value.some((item) => containsBoundaryPath(item));
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, nestedValue]) => boundaryPath(key) || containsBoundaryPath(nestedValue));
}

function containsBoundaryTerm(value) {
  const tokens = boundaryTokens(value);
  return BOUNDARY_TOKEN_SEQUENCES.some((termTokens) =>
    tokens.some((_, index) => termTokens.every((token, offset) => tokens[index + offset] === token))
  );
}

function boundaryTokens(value) {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}
