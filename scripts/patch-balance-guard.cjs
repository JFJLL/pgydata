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

let code = fs.readFileSync(bundlePath, "utf8");

function replaceOnce(from, to, label) {
  if (!code.includes(from)) {
    throw new Error(`Could not find ${label}`);
  }
  code = code.replace(from, to);
}

replaceOnce(
  "children:t.toLocaleString()}",
  "children:(Number.isFinite(Number(t))?Number(t):0).toLocaleString()}",
  "top balance formatter",
);

replaceOnce(
  "e({balance:r.balance})",
  "e({balance:Number.isFinite(Number(r==null?void 0:r.balance))?Number(r.balance):0})",
  "fetchBalance assignment",
);

replaceOnce(
  "setBalance:r=>{e({balance:r})}",
  "setBalance:r=>{const a=Number(r);e({balance:Number.isFinite(a)?a:0})}",
  "setBalance guard",
);

replaceOnce(
  "e({balance:n.balance}),n.sufficient",
  "e({balance:Number.isFinite(Number(n==null?void 0:n.balance))?Number(n.balance):0}),!!(n!=null&&n.sufficient)",
  "checkBalance assignment",
);

replaceOnce(
  "setBalance(i.balanceAfter)",
  "setBalance((i==null?void 0:i.balanceAfter)??(i==null?void 0:i.balance))",
  "consume balance fallback",
);

fs.writeFileSync(bundlePath, code);
console.log(`Patched balance guards: ${bundlePath}`);
