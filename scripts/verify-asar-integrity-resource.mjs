import fs from "node:fs";
import { NtExecutable, NtExecutableResource } from "resedit";

const [, , exePath] = process.argv;
if (!exePath) throw new Error("Usage: node scripts/verify-asar-integrity-resource.mjs <magiorix.exe>");
const executable = NtExecutable.from(fs.readFileSync(exePath));
const resources = NtExecutableResource.from(executable);
const matches = resources.entries.filter((entry) => String(entry.type).toUpperCase() === "INTEGRITY" && String(entry.id).toUpperCase() === "ELECTRONASAR");
if (matches.length !== 1) throw new Error(`Expected exactly one Integrity/ElectronAsar resource, found ${matches.length}`);
const value = JSON.parse(Buffer.from(matches[0].bin).toString("utf8"));
if (!Array.isArray(value) || value.length !== 1 || value[0].file !== "resources\\app.asar" || value[0].alg !== "sha256" || !/^[a-f0-9]{64}$/.test(value[0].value)) {
  throw new Error("ElectronAsar resource payload is invalid");
}
console.log(JSON.stringify({ type: "Integrity", name: "ElectronAsar", ...value[0] }));
