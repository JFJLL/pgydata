// 测试辅助：真实 xlsx 生成器。
// 1:1 移植 app-source/dist-electron/index.js 中 ff() 的工作簿构建逻辑
// （两行表头 gf / 单行 hf / 图片嵌入 pgyEmbedImagesInWorkbook），仅去掉保存对话框。
// tests/unit/collection-history-export.test.mjs 用它把 buildCollectionHistoryExportPayload
// 的产物写成真实 .xlsx 并解压校验。若 bundle 内导出实现变化，需同步本文件。

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const appSourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app-source");
const requireApp = createRequire(pathToFileURL(path.join(appSourceDir, "package.json")));
const XLSX = requireApp("xlsx-js-style");
const JSZip = requireApp("jszip");

// 与主进程 PGY_IMAGE_FIELDS（PYG_CHART_FIELDS 值集合）一致。
export const PGY_IMAGE_FIELDS = new Set([
  "fansProvinceChart",
  "fansCityChart",
  "fansAgeChart",
  "fansGenderChart",
  "fansGenderAgeChart",
  "fansGrowthTrendChart",
  "dailyNotePerformanceChart",
  "dailyNotePicturePerformanceChart",
  "dailyNoteVideoPerformanceChart",
  "bloggerOverviewChart",
]);

const headerStyle = {
  fill: { fgColor: { rgb: "E8D5F5" } },
  font: { bold: true },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "medium", color: { rgb: "000000" } },
    bottom: { style: "medium", color: { rgb: "000000" } },
    left: { style: "medium", color: { rgb: "000000" } },
    right: { style: "medium", color: { rgb: "000000" } },
  },
};
const centerStyle = {
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "DDDDDD" } },
    bottom: { style: "thin", color: { rgb: "DDDDDD" } },
    left: { style: "thin", color: { rgb: "DDDDDD" } },
    right: { style: "thin", color: { rgb: "DDDDDD" } },
  },
};
const leftStyle = {
  alignment: { horizontal: "left", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "DDDDDD" } },
    bottom: { style: "thin", color: { rgb: "DDDDDD" } },
    left: { style: "thin", color: { rgb: "DDDDDD" } },
    right: { style: "thin", color: { rgb: "DDDDDD" } },
  },
};

function isLinkLabel(label) {
  return label.includes("链接") || label.includes("link") || label.includes("url");
}

const MIN_COL_WIDTH = 8;
const MAX_COL_WIDTH = 25;

function displayWidth(text) {
  let width = 0;
  for (const ch of text) width += ch.charCodeAt(0) > 127 ? 2 : 1;
  return width;
}

function columnWidth(labelWidth, dataWidth) {
  const half = Math.ceil(labelWidth / 2);
  const capped = Math.min(dataWidth, MAX_COL_WIDTH);
  const width = Math.max(half, capped);
  return Math.max(MIN_COL_WIDTH, Math.min(width, MAX_COL_WIDTH));
}

function sampleDataWidths(rows, keys, sampleSize = 20) {
  const widths = new Array(keys.length).fill(0);
  for (const row of rows.slice(0, sampleSize)) {
    for (let col = 0; col < keys.length; col += 1) {
      const value = row[keys[col]];
      if (value != null) {
        const width = displayWidth(String(value));
        if (width > widths[col]) widths[col] = width;
      }
    }
  }
  return widths;
}

// 对应 bundle 内 hf(): 单行表头。
function buildSingleRowSheet(rows) {
  const normalized = rows.map((row) => {
    const next = {};
    for (const [key, value] of Object.entries(row)) next[key] = value == null || value === "" ? "-" : value;
    return next;
  });
  const sheet = XLSX.utils.json_to_sheet(normalized);
  styleSingleRowSheet(sheet);
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    const widths = sampleDataWidths(rows, keys);
    sheet["!cols"] = keys.map((key, col) => ({ wch: columnWidth(displayWidth(key), widths[col]) }));
  }
  return sheet;
}

// 对应 bundle 内 xf(): 单行表头样式。
function styleSingleRowSheet(sheet) {
  const ref = sheet["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const linkCols = new Set();
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
    if (cell?.v && isLinkLabel(String(cell.v))) linkCols.add(col);
  }
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const addr = XLSX.utils.encode_cell({ r: row, c: col });
      if (!sheet[addr]) sheet[addr] = { v: "", t: "s" };
      sheet[addr].s = row === 0 ? headerStyle : linkCols.has(col) ? leftStyle : centerStyle;
    }
  }
}

// 对应 bundle 内 pgyDataWithoutImageText()。
function dataWithoutImageText(headers, rows) {
  const imageKeys = new Set(headers.filter((header) => header && PGY_IMAGE_FIELDS.has(header.key)).map((header) => header.key));
  if (imageKeys.size === 0) return rows;
  return rows.map((row) => {
    const next = { ...row };
    for (const key of imageKeys) {
      if (typeof next[key] === "string" && next[key] && fs.existsSync(next[key])) next[key] = "__PGY_IMAGE_CELL_BLANK__";
    }
    return next;
  });
}

// 对应 bundle 内 gf(): 两行分组表头。
function buildTwoRowSheet(headers, rows) {
  const groups = [];
  let currentGroup = "";
  let start = 0;
  for (let col = 0; col < headers.length; col += 1) {
    if (headers[col].group !== currentGroup) {
      if (col > 0) groups.push({ group: currentGroup, startCol: start, endCol: col - 1 });
      currentGroup = headers[col].group;
      start = col;
    }
  }
  if (headers.length > 0) groups.push({ group: currentGroup, startCol: start, endCol: headers.length - 1 });

  const groupRow = new Array(headers.length).fill(null);
  const labelRow = new Array(headers.length).fill(null);
  const merges = [];
  for (const group of groups) {
    const single = group.startCol === group.endCol;
    if (single && group.group === headers[group.startCol].label) {
      groupRow[group.startCol] = group.group;
      merges.push({ s: { r: 0, c: group.startCol }, e: { r: 1, c: group.startCol } });
    } else if (single) {
      groupRow[group.startCol] = group.group;
      labelRow[group.startCol] = headers[group.startCol].label;
    } else {
      groupRow[group.startCol] = group.group;
      merges.push({ s: { r: 0, c: group.startCol }, e: { r: 0, c: group.endCol } });
      for (let col = group.startCol; col <= group.endCol; col += 1) labelRow[col] = headers[col].label;
    }
  }

  const matrix = [groupRow, labelRow];
  for (const row of rows) {
    matrix.push(headers.map((header) => {
      const value = row[header.key];
      if (value === "__PGY_IMAGE_CELL_BLANK__") return "";
      if (value == null || value === "") return "-";
      return typeof value === "number" || typeof value === "boolean" ? value : String(value);
    }));
  }

  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  sheet["!merges"] = merges;
  const colCount = headers.length;
  const rowCount = matrix.length;
  const linkCols = new Set(headers.map((header, col) => (isLinkLabel(header.label) || isLinkLabel(header.key) ? col : -1)).filter((col) => col >= 0));
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const addr = XLSX.utils.encode_cell({ r: row, c: col });
      if (!sheet[addr]) sheet[addr] = { v: "", t: "s" };
      sheet[addr].s = row <= 1 ? headerStyle : linkCols.has(col) ? leftStyle : centerStyle;
    }
  }
  const keys = headers.map((header) => header.key);
  const widths = sampleDataWidths(rows, keys);
  sheet["!rows"] = matrix.map((cells, row) => {
    if (row < 2) return { hpx: 28 };
    return headers.some((header, col) => PGY_IMAGE_FIELDS.has(header.key) && cells[col] && cells[col] !== "-") ? { hpx: 112 } : { hpx: 22 };
  });
  sheet["!cols"] = headers.map((header, col) => {
    if (PGY_IMAGE_FIELDS.has(header.key)) return { wch: 24 };
    return { wch: columnWidth(displayWidth(header.label), widths[col]) };
  });
  return sheet;
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
}

function nextRelId(relsXml) {
  let next = 1;
  for (const match of relsXml.matchAll(/Id="rId(\d+)"/g)) next = Math.max(next, Number(match[1]) + 1);
  return `rId${next}`;
}

function addContentTypes(xml) {
  if (!xml.includes('Extension="png"')) {
    xml = xml.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
  }
  if (!xml.includes("/xl/drawings/drawing1.xml")) {
    xml = xml.replace("</Types>", '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  }
  return xml;
}

function sheetRelXml(relsXml, relId) {
  if (!relsXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  }
  if (relsXml.includes('Target="../drawings/drawing1.xml"')) return relsXml;
  return relsXml.replace("</Relationships>", `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
}

function patchSheetXml(sheetXml, relId, anchors) {
  if (!sheetXml.includes("xmlns:r=")) {
    sheetXml = sheetXml.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  }
  for (const anchor of anchors) {
    const rowNumber = anchor.row + 1;
    const rowPattern = new RegExp(`<row([^>]*\\sr="${rowNumber}"[^>]*)>`);
    sheetXml = sheetXml.replace(rowPattern, (full, attrs) => {
      const cleaned = attrs.replace(/\sht="[^"]*"/g, "").replace(/\scustomHeight="[^"]*"/g, "");
      return `<row${cleaned} ht="112" customHeight="1">`;
    });
  }
  if (sheetXml.includes("<drawing ")) return sheetXml;
  return sheetXml.replace("</worksheet>", `<drawing r:id="${relId}"/></worksheet>`);
}

function drawingXml(anchors) {
  const parts = anchors.map((anchor, index) => {
    const relId = `rId${index + 1}`;
    return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${anchor.col}</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>${anchor.row}</xdr:row><xdr:rowOff>95250</xdr:rowOff></xdr:from><xdr:to><xdr:col>${anchor.col + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${index + 2}" name="${xmlEscape(anchor.name)}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${parts}</xdr:wsDr>`;
}

function drawingRelXml(anchors) {
  const parts = anchors.map((anchor, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${xmlEscape(anchor.media)}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${parts}</Relationships>`;
}

// 对应 bundle 内 pgyEmbedImagesInWorkbook()。
async function embedImagesInWorkbook(filePath, headers, rows) {
  const anchors = [];
  for (let col = 0; col < headers.length; col += 1) {
    const header = headers[col];
    if (!PGY_IMAGE_FIELDS.has(header.key)) continue;
    for (let row = 0; row < rows.length; row += 1) {
      const value = rows[row][header.key];
      if (typeof value === "string" && value && fs.existsSync(value)) {
        anchors.push({ path: value, col, row: row + 2, name: `${header.label || header.key}-${row + 1}` });
      }
    }
  }
  if (anchors.length === 0) return;
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  anchors.forEach((anchor, index) => {
    anchor.media = `pgy_chart_${index + 1}.png`;
    zip.file(`xl/media/${anchor.media}`, fs.readFileSync(anchor.path));
  });
  const sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  const relsEntry = zip.file("xl/worksheets/_rels/sheet1.xml.rels");
  const relsXml = relsEntry ? await relsEntry.async("string") : "";
  const existing = relsXml.match(/Id="([^"]+)"[^>]*Target="\.\.\/drawings\/drawing1\.xml"/);
  const relId = existing ? existing[1] : nextRelId(relsXml);
  zip.file("[Content_Types].xml", addContentTypes(await zip.file("[Content_Types].xml").async("string")));
  zip.file("xl/worksheets/sheet1.xml", patchSheetXml(sheetXml, relId, anchors));
  zip.file("xl/worksheets/_rels/sheet1.xml.rels", sheetRelXml(relsXml, relId));
  zip.file("xl/drawings/drawing1.xml", drawingXml(anchors));
  zip.file("xl/drawings/_rels/drawing1.xml.rels", drawingRelXml(anchors));
  fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

// 对应 bundle 内 ff()（去掉保存对话框）：写出真实 xlsx 文件。
export async function writeCollectionWorkbook(filePath, payload) {
  const data = payload.data ?? [];
  const sheet = payload.mode === "two-row"
    ? buildTwoRowSheet(payload.headers ?? [], dataWithoutImageText(payload.headers ?? [], data))
    : buildSingleRowSheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  XLSX.writeFile(workbook, filePath);
  if (payload.mode === "two-row") {
    await embedImagesInWorkbook(filePath, payload.headers ?? [], data);
  }
  return { success: true, filePath };
}
