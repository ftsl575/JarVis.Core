import { getItemRef, getPartNumberValue, normalizeText } from "../utils.js";

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
    if (/\s/.test(trimmed)) {
      findings.push({
        code: RULE_CODE,
        severity: "warn",
        message: "Part number contains whitespace characters.",
        itemRef: getItemRef(item),
        fields: ["parsed.product_number"],
        context: { partNumber: trimmed },
      });
    }

    const hasHpeSuffix = /-(B21|S21|001|291)\b/i.test(trimmed);
    if (hasHpeSuffix && /[^A-Z0-9-]/i.test(trimmed)) {
      findings.push({
        code: RULE_CODE,
        severity: "warn",
        message: "Part number contains illegal characters for HPE option/spare patterns.",
        itemRef: getItemRef(item),
        fields: ["parsed.product_number"],
        context: { partNumber: trimmed },
      });
    }

    return findings;
  } catch (error) {
    return [];
  }
};

export { RULE_CODE, rulePartNumberFormat };
