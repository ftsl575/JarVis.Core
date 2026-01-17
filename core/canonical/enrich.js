const shouldPreserve = (pathParts) => pathParts.length === 2 && pathParts[0] === "source" && pathParts[1] === "file";

const trimValue = (value, pathParts) => {
  if (typeof value === "string") {
    return shouldPreserve(pathParts) ? value : value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => trimValue(item, [...pathParts, String(index)]));
  }

  if (value && typeof value === "object") {
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = trimValue(nested, [...pathParts, key]);
    }
    return result;
  }

  return value;
};

const enrichCanonical = (record) => trimValue(record, []);

export default enrichCanonical;
