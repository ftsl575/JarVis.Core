import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../docs/canonical_v1.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const ajv = new Ajv({ allErrors: true, strict: false });
const validator = ajv.compile(schema);

const formatPath = (instancePath) => {
  if (!instancePath) {
    return "/";
  }
  return instancePath;
};

const validateCanonical = (record) => {
  const ok = validator(record);
  const errors = [];

  if (!ok && Array.isArray(validator.errors)) {
    for (const error of validator.errors) {
      errors.push({
        path: formatPath(error.instancePath),
        message: error.message || "Schema validation error",
      });
    }
  }

  return {
    ok: Boolean(ok),
    errors,
    warnings: [],
  };
};

export default validateCanonical;
