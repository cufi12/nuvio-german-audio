import { readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
if (!Array.isArray(manifest.providers) || manifest.providers.length === 0) {
  throw new Error("manifest.json must contain a non-empty providers array");
}

const ids = new Set();
for (const provider of manifest.providers) {
  if (!provider.id || ids.has(provider.id)) throw new Error("Missing or duplicate provider id: " + provider.id);
  ids.add(provider.id);
  if (!Array.isArray(provider.supportedTypes) || provider.supportedTypes.length === 0 ||
      provider.supportedTypes.some(type => !["movie", "tv"].includes(type))) {
    throw new Error("Missing or unsupported media types in provider: " + provider.id);
  }
  if (typeof provider.filename !== "string" || !provider.filename.endsWith(".js")) {
    throw new Error("Invalid provider filename: " + provider.id);
  }
  const file = resolve(root, provider.filename);
  const rel = relative(root, file);
  if (rel.startsWith(".." + sep) || rel === "..") throw new Error("Provider path escapes repository: " + provider.id);
  const source = readFileSync(file, "utf8");
  if (!source.includes("module.exports") || !/getStreams\s*[:(]/.test(source)) {
    throw new Error("Provider does not expose getStreams: " + provider.id);
  }
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) throw new Error("JavaScript syntax check failed for " + provider.id + ":\n" + check.stderr);
}
console.log("Validated " + manifest.providers.length + " provider entries and JavaScript syntax.");
