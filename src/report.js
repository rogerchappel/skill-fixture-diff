export function renderMarkdown(report) {
  const lines = [
    "# Skill Fixture Diff Report",
    "",
    `Summary: ${report.summary.fail} fail, ${report.summary.warn} warn, ${report.summary.pass} pass`,
    ""
  ];

  if (report.findings.length === 0) {
    lines.push("No drift found.");
    return `${lines.join("\n")}\n`;
  }

  for (const finding of report.findings) {
    lines.push(`- **${finding.severity.toUpperCase()}** ${finding.caseName} (${finding.file}) [${finding.check}]: ${finding.message}`);
  }

  return `${lines.join("\n")}\n`;
}

export function renderJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
