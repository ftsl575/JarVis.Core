import assert from "node:assert/strict";
import test from "node:test";
import { selectHpeBatchInputs } from "../scripts/docs-hpe-clean.js";

test("selects HPE batch inputs with exclusion rules", () => {
  const inputs = [
    "alpha.xlsx",
    "beta_cleaned.xlsx",
    "gamma_invoice.xlsx",
    "~$temp.xlsx",
    "delta.xls",
    "report.XLSX",
    "тест.xlsx",
    "draft_cleaned.XLSX",
    "notes.txt",
  ];

  const selected = selectHpeBatchInputs(inputs);

  assert.deepEqual(selected, ["alpha.xlsx", "report.XLSX", "тест.xlsx"]);
});
