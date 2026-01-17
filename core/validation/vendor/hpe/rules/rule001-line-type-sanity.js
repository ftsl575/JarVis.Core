import { extractTextSources, getItemRef, getPartNumberValue, getQtyValue, normalizeText } from "../utils.js";

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

    const normalizedCombined = combined.toLowerCase();
    const hasOption = /\boption\b|\bopt(?:ion)?\s*kit\b|\bkit\b/i.test(normalizedCombined);
    const hasSpare = /\bspare\b|\bspare\s*kit\b/i.test(normalizedCombined);
    const hasFactoryIntegrated =
      /\bfactory\s*integrated\b|\bconfigure[-\s]*to[-\s]*order\b|\bcto\b|\bfio\b|\bfi\b/i.test(
        normalizedCombined,
      );
    const isService = /\bservice\b|\bsupport\b|\bmaintenance\b/i.test(normalizedCombined);
    const hasNonItemMarker =
      /\btotal\b|\bsubtotal\b|\btax\b|\bshipping\b|\bnotes?\b|\bheader\b|\bwarranty summary\b/i.test(
        normalizedCombined,
      );

    const partNumber = getPartNumberValue(item);
    const qtyValue = getQtyValue(item);
    const qtyNumber = Number(qtyValue);
    const hasQty = Number.isFinite(qtyNumber) && qtyNumber >= 1;
    const hasProductNumber = Boolean(normalizeText(partNumber));

    if (hasNonItemMarker || isService) {
      return [];
    }

    if (!hasQty || !hasProductNumber) {
      return [];
    }

    if (!hasOption && !hasSpare && !hasFactoryIntegrated) {
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
