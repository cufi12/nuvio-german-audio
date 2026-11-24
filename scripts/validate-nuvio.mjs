import { readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(root, "nuvio/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.scrapers) || manifest.scrapers.length === 0) {
  throw new Error("Nuvio manifest must contain a non-empty scrapers array");
}
const ids = new Set();
for (const scraper of manifest.scrapers) {
  if (!scraper.id || ids.has(scraper.id)) throw new Error("Missing or duplicate scraper id: " + scraper.id);
  ids.add(scraper.id);
  if (!scraper.name || !scraper.name.startsWith("CVN-")) {
    throw new Error("Nuvio scraper name must start with CVN-: " + scraper.id);
  }
  if (!Array.isArray(scraper.supportedTypes) || !scraper.supportedTypes.length ||
      scraper.supportedTypes.some(type => !["movie", "tv"].includes(type))) {
    throw new Error("Invalid supportedTypes for " + scraper.id);
  }
  if (typeof scraper.filename !== "string" || !scraper.filename.endsWith(".js")) {
    throw new Error("Invalid filename for " + scraper.id);
  }
  const file = resolve(root, "nuvio", scraper.filename.replace(/^nuvio\//, ""));
  const rel = relative(resolve(root, "nuvio"), file);
  if (rel.startsWith(".." + sep) || rel === "..") throw new Error("Scraper path escapes nuvio directory: " + scraper.id);
  const source = readFileSync(file, "utf8");
  if (!source.includes("module.exports") || !/getStreams\s*[:(]/.test(source)) {
    throw new Error("Scraper does not expose getStreams: " + scraper.id);
  }
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) throw new Error("JavaScript syntax check failed for " + scraper.id + ":\n" + check.stderr);
}
console.log("Validated " + manifest.scrapers.length + " Nuvio scrapers and JavaScript syntax.");
