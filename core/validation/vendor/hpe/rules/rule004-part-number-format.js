import {
  getItemRef,
  getPartNumberValue,
  isValidHpePnCandidate,
  normalizeHpePartNumber,
  normalizeText,
} from "../utils.js";

const RULE_CODE = "HPE.RULE.004";

const rulePartNumberFormat = (item) => {
  try {
    if (item?.line_type && item.line_type !== "item") {
      return [];
    }

    const partNumber = getPartNumberValue(item);
    const trimmed = normalizeText(partNumber);

    if (!trimmed) {
      return [];
    }

    const findings = [];
    const hasWhitespace = /\s/.test(trimmed);
    const { normalized, tokens } = normalizeHpePartNumber(trimmed);
    const normalizedIsValid = isValidHpePnCandidate(normalized);

    if (hasWhitespace && normalizedIsValid) {
      findings.push({
        code: RULE_CODE,
        severity: "info",
        message: "Part number normalized; trailing tokens ignored.",
        itemRef: getItemRef(item),
        fields: ["parsed.product_number"],
        context: { raw: trimmed, normalized, tokens },
      });
      return findings;
    }

    if (!normalizedIsValid) {
      const reasons = [];
      if (/[^A-Z0-9-]/i.test(normalized)) {
        reasons.push("illegal characters");
      }
      if (normalized.length < 5 || normalized.length > 20) {
        reasons.push("unexpected length");
      }
      findings.push({
        code: RULE_CODE,
        severity: "warn",
        message: `Part number failed HPE candidate validation${
          reasons.length > 0 ? ` (${reasons.join(", ")})` : ""
        }.`,
        itemRef: getItemRef(item),
        fields: ["parsed.product_number"],
        context: { raw: trimmed, normalized, tokens },
      });
    }

    return findings;
  } catch (error) {
    return [];
  }
};

export { RULE_CODE, rulePartNumberFormat };
