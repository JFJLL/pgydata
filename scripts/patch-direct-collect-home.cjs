const fs = require("fs");
const path = require("path");

const bundlePath = path.join(
  __dirname,
  "..",
  "assets",
  "1.1.1",
  "assets",
  "index-B09sHfUO.js",
);

const original = fs.readFileSync(bundlePath, "utf8");
const from = 's2=[{index:!0,element:o.jsx(Mr,{})},{path:"profile",element:o.jsx(Er,{})},{path:"enterprise/info",element:o.jsx(Ar,{})}]';
const to = 's2=[{index:!0,element:o.jsx(K1,{to:"/database/xhs/pgy-blogger",replace:!0})},{path:"profile",element:o.jsx(Er,{})},{path:"enterprise/info",element:o.jsx(Ar,{})}]';

if (!original.includes(from)) {
  throw new Error("Could not find the root home route snippet in the desktop bundle.");
}

const patched = original.replace(from, to);
fs.writeFileSync(bundlePath, patched);
console.log(`Patched desktop root route: ${bundlePath}`);
