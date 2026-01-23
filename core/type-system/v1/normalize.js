const normalizeText = (value) => {
  if (!value) {
    return "";
  }
  return value.toString().trim().replace(/\s+/g, " ").toLowerCase();
};

const normalizePartNumber = (value) => {
  if (!value) {
    return "";
  }
  return value.toString().trim().replace(/\s+/g, " ").toUpperCase();
};

export { normalizePartNumber, normalizeText };
