import fs from "node:fs";

export const readItemsJsonl = async (filePath) => {
  const content = await fs.promises.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};
