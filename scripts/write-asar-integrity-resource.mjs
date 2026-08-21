import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getRawHeader } from "@electron/asar";
import { NtExecutable, NtExecutableResource } from "resedit";

function usage() {
  throw new Error("Usage: node scripts/write-asar-integrity-resource.mjs <magiorix.exe> <resources/app.asar>");
}

const [, , exePathArg, asarPathArg] = process.argv;
if (!exePathArg || !asarPathArg) usage();
const exePath = path.resolve(exePathArg);
const asarPath = path.resolve(asarPathArg);
if (!fs.statSync(exePath).isFile() || !fs.statSync(asarPath).isFile()) {
  throw new Error("Executable or app.asar path is invalid");
}

const rawHeader = getRawHeader(asarPath);
if (!rawHeader || typeof rawHeader.headerString !== "string") {
  throw new Error("@electron/asar getRawHeader did not return a raw header string");
}
const headerHash = crypto.createHash("sha256").update(Buffer.from(rawHeader.headerString, "utf8")).digest("hex");
const integrityList = [{ file: "resources\\app.asar", alg: "sha256", value: headerHash }];
const integrityBuffer = Buffer.from(JSON.stringify(integrityList), "utf8");

const executable = NtExecutable.from(fs.readFileSync(exePath));
const resources = NtExecutableResource.from(executable);
resources.entries = resources.entries.filter((entry) => !(String(entry.type).toUpperCase() === "INTEGRITY" && String(entry.id).toUpperCase() === "ELECTRONASAR"));
resources.entries.push({
  type: "INTEGRITY",
  id: "ELECTRONASAR",
  bin: integrityBuffer.buffer.slice(integrityBuffer.byteOffset, integrityBuffer.byteOffset + integrityBuffer.byteLength),
  lang: 0,
  codepage: 1200,
});
resources.outputResource(executable);
fs.writeFileSync(exePath, Buffer.from(executable.generate()));
console.log(JSON.stringify({
  type: "Integrity",
  name: "ElectronAsar",
  file: integrityList[0].file,
  alg: integrityList[0].alg,
  value: headerHash,
}));
