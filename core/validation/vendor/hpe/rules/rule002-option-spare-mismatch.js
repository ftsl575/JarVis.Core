import { extractTextSources, getItemRef } from "../utils.js";

const RULE_CODE = "HPE.RULE.002";

const ruleOptionSpareMismatch = (item) => {
  try {
    if (item?.line_type && item.line_type !== "item") {
      return [];
    }

    const { description, rawText } = extractTextSources(item);
    const combined = `${description} ${rawText}`.trim();

    if (!combined) {
      return [];
    }

    const hasOption = /\boption\b|\bopt(?:ion)?\s*kit\b|\bkit\b/i.test(combined);
    const hasSpare = /\bspare\b|\bspare\s*kit\b/i.test(combined);

    if (hasOption && hasSpare) {
      return [
        {
          code: RULE_CODE,
          severity: "warn",
          message: "HPE line item appears to be both an option kit and a spare.",
          itemRef: getItemRef(item),
          fields: ["parsed.description", "raw.text"],
        },
      ];
    }

    return [];
  } catch (error) {
    return [];
  }
};

export { RULE_CODE, ruleOptionSpareMismatch };
