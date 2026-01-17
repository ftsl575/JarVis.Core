import Ajv from "ajv/dist/2020.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const metaSchema2020 = require("ajv/dist/refs/json-schema-2020-12.json");

export function createAjv(options = {}) {
  const ajv = new Ajv(options);
  ajv.addMetaSchema(metaSchema2020);
  return ajv;
}
