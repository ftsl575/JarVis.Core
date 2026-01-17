import { getItemRef, getQtyValue } from "../utils.js";

const RULE_CODE = "HPE.RULE.003";

const ruleQuantityValidation = (item) => {
  try {
    if (item?.line_type && item.line_type !== "item") {
      return [];
    }

    const qty = getQtyValue(item);

    if (qty === null || qty === undefined) {
      return [
        {
          code: RULE_CODE,
          severity: "warn",
          message: "Quantity is missing for HPE line item.",
          itemRef: getItemRef(item),
          fields: ["parsed.qty"],
        },
      ];
    }

    if (typeof qty !== "number" || Number.isNaN(qty)) {
      return [
        {
          code: RULE_CODE,
          severity: "error",
          message: "Quantity is not a valid number for HPE line item.",
          itemRef: getItemRef(item),
          fields: ["parsed.qty"],
          context: { qty },
        },
      ];
    }

    if (qty < 1) {
      return [
        {
          code: RULE_CODE,
          severity: "error",
          message: "Quantity must be at least 1 for HPE line item.",
          itemRef: getItemRef(item),
          fields: ["parsed.qty"],
          context: { qty },
        },
      ];
    }

    return [];
  } catch (error) {
    return [];
  }
};

export { RULE_CODE, ruleQuantityValidation };
