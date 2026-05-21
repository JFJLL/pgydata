const fs = require("fs");

const p = "D:/download/pic-vec/pgydata/assets/1.1.1/assets/url-validator-00wRYD83.js";
let s = fs.readFileSync(p, "utf8");

function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`missing ${label}`);
  s = s.replace(oldText, newText);
  console.log("patched", label);
}

replaceOnce(
  String.raw`const f={blogger:/xiaohongshu\.com\/user\/profile\/[a-f0-9]{24}/i,notebook:/xiaohongshu\.com\/(explore|discovery\/item)\/[a-f0-9]{24}/i,shortLink:/xhslink\.com/i}`,
  String.raw`const f={blogger:/(xiaohongshu\.com\/user\/profile\/[a-f0-9]{24}|pgy\.xiaohongshu\.com\/solar\/pre-trade\/blogger-detail\/[a-f0-9]{24}|^[a-f0-9]{24}$)/i,notebook:/xiaohongshu\.com\/(explore|discovery\/item)\/[a-f0-9]{24}/i,shortLink:/xhslink\.com/i}`,
  "blogger validator"
);

replaceOnce(
  String.raw`function st(e){return/xiaohongshu/i.test(e)||/xhslink/i.test(e)}`,
  String.raw`function st(e){return/xiaohongshu/i.test(e)||/xhslink/i.test(e)||/pgy\.xiaohongshu/i.test(e)||/^[a-f0-9]{24}$/i.test(e)}`,
  "platform hint"
);

replaceOnce(
  'children:"Excel 总行数"',
  'children:d&&d.startsWith("手动输入")?"输入总行数":"Excel 总行数"',
  "manual total label"
);

fs.writeFileSync(p, s);
