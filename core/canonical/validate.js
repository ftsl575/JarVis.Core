import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "../../docs/canonical_v1.schema.json");

const loadSchema = () => JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const createAjv = () => new Ajv({ validateSchema: false, allErrors: true, strict: false });

const compileCanonicalSchema = () => {
  const ajv = createAjv();
  const schema = loadSchema();
  const validate = ajv.compile(schema);
  return { ajv, schema, validate };
};

let cachedValidator;

const getValidator = () => {
  if (!cachedValidator) {
    cachedValidator = compileCanonicalSchema();
  }
  return cachedValidator;
};

const validateCanonical = (record) => {
  const { validate } = getValidator();
  const valid = validate(record);
  return {
    valid,
    errors: validate.errors ? [...validate.errors] : [],
  };
};

export { createAjv, validateCanonical };
