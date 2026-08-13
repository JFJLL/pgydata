// 近期笔记波动图（互动量）JS/SVG 兜底（与 Python 渲染器同契约）：
// 783x420 白底卡片、蓝色柱 + 互动量中位数虚线；数据缺失时稳定降级，不伪造 0 或参考线。
function pgyRecentNoteFluctuationSvg(a) {
  var width = 783, height = 420;
  var data = (a && a.data) || a || {};
  var rawNotes = Array.isArray(data.notes) ? data.notes : [];
  var finiteNonNegative = function (value) {
    if (value === null || value === undefined || typeof value === "boolean") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    var parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  var noteSlots = [];
  for (var i = 0; i < rawNotes.length; i++) {
    var item = rawNotes[i];
    noteSlots.push(item && typeof item === "object" ? finiteNonNegative(item.interactionNum) : null);
  }
  var notes = noteSlots.filter(function (value) { return value !== null; });
  var median = finiteNonNegative(data.interactionMedian);
  var escapeXml = function (text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  var formatInt = function (value) {
    if (Math.abs(value) >= 1e12) return value.toExponential(2).replace("e+", "e");
    return Math.round(value).toLocaleString("en-US");
  };
  var niceGridMax = function (value) {
    if (!(value > 0)) return 1;
    var exponent = Math.floor(Math.log10(value));
    var power = Math.pow(10, exponent);
    var normalized = value / power;
    var factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    var result = factor * power;
    return Number.isFinite(result) && result >= value ? result : Number.MAX_VALUE;
  };
  var plotLeft = 46, plotRight = width - 46;
  var plotTop = 112, plotBottom = height - 42;
  var parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + " " + height + '">');
  parts.push('<rect x="2" y="2" width="' + (width - 5) + '" height="' + (height - 5) + '" rx="8" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="2"/>');
  parts.push('<text x="26" y="42" font-size="24" font-weight="bold" fill="#262626">近期笔记波动</text>');
  parts.push('<circle cx="150" cy="33" r="9" fill="none" stroke="#BFBFBF" stroke-width="2"/>');
  parts.push('<text x="146" y="39" font-size="14" fill="#BFBFBF">?</text>');
  var segs = [["阅读量", false], ["互动量", true], ["曝光量", false]];
  var segX = 26, segY = 58, segH = 26;
  for (var s = 0; s < segs.length; s++) {
    var label = segs[s][0], selected = segs[s][1];
    var pw = label.length * 15 + 24;
    if (selected) {
      parts.push('<rect x="' + segX + '" y="' + segY + '" width="' + pw + '" height="' + segH + '" rx="13" fill="#FFFFFF" stroke="#D9D9D9"/>');
      parts.push('<text x="' + (segX + 12) + '" y="' + (segY + 18) + '" font-size="15" fill="#262626">' + escapeXml(label) + "</text>");
    } else {
      parts.push('<rect x="' + segX + '" y="' + segY + '" width="' + pw + '" height="' + segH + '" rx="13" fill="#F7F7F7" stroke="#F0F0F0"/>');
      parts.push('<text x="' + (segX + 12) + '" y="' + (segY + 18) + '" font-size="15" fill="#747474">' + escapeXml(label) + "</text>");
    }
    segX += pw + 8;
  }
  if (notes.length > 0) {
    var rawMax = Math.max.apply(null, notes.concat(median === null ? [0] : [median]));
    var gridMax = niceGridMax(rawMax);
    var gridCount = 5;
    for (var g = 0; g <= gridCount; g++) {
      var value = (gridMax / gridCount) * g;
      var y = plotBottom - (value / gridMax) * (plotBottom - plotTop);
      if (g > 0 && g < gridCount) {
        parts.push('<line x1="' + plotLeft + '" y1="' + y + '" x2="' + plotRight + '" y2="' + y + '" stroke="#E8E8E8" stroke-width="1" stroke-dasharray="4 4"/>');
      }
      parts.push('<text x="' + (plotLeft - 8) + '" y="' + (y + 5) + '" font-size="15" fill="#8C8C8C" text-anchor="end">' + formatInt(value) + "</text>");
    }
    var barW = 18;
    var slot = (plotRight - plotLeft) / noteSlots.length;
    for (var n = 0; n < noteSlots.length; n++) {
      var cx = plotLeft + slot * n + slot / 2;
      parts.push('<text x="' + cx + '" y="' + (plotBottom + 24) + '" font-size="15" fill="#595959" text-anchor="middle">笔记' + (n + 1) + "</text>");
      var val = noteSlots[n];
      if (val === null) continue;
      var h = (val / gridMax) * (plotBottom - plotTop);
      var x0 = cx - barW / 2;
      var y0 = plotBottom - h;
      parts.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + barW + '" height="' + (plotBottom - y0) + '" rx="1" fill="#3A64FF"/>');
      parts.push('<text x="' + cx + '" y="' + (y0 - 8) + '" font-size="15" fill="#3A64FF" text-anchor="middle">' + formatInt(val) + "</text>");
    }
    if (median !== null) {
      var yM = plotBottom - (median / gridMax) * (plotBottom - plotTop);
      var dashText = "";
      for (var dx = plotLeft; dx < plotRight; dx += 12) {
        dashText += (dx > plotLeft ? " " : "") + dx + "," + yM + " " + Math.min(dx + 6, plotRight) + "," + yM;
      }
      parts.push('<polyline points="' + dashText + '" fill="none" stroke="#3A64FF" stroke-width="2"/>');
      parts.push('<text x="' + plotRight + '" y="' + (yM - 8) + '" font-size="15" fill="#3A64FF" text-anchor="end">' + formatInt(median) + "</text>");
    }
  } else {
    parts.push('<text x="' + plotLeft + '" y="' + (plotTop + 60) + '" font-size="18" fill="#BFBFBF">暂无笔记数据</text>');
  }
  parts.push("</svg>");
  return parts.join("");
}
