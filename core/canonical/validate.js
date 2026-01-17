import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../docs/canonical_v1.schema.json");
const canonicalSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const ajv = new Ajv();
const validate = ajv.compile(canonicalSchema);

export const validateCanonical = (record) => {
  const ok = validate(record);
  const errors = [];

  if (!ok && Array.isArray(validate.errors)) {
    for (const error of validate.errors) {
      errors.push({
        path: error.instancePath || "",
        message: error.message || "Validation error",
      });
    }
  }

  return {
    ok: Boolean(ok),
    errors,
    warnings: [],
  };
};
