import { extractTextSources, getItemRef } from "../utils.js";

const RULE_CODE = "HPE.RULE.001";

const ruleLineTypeSanity = (item) => {
  try {
    if (item?.source?.vendor && item.source.vendor !== "HPE") {
      return [];
    }
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
    const hasFactoryIntegrated = /factory\s*integrated/i.test(combined);
    const isService = /\bservice\b|\bsupport\b|\bmaintenance\b/i.test(combined);

    if (!isService && !hasOption && !hasSpare && !hasFactoryIntegrated) {
      return [
        {
          code: RULE_CODE,
          severity: "warn",
          message:
            "HPE line item lacks option, spare, or factory-integrated markers; missing signals: option, spare, factory integrated.",
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

export { RULE_CODE, ruleLineTypeSanity };
