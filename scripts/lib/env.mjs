import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/** The process environment over `<root>/.env`, which is gitignored. */
export function loadEnv(root) {
  const file = path.join(root, ".env");
  const values = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return { ...values, ...process.env };
}
