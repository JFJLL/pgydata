function pgyTrendChartSvg(a) {
  const byDate = new Map((Array.isArray(a) ? a : []).map((row) => ({
    date: String(row.dateKey ?? row.date ?? ""),
    num: Number(row.num ?? row.value ?? 0),
  })).filter((row) => row.date && Number.isFinite(row.num)).map((row) => {
    const digits = row.date.replace(/\D/g, "");
    return [digits.length >= 8 ? digits.slice(-8) : row.date, row];
  }));
  const rows = Array.from(byDate.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row).slice(-30);
  if (rows.length < 2) return "";

  const width = 813, height = 419;
  const axisLeft = 75, axisRight = 785, plotLeft = 87, plotRight = 772, plotTop = 122, plotBottom = 382;
  const values = rows.map((row) => row.num);
  const min = Math.min(...values), max = Math.max(...values);
  const rawStep = Math.max((max - min) / 5, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 3, 5, 10].map((value) => value * magnitude).find((value) => value >= rawStep) ?? 10 * magnitude;
  let axisMax = Math.ceil(max / step) * step;
  let axisMin = axisMax - 5 * step;
  while (min < axisMin) { axisMax += step; axisMin = axisMax - 5 * step; }
  const xAt = (index) => plotLeft + (plotRight - plotLeft) * index / (rows.length - 1);
  const yAt = (value) => plotBottom - (value - axisMin) / (axisMax - axisMin) * (plotBottom - plotTop);
  const points = rows.map((row, index) => [xAt(index), yAt(row.num)]);
  let path = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)], p1 = points[index], p2 = points[index + 1], p3 = points[Math.min(points.length - 1, index + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const grid = Array.from({ length: 5 }, (_, index) => {
    const y = plotTop + index * 52;
    const value = axisMax - index * step;
    const label = Math.abs(value) >= 10000 ? `${(value / 10000).toFixed(2)}w` : String(Math.round(value));
    return `<line x1="${axisLeft}" y1="${y}" x2="${axisRight}" y2="${y}" stroke="#e8e8e8" stroke-dasharray="4 2"/><text x="59" y="${y + 5}" text-anchor="end" font-size="13" fill="#666">${label}</text>`;
  }).join("");
  const dateLabel = (value) => {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits.length >= 8 ? `${digits.slice(-4, -2)}/${digits.slice(-2)}` : String(value ?? "");
  };
  const indices = rows.length >= 25 ? [0, 6, 12, 18, 24] : Array.from(new Set(Array.from({ length: 5 }, (_, index) => Math.round(index * (rows.length - 1) / 4))));
  const dates = indices.map((index) => `<text x="${xAt(index).toFixed(1)}" y="400" text-anchor="middle" font-size="13" fill="#666">${pgyChartEscape(dateLabel(rows[index].date))}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,Arial,sans-serif"><rect x="25" y="17" width="4" height="14" rx="2" fill="#ff2442"/><text x="35" y="29" font-size="16" fill="#262626">粉丝趋势</text><rect x="25" y="60" width="172" height="32" rx="5" fill="#f7f7f7"/><rect x="29" y="64" width="80" height="24" rx="4" fill="white" stroke="#eee"/><text x="36" y="81" font-size="13" fill="#262626">粉丝总量</text><circle cx="95" cy="76" r="5" fill="none" stroke="#999"/><text x="95" y="79" text-anchor="middle" font-size="8" fill="#777">i</text><text x="120" y="81" font-size="13" fill="#666">粉丝增量</text><circle cx="179" cy="76" r="5" fill="none" stroke="#999"/><text x="179" y="79" text-anchor="middle" font-size="8" fill="#777">i</text><rect x="684" y="60" width="120" height="32" rx="5" fill="#f7f7f7"/><text x="695" y="81" font-size="13" fill="#262626">近30日</text><path d="M780 73l4 4 4-4" fill="none" stroke="#888"/>${grid}<line x1="${axisLeft}" y1="${plotBottom}" x2="${axisRight}" y2="${plotBottom}" stroke="#ccc"/><path d="${path}" fill="none" stroke="#3f6eff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dates}</g></svg>`;
}
