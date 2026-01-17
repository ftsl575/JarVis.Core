const createEmptyResult = (vendor) => ({
  vendor,
  counts: { error: 0, warn: 0, info: 0 },
  findingsSample: [],
  codes: {},
});

const recordFinding = (result, finding) => {
  const severity = finding.severity || "info";
  result.counts[severity] = (result.counts[severity] || 0) + 1;

  if (!result.codes[finding.code]) {
    result.codes[finding.code] = { severity, count: 0 };
  }
  result.codes[finding.code].count += 1;
};

const runVendorValidation = (validator, items, options = {}) => {
  const result = createEmptyResult(validator.vendor);
  const maxFindingsSample = options.maxFindingsSample ?? 50;

  if (!Array.isArray(items) || items.length === 0) {
    return result;
  }

  if (validator.pre) {
    validator.pre(items);
  }

  const findings = [];
  for (const item of items) {
    const itemFindings = validator.validateItem?.(item) || [];
    findings.push(...itemFindings);
  }

  if (validator.post) {
    findings.push(...(validator.post(items) || []));
  }

  for (const finding of findings) {
    recordFinding(result, finding);
    if (result.findingsSample.length < maxFindingsSample) {
      result.findingsSample.push(finding);
    }
  }

  const topIssues = Object.entries(result.codes)
    .map(([code, detail]) => ({ code, severity: detail.severity, count: detail.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (topIssues.length > 0) {
    result.topIssues = topIssues;
  }

  return result;
};

export { runVendorValidation };
