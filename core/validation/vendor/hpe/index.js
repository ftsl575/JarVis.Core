import {
  ruleLineTypeSanity,
  ruleOptionSpareMismatch,
  rulePartNumberFormat,
  ruleQuantityValidation,
} from "./rules/index.js";
import {
  getDescriptionValue,
  getItemRef,
  getLineSignals,
  getPartNumberValue,
  getQtyValue,
  normalizeDescription,
  normalizePartNumber,
} from "./utils.js";
import { runVendorValidation } from "../validator.js";

const RULES = [
  ruleLineTypeSanity,
  ruleOptionSpareMismatch,
  ruleQuantityValidation,
  rulePartNumberFormat,
];

const buildPartNumberEntries = (items) => {
  const byPartNumber = new Map();

  for (const item of items) {
    const partNumber = normalizePartNumber(getPartNumberValue(item));
    if (!partNumber) {
      continue;
    }
    const description = normalizeDescription(getDescriptionValue(item));
    const qtyValue = getQtyValue(item);
    const qtyNumber = Number(qtyValue);
    const qty = Number.isFinite(qtyNumber) ? qtyNumber : null;
    const lineSignals = getLineSignals(item);
    const lineTypes = new Set();
    if (lineSignals.hasOption) {
      lineTypes.add("option");
    }
    if (lineSignals.hasSpare) {
      lineTypes.add("spare");
    }
    if (lineSignals.hasFactoryIntegrated) {
      lineTypes.add("factory");
    }

    if (!byPartNumber.has(partNumber)) {
      byPartNumber.set(partNumber, []);
    }
    byPartNumber.get(partNumber).push({
      description,
      rawDescription: getDescriptionValue(item),
      itemRef: getItemRef(item),
      qty,
      lineTypes,
    });
  }

  return byPartNumber;
};

const collectDuplicatePartNumberFindings = (byPartNumber) => {
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

const collectSamePartNumberDifferentQtyFindings = (byPartNumber) => {
  const findings = [];
  for (const [partNumber, entries] of byPartNumber.entries()) {
    const qtyValues = new Set(entries.map((entry) => entry.qty).filter((qty) => qty !== null));
    if (qtyValues.size > 1) {
      findings.push({
        code: "HPE.RULE.006",
        severity: "info",
        message: "Same part number appears with multiple quantity values.",
        itemRef: entries[0]?.itemRef,
        fields: ["parsed.product_number", "parsed.qty"],
        context: {
          partNumber,
          quantities: Array.from(qtyValues),
        },
      });
    }
  }

  return findings;
};

const collectSamePartNumberMixedLineTypeFindings = (byPartNumber) => {
  const findings = [];
  for (const [partNumber, entries] of byPartNumber.entries()) {
    const lineTypeSignals = new Set();
    for (const entry of entries) {
      for (const lineType of entry.lineTypes) {
        lineTypeSignals.add(lineType);
      }
    }

    if (lineTypeSignals.has("option") && (lineTypeSignals.has("spare") || lineTypeSignals.has("factory"))) {
      findings.push({
        code: "HPE.RULE.007",
        severity: "warn",
        message: "Same part number appears as both option and spare/factory line types.",
        itemRef: entries[0]?.itemRef,
        fields: ["parsed.product_number", "parsed.description", "raw.text"],
        context: {
          partNumber,
          lineTypes: Array.from(lineTypeSignals),
        },
      });
    }
  }

  return findings;
};

const createHpeValidator = () => {
  const context = {
    partNumberEntries: new Map(),
  };

  return {
    vendor: "HPE",
    pre(items) {
      context.partNumberEntries = buildPartNumberEntries(items);
    },
    validateItem(item) {
      const findings = [];
      for (const rule of RULES) {
        const ruleFindings = rule(item) || [];
        findings.push(...ruleFindings);
      }
      return findings;
    },
    post(items) {
      const partNumberEntries =
        context.partNumberEntries?.size ? context.partNumberEntries : buildPartNumberEntries(items);
      return [
        ...collectDuplicatePartNumberFindings(partNumberEntries),
        ...collectSamePartNumberDifferentQtyFindings(partNumberEntries),
        ...collectSamePartNumberMixedLineTypeFindings(partNumberEntries),
      ];
    },
  };
};

const validateHpeItems = (items, options = {}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return runVendorValidation(createHpeValidator(), [], options);
  }

  const relevantItems = items.filter((item) =>
    item?.line_type ? item.line_type === "item" : true,
  );

  return runVendorValidation(createHpeValidator(), relevantItems, options);
};

export { validateHpeItems };
