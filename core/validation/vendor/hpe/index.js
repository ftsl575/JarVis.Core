import {
  ruleLineTypeSanity,
  ruleOptionSpareMismatch,
  rulePartNumberFormat,
  ruleQuantityValidation,
} from "./rules/index.js";
import {
  getDescriptionValue,
  getItemRef,
  getPartNumberValue,
  normalizeDescription,
  normalizePartNumber,
} from "./utils.js";

const RULES = [
  ruleLineTypeSanity,
  ruleOptionSpareMismatch,
  ruleQuantityValidation,
  rulePartNumberFormat,
];

const createEmptyResult = () => ({
  vendor: "HPE",
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

const collectDuplicatePartNumberFindings = (items) => {
  const byPartNumber = new Map();

  for (const item of items) {
    const partNumber = normalizePartNumber(getPartNumberValue(item));
    if (!partNumber) {
      continue;
    }
    const description = normalizeDescription(getDescriptionValue(item));
    if (!byPartNumber.has(partNumber)) {
      byPartNumber.set(partNumber, []);
    }
    byPartNumber.get(partNumber).push({
      description,
      rawDescription: getDescriptionValue(item),
      itemRef: getItemRef(item),
    });
  }

  const findings = [];
  for (const [partNumber, entries] of byPartNumber.entries()) {
    const uniqueDescriptions = new Map();
    for (const entry of entries) {
      if (!uniqueDescriptions.has(entry.description)) {
        uniqueDescriptions.set(entry.description, entry.rawDescription);
      }
    }

    if (uniqueDescriptions.size > 1) {
      const sampleDescriptions = Array.from(uniqueDescriptions.values()).slice(0, 3);
      findings.push({
        code: "HPE.RULE.005",
        severity: "info",
        message: "Duplicate part numbers have conflicting descriptions.",
        itemRef: entries[0]?.itemRef,
        fields: ["parsed.product_number", "parsed.description"],
        context: {
          partNumber,
          sampleDescriptions,
        },
      });
    }
  }

  return findings;
};

const validateHpeItems = (items, options = {}) => {
  const result = createEmptyResult();
  const maxFindingsSample = options.maxFindingsSample ?? 50;

  if (!Array.isArray(items) || items.length === 0) {
    return result;
  }

  const relevantItems = items.filter((item) =>
    item?.line_type ? item.line_type === "item" : true,
  );

  const findings = [];
  for (const item of relevantItems) {
    for (const rule of RULES) {
      const ruleFindings = rule(item) || [];
      findings.push(...ruleFindings);
    }
  }

  findings.push(...collectDuplicatePartNumberFindings(relevantItems));

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

export { validateHpeItems };
