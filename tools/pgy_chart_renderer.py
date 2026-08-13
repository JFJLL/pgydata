# -*- coding: utf-8 -*-
import base64
import io
import json
import math
import os
import re
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont, ImageOps


FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\Deng.ttf",
]


def load_font(size, bold=False):
    paths = list(FONT_CANDIDATES)
    if bold:
        paths = [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\simhei.ttf"] + paths
    for font_path in paths:
        try:
            if os.path.exists(font_path):
                return ImageFont.truetype(font_path, size)
        except Exception:
            pass
    return ImageFont.load_default()


FONT_TITLE = load_font(24, True)
FONT_TEXT = load_font(18)
FONT_SMALL = load_font(15)

REGION_MAP_FILENAME = "china-provinces.geojson"
REGION_COLORS = ["#3f64f5", "#6f8cf2", "#9fb6ef", "#cad9ef", "#edf3fb"]
REGION_EMPTY_COLOR = "#f3f7fc"
_CHINA_FEATURES = None


def ensure_dir(path):
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)


def to_num(value):
    try:
        num = float(value)
    except Exception:
        return 0.0
    if math.isnan(num) or math.isinf(num):
        return 0.0
    if 0 < num <= 1:
        return num * 100
    return num


def text_bbox(draw, value, font):
    try:
        return draw.textbbox((0, 0), str(value), font=font)
    except Exception:
        width, height = draw.textsize(str(value), font=font)
        return (0, 0, width, height)


def text_width(draw, value, font):
    box = text_bbox(draw, value, font)
    return box[2] - box[0]


def ellipsize(draw, value, font, max_width):
    value = str(value or "")
    if text_width(draw, value, font) <= max_width:
        return value
    suffix = "..."
    out = value
    while out and text_width(draw, out + suffix, font) > max_width:
        out = out[:-1]
    return (out + suffix) if out else suffix


def rounded_rect(draw, box, radius, fill):
    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle(box, radius=radius, fill=fill)
    else:
        draw.rectangle(box, fill=fill)


def normalize_region_name(value):
    name = str(value or "").strip().replace("省", "").replace("市", "")
    aliases = {
        "内蒙古自治区": "内蒙古",
        "广西壮族自治区": "广西",
        "西藏自治区": "西藏",
        "宁夏回族自治区": "宁夏",
        "新疆维吾尔自治区": "新疆",
        "香港特别行政区": "香港",
        "澳门特别行政区": "澳门",
    }
    return aliases.get(name, name.replace("特别行政区", "").replace("自治区", ""))


def region_rows(rows, limit=7):
    cleaned = []
    for row in rows or []:
        name = str(row.get("name") or row.get("group") or "").strip()
        value = to_num(row.get("value", row.get("percent")))
        if name and value > 0:
            cleaned.append({"name": name, "value": value})
    cleaned.sort(key=lambda item: item["value"], reverse=True)
    return cleaned[:limit]


def china_geojson_candidates():
    candidates = []
    configured = os.environ.get("PGY_CHINA_GEOJSON_PATH")
    if configured:
        candidates.append(configured)
    bundle_root = getattr(sys, "_MEIPASS", None)
    if bundle_root:
        candidates.append(os.path.join(bundle_root, REGION_MAP_FILENAME))
    module_path = globals().get("__file__")
    if module_path:
        candidates.append(os.path.join(os.path.dirname(os.path.abspath(module_path)), REGION_MAP_FILENAME))
    return candidates


def load_china_features():
    global _CHINA_FEATURES
    if _CHINA_FEATURES is not None:
        return _CHINA_FEATURES
    for candidate in china_geojson_candidates():
        try:
            if os.path.isfile(candidate):
                with open(candidate, "r", encoding="utf-8") as source:
                    payload = json.load(source)
                features = payload.get("features") or []
                if features:
                    _CHINA_FEATURES = features
                    return _CHINA_FEATURES
        except Exception:
            continue
    raise FileNotFoundError("China province GeoJSON was not found")


def iter_geometry_polygons(geometry):
    if not isinstance(geometry, dict):
        return
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    if geometry_type == "Polygon":
        yield coordinates
    elif geometry_type == "MultiPolygon":
        for polygon in coordinates:
            yield polygon


def region_color(value, values):
    if value is None or value <= 0 or not values:
        return REGION_EMPTY_COLOR
    highest = max(values)
    lowest = min(values)
    if highest <= lowest:
        return REGION_COLORS[0]
    position = (highest - value) / (highest - lowest)
    index = min(len(REGION_COLORS) - 1, max(0, int(position * len(REGION_COLORS))))
    return REGION_COLORS[index]


def save_region_distribution(chart):
    data = chart.get("data") or {}
    mode = "city" if data.get("mode") == "city" else "province"
    province_rows = region_rows(data.get("provinceRows"))
    city_rows = region_rows(data.get("cityRows"))
    bars = city_rows if mode == "city" else province_rows
    if not bars:
        return False

    scale = 2
    width, height = 784, 464
    img = Image.new("RGB", (width * scale, height * scale), "white")
    draw = ImageDraw.Draw(img)
    title_font = load_font(14 * scale)
    subtitle_font = load_font(13 * scale)
    ui_font = load_font(13 * scale)
    legend_font = load_font(13 * scale)

    def point(x, y):
        return (int(round(x * scale)), int(round(y * scale)))

    def box(coords):
        return tuple(int(round(value * scale)) for value in coords)

    def put(x, y, value, font, fill="#262626"):
        draw.text(point(x, y), str(value), font=font, fill=fill)

    def put_right(x, y, value, font, fill="#5f6b7a"):
        text = str(value)
        draw.text((int(round(x * scale)) - text_width(draw, text, font), int(round(y * scale))), text, font=font, fill=fill)

    # Card frame, heading, summary, and segmented province/city state.
    draw.rounded_rectangle(box((3, 1, 781, 463)), radius=10 * scale, fill="white", outline="#e7e7e7", width=scale)
    put(18, 22, "地域分布", title_font, "#262626")
    summary_prefix = "国内最高的三个城市：" if mode == "city" else "国内最高的三个省份："
    summary_items = [f"{row['name']}（{row['value']:.1f}%）" for row in bars[:3]]
    summary = summary_prefix + "、".join(summary_items)
    summary = ellipsize(draw, summary, subtitle_font, 430 * scale)
    put(18, 50, summary, subtitle_font, "#929292")

    draw.rounded_rectangle(box((466, 57, 591, 91)), radius=5 * scale, fill="#f7f7f7")
    active_left = 469 if mode == "province" else 529
    active_right = 527 if mode == "province" else 588
    draw.rounded_rectangle(box((active_left + 1, 61, active_right + 1, 89)), radius=4 * scale, fill="#ececec")
    draw.rounded_rectangle(box((active_left, 60, active_right, 88)), radius=4 * scale, fill="white", outline="#e8e8e8", width=scale)
    put(477, 67, "按省份", ui_font, "#262626" if mode == "province" else "#666666")
    put(537, 67, "按城市", ui_font, "#262626" if mode == "city" else "#666666")

    # Province choropleth using the same geographic proportions as the source view.
    province_values = {normalize_region_name(row["name"]): row["value"] for row in province_rows}
    mapped_values = [value for name, value in province_values.items() if name != "海外"]
    min_lon, min_lat, max_lon, max_lat = 73.45, 3.35, 135.12, 53.60
    map_left, map_top, map_right, map_bottom = 61, 96, 374, 433

    def project(coordinate):
        lon, lat = coordinate[:2]
        x = map_left + (float(lon) - min_lon) / (max_lon - min_lon) * (map_right - map_left)
        y = map_top + (max_lat - float(lat)) / (max_lat - min_lat) * (map_bottom - map_top)
        return point(x, y)

    for feature in load_china_features():
        properties = feature.get("properties") or {}
        name = normalize_region_name(properties.get("name"))
        value = province_values.get(name)
        fill = "white" if not name else region_color(value, mapped_values)
        outline = "#d7dfe7"
        for polygon in iter_geometry_polygons(feature.get("geometry")):
            if not polygon:
                continue
            outer = [project(coordinate) for coordinate in polygon[0] if len(coordinate) >= 2]
            if len(outer) >= 3:
                draw.polygon(outer, fill=fill)
                draw.line(outer + [outer[0]], fill=outline, width=scale, joint="curve")
            for hole in polygon[1:]:
                ring = [project(coordinate) for coordinate in hole if len(coordinate) >= 2]
                if len(ring) >= 3:
                    draw.polygon(ring, fill="white")
                    draw.line(ring + [ring[0]], fill=outline, width=scale, joint="curve")

    # Five-level legend.
    put(21, 282, "高", legend_font, "#333333")
    for index, color in enumerate(REGION_COLORS):
        y = 306 + index * 24
        draw.rounded_rectangle(box((18, y, 38, y + 14)), radius=4 * scale, fill=color)
    put(21, 426, "低", legend_font, "#555555")

    # Right-side ranked bars, matching the source's compact rhythm and labels.
    axis_x = 498
    draw.line((axis_x * scale, 105 * scale, axis_x * scale, 408 * scale), fill="#e6e9ee", width=scale)
    max_value = max(row["value"] for row in bars)
    bar_max_width = 204 if mode == "city" else 218
    for index, row in enumerate(bars[:7]):
        bar_y = 121 + index * 43
        label_y = bar_y - 5
        bar_label = row["name"]
        if mode == "city" and normalize_region_name(bar_label) in {"其他", "其它", "其他地区"}:
            bar_label = ""
        put_right(489, label_y, bar_label, ui_font, "#626262")
        bar_width = max(2, bar_max_width * row["value"] / max_value)
        draw.rectangle(box((axis_x, bar_y, axis_x + bar_width, bar_y + 12)), fill="#3f64f5")
        value_x = min(748, axis_x + bar_width + 5)
        put(value_x, label_y, f"{row['value']:.1f}%", ui_font, "#536274")

    resampling = getattr(Image, "Resampling", Image)
    img = img.resize((width, height), getattr(resampling, "LANCZOS"))
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def save_bar(chart):
    rows = []
    for row in chart.get("rows") or []:
        name = str(row.get("name") or "")
        value = to_num(row.get("value"))
        if name and value > 0:
            rows.append({"name": name, "value": value})
    if not rows:
        return False
    rows = rows[:10]
    width = 760
    height = max(420, 112 + len(rows) * 48)
    left = 170
    right = 78
    top = 72
    row_h = (height - top - 54) / max(1, len(rows))
    plot_w = width - left - right
    max_v = max(1.0, max(row["value"] for row in rows))
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text((32, 24), str(chart.get("title") or "粉丝分布"), font=FONT_TITLE, fill="#111827")
    for i in range(5):
        x = left + plot_w * i / 4
        draw.line((x, top - 8, x, height - 48), fill="#e5e7eb", width=1)
    for idx, row in enumerate(rows):
        y = top + idx * row_h + row_h * 0.24
        bar_h = max(16, row_h * 0.42)
        label = ellipsize(draw, row["name"], FONT_TEXT, left - 48)
        draw.text((left - 18 - text_width(draw, label, FONT_TEXT), y - 1), label, font=FONT_TEXT, fill="#334155")
        rounded_rect(draw, (left, y, left + plot_w, y + bar_h), 7, "#f1f5f9")
        bar_w = max(4, plot_w * row["value"] / max_v)
        rounded_rect(draw, (left, y, left + bar_w, y + bar_h), 7, "#2563eb")
        value_text = f"{row['value']:.1f}%"
        draw.text((min(width - 70, left + bar_w + 12), y - 1), value_text, font=FONT_SMALL, fill="#1f2937")
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def clean_age_label(value):
    label = str(value or "").strip().replace("岁", "")
    label = label.replace("～", "-").replace("~", "-").replace("—", "-")
    return label


def save_age_distribution(chart):
    rows = []
    for row in chart.get("rows") or []:
        name = clean_age_label(row.get("name") or row.get("group"))
        value = to_num(row.get("value", row.get("percent")))
        if name and value > 0:
            rows.append({"name": name, "value": value})
    if not rows:
        return False
    rows = rows[:5]

    width, height, scale = 382, 372, 4
    img = Image.new("RGB", (width * scale, height * scale), "white")
    draw = ImageDraw.Draw(img)
    title_font = load_font(14 * scale)
    body_font = load_font(12 * scale)

    def put(x, y, value, font, fill):
        draw.text((x * scale, y * scale), str(value), font=font, fill=fill)

    # Header and the single-line dominant-age summary from the reference card.
    put(15, 18, "年龄分布", title_font, "#262626")
    dominant = max(rows, key=lambda row: row["value"])
    put(15, 43, f"{dominant['name']}居多，占比{dominant['value']:.1f}%", body_font, "#8c8c8c")

    axis_x, axis_top, axis_bottom = 55, 82, 343
    draw.rectangle((axis_x * scale, axis_top * scale, 324 * scale, 134 * scale), fill="#f6f8fc")
    draw.line((axis_x * scale, axis_top * scale, axis_x * scale, axis_bottom * scale), fill="#e4e6ea", width=scale)

    # The source uses a fixed 0-40% horizontal scale and five 52px rows.
    plot_width = 269
    for index, row in enumerate(rows):
        bar_y = 102 + index * 52
        label_y = 97 + index * 52
        label_width = text_width(draw, row["name"], body_font) / scale
        put(axis_x - 8 - label_width, label_y, row["name"], body_font, "#595959")
        bar_width = max(2, min(plot_width, plot_width * row["value"] / 40.0))
        bar_color = "#5c84fc" if index == 0 else "#3a64ff"
        draw.rectangle((axis_x * scale, bar_y * scale, (axis_x + bar_width) * scale, (bar_y + 12) * scale), fill=bar_color)
        put(axis_x + bar_width + 5, label_y, f"{row['value']:.1f}%", body_font, "#596579")

    resampling = getattr(Image, "Resampling", Image)
    img = img.resize((width, height), getattr(resampling, "LANCZOS"))
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def save_gender(chart):
    data = chart.get("data") or {}
    female = to_num(data.get("female"))
    male = to_num(data.get("male"))
    total = female + male
    if total <= 0:
        return False
    width, height, scale = 379, 383, 4
    img = Image.new("RGB", (width * scale, height * scale), "white")
    draw = ImageDraw.Draw(img)
    title_font = load_font(14 * scale)
    body_font = load_font(12 * scale)

    def put(x, y, value, font=body_font, fill="#262626"):
        draw.text((x * scale, y * scale), str(value), font=font, fill=fill)

    put(15, 19, "性别分布", title_font, "#262626")
    dominant_label, dominant_value = ("女性", female) if female >= male else ("男性", male)
    put(15, 44, f"{dominant_label}居多，占比{dominant_value:.1f}%", body_font, "#8c8c8c")

    # 140px outer diameter, 108px inner diameter; the blue female segment
    # starts at 12 o'clock and follows the clockwise order in the reference.
    donut_box = (120 * scale, 135 * scale, 260 * scale, 275 * scale)
    female_angle = 360 * female / total
    draw.pieslice(donut_box, start=-90, end=-90 + female_angle, fill="#3a64ff")
    draw.pieslice(donut_box, start=-90 + female_angle, end=270, fill="#91d3ed")
    draw.ellipse((136 * scale, 151 * scale, 244 * scale, 259 * scale), fill="white")

    # Fixed elbow leaders and outside labels mirror the captured chart state.
    blue_width = 2 * scale
    draw.line((255 * scale, 187 * scale, 265 * scale, 182 * scale, 281 * scale, 182 * scale), fill="#3a64ff", width=blue_width, joint="curve")
    draw.line((121 * scale, 224 * scale, 112 * scale, 227 * scale, 99 * scale, 227 * scale), fill="#91d3ed", width=blue_width, joint="curve")
    put(286, 174, f"{female:.2f}%")
    left_text = f"{male:.2f}%"
    left_x = 92 - text_width(draw, left_text, body_font) / scale
    put(left_x, 219, left_text)

    # Compact centered legend.
    draw.ellipse((143 * scale, 314 * scale, 149 * scale, 320 * scale), fill="#3a64ff")
    put(154, 307, "女性")
    draw.ellipse((202 * scale, 314 * scale, 208 * scale, 320 * scale), fill="#91d3ed")
    put(213, 307, "男性")

    resampling = getattr(Image, "Resampling", Image)
    img = img.resize((width, height), getattr(resampling, "LANCZOS"))
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def save_gender_age_distribution(chart):
    data = chart.get("data") or {}
    gender = data.get("gender") or {}
    female = to_num(gender.get("female"))
    male = to_num(gender.get("male"))
    total = female + male
    rows = []
    for row in data.get("rows") or []:
        name = clean_age_label(row.get("name") or row.get("group"))
        value = to_num(row.get("value", row.get("percent")))
        if name and value > 0:
            rows.append({"name": name, "value": value})
    rows = rows[:5]
    if total <= 0 or not rows:
        return False

    width, height, scale = 783, 390, 4
    img = Image.new("RGB", (width * scale, height * scale), "white")
    draw = ImageDraw.Draw(img)
    title_font = load_font(14 * scale)
    body_font = load_font(12 * scale)

    def put(x, y, value, font=body_font, fill="#262626"):
        draw.text((x * scale, y * scale), str(value), font=font, fill=fill)

    # Two independent cards on the single exported canvas.
    draw.rounded_rectangle((2 * scale, 1 * scale, 383 * scale, 389 * scale), radius=8 * scale, fill="white", outline="#f0f0f0", width=scale)
    draw.rounded_rectangle((399 * scale, 1 * scale, 782 * scale, 389 * scale), radius=8 * scale, fill="white", outline="#f0f0f0", width=scale)

    put(18, 22, "性别分布", title_font)
    dominant_label, dominant_value = ("女性", female) if female >= male else ("男性", male)
    put(18, 47, f"{dominant_label}居多，占比{dominant_value:.1f}%", fill="#8c8c8c")

    donut_box = (123 * scale, 138 * scale, 263 * scale, 278 * scale)
    female_angle = 360 * female / total
    draw.pieslice(donut_box, start=-90, end=-90 + female_angle, fill="#3a64ff")
    draw.pieslice(donut_box, start=-90 + female_angle, end=270, fill="#91d3ed")
    draw.ellipse((139 * scale, 154 * scale, 247 * scale, 262 * scale), fill="white")
    draw.line((258 * scale, 190 * scale, 268 * scale, 185 * scale, 284 * scale, 185 * scale), fill="#3a64ff", width=2 * scale, joint="curve")
    draw.line((124 * scale, 227 * scale, 115 * scale, 230 * scale, 102 * scale, 230 * scale), fill="#91d3ed", width=2 * scale, joint="curve")
    put(289, 177, f"{female:.2f}%")
    male_text = f"{male:.2f}%"
    put(95 - text_width(draw, male_text, body_font) / scale, 222, male_text)
    draw.ellipse((146 * scale, 317 * scale, 152 * scale, 323 * scale), fill="#3a64ff")
    put(157, 310, "女性")
    draw.ellipse((205 * scale, 317 * scale, 211 * scale, 323 * scale), fill="#91d3ed")
    put(216, 310, "男性")

    put(415, 22, "年龄分布", title_font)
    dominant_age = max(rows, key=lambda row: row["value"])
    put(415, 47, f"{dominant_age['name']}居多，占比{dominant_age['value']:.1f}%", fill="#8c8c8c")
    axis_x, axis_top, axis_bottom = 454, 96, 349
    draw.line((axis_x * scale, axis_top * scale, axis_x * scale, axis_bottom * scale), fill="#e4e6ea", width=scale)
    plot_width = 269
    for index, row in enumerate(rows):
        bar_y = 108 + index * 52
        label_y = 103 + index * 52
        label_width = text_width(draw, row["name"], body_font) / scale
        put(axis_x - 7 - label_width, label_y, row["name"], fill="#595959")
        bar_width = max(2, min(plot_width, plot_width * row["value"] / 40.0))
        draw.rectangle(((axis_x + 1) * scale, bar_y * scale, (axis_x + 1 + bar_width) * scale, (bar_y + 12) * scale), fill="#3a64ff")
        put(axis_x + 1 + bar_width + 5, label_y, f"{row['value']:.1f}%", fill="#596579")

    resampling = getattr(Image, "Resampling", Image)
    img = img.resize((width, height), getattr(resampling, "LANCZOS"))
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def trend_points(rows):
    points_by_date = {}
    for row in rows or []:
        value = to_num(row.get("num", row.get("value")))
        date = str(row.get("dateKey", row.get("date", "")) or "")
        digits = re.sub(r"\D", "", date)
        date_key = digits[-8:] if len(digits) >= 8 else date
        if date_key and math.isfinite(value):
            points_by_date[date_key] = {"date": date, "date_key": date_key, "num": value}
    return sorted(points_by_date.values(), key=lambda point: point["date_key"])


def format_integer(value):
    if value is None or value == "":
        return "-"
    try:
        number = float(value)
        if not math.isfinite(number):
            return "-"
        return f"{int(round(number)):,}"
    except Exception:
        return "-"


def daily_note_categories(rows):
    categories = []
    for row in rows or []:
        name = str(row.get("contentTag") or "").strip()
        if not name:
            continue
        raw_percent = row.get("percent")
        try:
            percent = float(raw_percent)
            if not math.isfinite(percent):
                raise ValueError("invalid percent")
            label = f"{name}（占比{percent:.1f}%）"
            sort_value = percent
        except Exception:
            label = f"{name}（占比-）"
            sort_value = -1
        categories.append((sort_value, label))
    categories.sort(key=lambda item: item[0], reverse=True)
    visible = [item[1] for item in categories[:3]]
    if len(categories) > 3:
        visible.append(f"另有 {len(categories) - 3} 类")
    return "｜".join(visible) if visible else "-"


def daily_note_text_width(value):
    return sum(14 if ord(char) > 127 else 7 for char in str(value or ""))


def daily_note_ellipsize(value, max_width=535):
    value = str(value or "")
    if daily_note_text_width(value) <= max_width:
        return value
    suffix = "..."
    while value and daily_note_text_width(value + suffix) > max_width:
        value = value[:-1]
    return (value + suffix) if value else suffix


def save_daily_note_performance(chart):
    data = chart.get("data") or {}
    note_type_label = str(data.get("pgyNoteTypeLabel") or "图文+视频")
    note_number = data.get("noteNumber")
    note_value = format_integer(note_number)
    note_text = f"{note_value}篇" if note_value != "-" else "-"
    try:
        has_notes = float(note_number) > 0
    except Exception:
        has_notes = False
    exposure_text = format_integer(data.get("impMedian")) if has_notes else "-"
    read_text = format_integer(data.get("readMedian")) if has_notes else "-"
    category_text = daily_note_categories(data.get("noteType"))

    width, height = 808, 378
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    ui_font = load_font(14)
    ui_bold_font = load_font(14, True)
    section_font = load_font(16)
    metric_font = load_font(20, True)
    info_font = load_font(9)

    def web_box(box, radius, fill, outline=None, line_width=1):
        if hasattr(draw, "rounded_rectangle"):
            draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=line_width)
        else:
            draw.rectangle(box, fill=fill, outline=outline, width=line_width)

    # Recreate the PGY web hierarchy from structured data instead of taking a browser screenshot.
    web_box((16, 10, 20, 28), 2, "#ff2442")
    draw.text((28, 8), "数据表现", font=section_font, fill="#262626")

    web_box((16, 50, 96, 82), 5, "#fff1f2")
    draw.text((29, 58), "日常笔记", font=ui_font, fill="#ff2442")
    web_box((108, 50, 188, 82), 5, "#f7f7f7")
    draw.text((121, 58), "合作笔记", font=ui_font, fill="#3d3d3d")

    filters = [
        ((379, 50, 517, 83), note_type_label),
        ((529, 50, 636, 83), "近30日"),
        ((648, 50, 795, 83), "仅自然流量"),
    ]
    for box, label in filters:
        web_box(box, 5, "#f7f7f7")
        draw.text((box[0] + 12, box[1] + 8), label, font=ui_font, fill="#262626")
        arrow_x = box[2] - 17
        arrow_y = box[1] + 16
        draw.line((arrow_x - 3, arrow_y - 2, arrow_x, arrow_y + 1), fill="#888888", width=1)
        draw.line((arrow_x, arrow_y + 1, arrow_x + 3, arrow_y - 2), fill="#888888", width=1)
    draw.ellipse((735, 61, 745, 71), outline="#b7b7b7", width=1)
    draw.text((738, 59), "i", font=info_font, fill="#999999")

    web_box((16, 103, 795, 148), 8, "#f7f7f7")
    summary_y = 118
    draw.text((28, summary_y), "发布笔记", font=ui_font, fill="#8c8c8c")
    draw.line((28, 136, 82, 136), fill="#b8b8b8", width=1)
    draw.text((88, summary_y), note_text, font=ui_bold_font, fill="#262626")
    draw.line((121, 115, 121, 137), fill="#e6e6e6", width=1)
    draw.text((136, summary_y), "内容类目及占比", font=ui_font, fill="#8c8c8c")
    draw.line((136, 136, 234, 136), fill="#b8b8b8", width=1)
    category_summary = daily_note_ellipsize(category_text)
    draw.text((242, summary_y), category_summary, font=ui_font, fill="#262626")

    web_box((16, 165, 795, 375), 8, "white", outline="#eeeeee")
    draw.text((32, 188), "核心指标", font=section_font, fill="#262626")
    web_box((33, 227, 148, 259), 5, "#f5f5f5")
    web_box((36, 230, 91, 256), 4, "white", outline="#eeeeee")
    draw.text((46, 236), "按规模", font=ui_font, fill="#262626")
    draw.text((104, 236), "按成本", font=ui_font, fill="#8c8c8c")

    metric_cards = [
        ((33, 275, 397, 351), "曝光中位数", exposure_text, True),
        ((413, 275, 778, 351), "阅读中位数", read_text, False),
    ]
    for box, label, value, selected in metric_cards:
        web_box(
            box,
            5,
            "#fff8f8" if selected else "white",
            outline="#ff2442" if selected else "#e6e6e6",
        )
        label_x = box[0] + 16
        draw.text((label_x, box[1] + 14), label, font=ui_font, fill="#595959")
        draw.line((label_x, box[1] + 36, label_x + 68, box[1] + 36), fill="#9e9e9e", width=1)
        draw.text((label_x, box[1] + 42), value, font=metric_font, fill="#262626")

    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


PGY_OVERVIEW_SHIELD_PNG = {
    2: "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",
    0: "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",
}


EMOJI_SEQUENCE = re.compile(
    "[\U0001F000-\U0001FAFF\u2600-\u27BF\U0001F1E6-\U0001F1FF]"
    "(?:[\uFE0F\U0001F3FB-\U0001F3FF])?"
    "(?:\u200D[\U0001F000-\U0001FAFF\u2600-\u27BF](?:[\uFE0F\U0001F3FB-\U0001F3FF])?)*"
)


def load_inline_image(source, size):
    try:
        if not str(source).startswith("data:image/"):
            return None
        raw = base64.b64decode(str(source).split(",", 1)[1])
        icon = Image.open(io.BytesIO(raw)).convert("RGBA")
        resampling = getattr(Image, "Resampling", Image)
        return icon.resize((size, size), getattr(resampling, "LANCZOS"))
    except Exception:
        return None


def draw_nickname_with_emoji(img, draw, text, x, y, font, emoji_images):
    # 与 JS 端 pgyOverviewNicknameSvg 对齐：emoji 命中内嵌图则贴图，否则回退字体绘制
    images = emoji_images if isinstance(emoji_images, dict) else {}
    size = 24
    cursor = x
    last = 0
    value = str(text or "-")
    for match in EMOJI_SEQUENCE.finditer(value):
        head = value[last:match.start()]
        if head:
            draw.text((cursor, y), head, font=font, fill="#262626")
            cursor += draw.textbbox((0, 0), head, font=font)[2]
        segment = match.group(0)
        icon = load_inline_image(images.get(segment), size)
        if icon is not None:
            img.paste(icon, (int(cursor), y + 2), icon)
            cursor += size
        else:
            draw.text((cursor, y), segment, font=font, fill="#262626")
            cursor += max(size, draw.textbbox((0, 0), segment, font=font)[2])
        last = match.end()
    tail = value[last:]
    if tail:
        draw.text((cursor, y), tail, font=font, fill="#262626")
        cursor += draw.textbbox((0, 0), tail, font=font)[2]
    return int(cursor)


def load_overview_avatar(source, size):
    if not source or source == "-":
        return None
    try:
        if str(source).startswith("data:image/"):
            encoded = str(source).split(",", 1)[1]
            raw = base64.b64decode(encoded)
        elif str(source).startswith(("http://", "https://")):
            request = urllib.request.Request(str(source), headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=4) as response:
                raw = response.read(5 * 1024 * 1024)
        elif os.path.isfile(str(source)):
            with open(str(source), "rb") as handle:
                raw = handle.read(5 * 1024 * 1024)
        else:
            return None
        avatar = Image.open(io.BytesIO(raw)).convert("RGB")
        resampling = getattr(Image, "Resampling", Image)
        square = ImageOps.fit(
            avatar,
            (size, size),
            method=getattr(resampling, "LANCZOS"),
            centering=(0.5, 0.5),
        )
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        square.putalpha(mask)
        return square
    except Exception:
        return None


def save_blogger_overview(chart):
    data = chart.get("data") or {}
    width, height = 2048, 1066
    img = Image.new("RGB", (width, height), "#f7f7f9")
    draw = ImageDraw.Draw(img)
    font_15 = load_font(15)
    font_16 = load_font(16)
    font_18 = load_font(18)
    font_19 = load_font(19)
    font_20 = load_font(20)
    font_21 = load_font(21)
    font_22 = load_font(22)
    font_24 = load_font(24)
    font_24_bold = load_font(24, True)
    font_26 = load_font(26)
    font_26_bold = load_font(26, True)
    font_27 = load_font(27)
    font_27_bold = load_font(27, True)
    font_28 = load_font(28)
    font_28_bold = load_font(28, True)
    font_31_bold = load_font(31, True)
    font_32_bold = load_font(32, True)
    font_34_bold = load_font(34, True)

    def value(key, default="-"):
        raw = data.get(key)
        return default if raw is None or raw == "" else str(raw)

    def box(coords, radius=8, fill="white", outline=None, line_width=1):
        if hasattr(draw, "rounded_rectangle"):
            draw.rounded_rectangle(coords, radius=radius, fill=fill, outline=outline, width=line_width)
        else:
            draw.rectangle(coords, fill=fill, outline=outline, width=line_width)

    def line(x1, y1, x2, y2, fill="#dddddd", line_width=1):
        draw.line((x1, y1, x2, y2), fill=fill, width=line_width)

    def dashed(x1, y, x2, fill="#999999"):
        for start in range(int(x1), int(x2), 10):
            line(start, y, min(start + 5, x2), y, fill)

    def put(x, y, text, font=font_21, fill="#262626", max_width=None):
        output = str(text)
        if max_width is not None:
            output = ellipsize(draw, output, font, max_width)
        draw.text((x, y), output, font=font, fill=fill)

    icon_images = data.get("overviewIconImages") if isinstance(data.get("overviewIconImages"), dict) else {}

    def overview_icon(key, size, tint=None):
        icon = load_inline_image(icon_images.get(key), size)
        if icon is None:
            return None
        if tint is not None:
            alpha = icon.getchannel("A")
            icon = Image.new("RGBA", icon.size, tint)
            icon.putalpha(alpha)
        return icon

    def paste_overview_icon(key, x, y, size, tint=None):
        icon = overview_icon(key, size, tint)
        if icon is None:
            return False
        img.paste(icon, (int(x), int(y)), icon)
        return True

    # Static PGY page chrome.
    box((96, 20, 616, 118), 14)
    box((126, 42, 340, 90), 5, "white", "#eeeeee")
    box((340, 42, 586, 90), 5, "#f6f6f6")
    put(188, 52, "笔记主页", font_24)
    put(424, 52, "直播主页", font_24, "#666666")
    box((650, 20, 1948, 94), 14)
    put(712, 41, "数据概览", font_24)
    put(856, 41, "笔记数据", font_24, "#777777")
    put(996, 41, "粉丝分析", font_24, "#777777")
    line(700, 92, 826, 92, "#c73549", 2)
    put(1632, 42, f"数据更新至： {value('updatedAtText')}", font_21, "#aaaaaa", 280)

    # Profile and pricing column.
    box((96, 120, 616, 620), 14)
    draw.ellipse((126, 164, 230, 268), fill="#e8edf4")
    put(164, 191, value("nickname")[:1], font_34_bold, "#6d87a8")
    avatar = load_overview_avatar(data.get("avatar"), 104)
    if avatar:
        img.paste(avatar, (126, 164), avatar)
    nickname_text = ellipsize(draw, value("nickname"), font_22, 278)
    icon_x = draw_nickname_with_emoji(img, draw, nickname_text, 252, 170, font_22, data.get("nicknameEmojiImages")) + 8
    gender = value("genderText")
    if gender in ("女", "男"):
        gender_key = "genderFemale" if gender == "女" else "genderMale"
        paste_overview_icon(gender_key, icon_x, 177, 16)
        icon_x += 24
    health_level = data.get("healthLevel")
    health_risk = data.get("healthRisk") is True or (
        isinstance(health_level, (int, float)) and int(health_level) != 2
    )
    if isinstance(health_level, (int, float)):
        health_key = "healthRisk" if health_risk else "health"
        shield_icon = overview_icon(health_key, 16)
        if shield_icon is None:
            shield_b64 = PGY_OVERVIEW_SHIELD_PNG.get(0 if health_risk else 2)
            shield_icon = load_inline_image("data:image/png;base64," + shield_b64, 16)
        if shield_icon is not None:
            img.paste(shield_icon, (int(icon_x), 177), shield_icon)
    put(252, 216, "小红书号：", font_19, "#999999")
    red_id_text = ellipsize(draw, value("redId"), font_20, 165)
    put(354, 216, red_id_text, font_20, "#2878ff")
    copy_icon_x = min(520, 354 + text_width(draw, red_id_text, font_20) + 6)
    paste_overview_icon("copy", copy_icon_x, 222, 14)
    summary_text = value("profileSummaryText")
    has_summary = summary_text != "-"
    if has_summary:
        put(252, 257, summary_text, font_18, "#999999", 210)
    info_y = 289 if has_summary else 258
    paste_overview_icon("location", 252, info_y + 3, 14)
    put(274, info_y, value("location"), font_18, "#999999", 112)
    paste_overview_icon("organization", 420, info_y + 3, 14)
    put(440, info_y, value("mcn"), font_18, "#5273b4", 130)
    travel_area = value("travelAreaText")
    has_travel = travel_area != "-"
    if has_travel:
        paste_overview_icon("flyable", 248, info_y + 22, 28)
        put(280, info_y + 32, travel_area, font_18, "#595959", 200)
    tag_y = info_y + (65 if has_travel else 35)
    tags = data.get("categoryTags") if isinstance(data.get("categoryTags"), list) else []
    tag_x = 126
    for tag in tags[:6]:
        tag_label = ellipsize(draw, str(tag), font_18, 76)
        tag_width = max(48, min(98, text_width(draw, tag_label, font_18) + 20))
        if tag_x + tag_width > 586:
            break
        box((tag_x, tag_y, tag_x + tag_width, tag_y + 30), 4, "#f2f2f2")
        put(tag_x + 10, tag_y + 4, tag_label, font_18, "#595959")
        tag_x += tag_width + 10
    put(198, 400, "粉丝数", font_22)
    put(402, 400, "获赞与收藏", font_22)
    put(192, 433, value("fansText"), font_32_bold)
    put(402, 433, value("likeCollectText"), font_32_bold)
    line(126, 500, 586, 500, "#f1f1f1")
    box((126, 530, 336, 586), 6, "#f7f7f7")
    box((352, 530, 586, 586), 6, "#f23b49")
    paste_overview_icon("favorite", 188, 550, 16)
    put(216, 545, "收藏", font_22)
    paste_overview_icon("invite", 410, 550, 16)
    put(442, 545, "邀约", font_22, "white")

    box((96, 650, 616, 1040), 14)
    put(126, 676, "合作报价", font_28)
    for y, label, key in [
        (736, "图文笔记一口价", "picturePriceText"),
        (882, "视频笔记一口价", "videoPriceText"),
    ]:
        box((126, y, 586, y + 126), 5, "white", "#e8e8e8")
        put(158, y + 26, label, font_22, "#595959")
        put(158, y + 70, "暂停接单" if health_risk else value(key), font_22)
        if not health_risk:
            paste_overview_icon("cooperationPrice", 544, y + 54, 16)

    # Overview content column.
    box((650, 112, 1948, 1040), 14)
    put(700, 142, "数据概览", font_28)
    line(650, 212, 1948, 212, "#eeeeee")
    box((700, 240, 1898, 318), 9, "#f7f7f7")
    summary = [
        (720, "博主优势", value("advantageText"), 820, 128),
        (972, "发布笔记", value("publishedNotesText"), 1068, 94),
        (1190, "内容类目", value("contentCategoriesText"), 1294, 260),
        (1606, "合作行业", value("cooperationIndustryText"), 1710, 170),
    ]
    for x, label, text, value_x, max_w in summary:
        put(x, 263, label, font_21, "#999999")
        put(value_x, 263, text, font_22, "#262626", max_w)
    for x in (948, 1166, 1582):
        line(x, 257, x, 302, "#dddddd")

    box((700, 344, 1898, 636), 9, "white", "#e8e8e8")
    paste_overview_icon("notes", 726, 377, 24)
    put(766, 374, "笔记数据", font_24)
    box((726, 430, 838, 478), 6, "#fff0f1")
    put(748, 439, "按规模", font_21, "#d43d51")
    box((850, 430, 950, 478), 6, "#f7f7f7")
    put(872, 439, "按成本", font_21, "#555555")
    box((1658, 430, 1876, 478), 6, "#f7f7f7")
    box((1664, 436, 1776, 472), 5, "white", "#eeeeee")
    put(1680, 441, "日常笔记", font_20)
    put(1788, 441, "合作笔记", font_20, "#777777")
    metrics = [
        (726, "曝光中位数", "exposureText", "exposurePeerText"),
        (1110, "阅读中位数", "readText", "readPeerText"),
        (1532, "互动中位数", "interactionText", "interactionPeerText"),
    ]
    for x, label, value_key, peer_key in metrics:
        put(x, 505, label, font_21, "#666666")
        dashed(x, 535, x + 114)
        put(x, 552, value(value_key), font_27_bold, "#111111")
        put(x, 585, value(peer_key), font_19, "#777777")
    line(1078, 506, 1078, 608)
    line(1500, 506, 1500, 608)

    box((700, 662, 1274, 902), 9, "white", "#e8e8e8")
    paste_overview_icon("service", 726, 695, 24)
    put(766, 692, "服务表现", font_24)
    put(726, 755, "近7天活跃天数", font_21, "#666666")
    dashed(726, 786, 862)
    put(726, 804, value("activeDaysText"), font_27_bold, "#111111")
    active_label = value("activeLabelText")
    if active_label != "-":
        active_width = text_width(draw, active_label, font_18) + 20
        box((726, 846, 726 + active_width, 875), 0, "#eef2ff")
        put(736, 850, active_label, font_18, "#5273b4")
    line(986, 758, 986, 866)
    put(1020, 755, "邀约48小时回复率", font_21, "#666666")
    dashed(1020, 786, 1180)
    put(1020, 804, value("replyRateText"), font_27_bold, "#111111")
    reply_label = value("replyLabelText")
    if reply_label != "-":
        reply_width = text_width(draw, reply_label, font_18) + 20
        box((1020, 846, 1020 + reply_width, 875), 0, "#eef2ff")
        put(1030, 850, reply_label, font_18, "#5273b4")

    box((1300, 662, 1898, 902), 9, "white", "#e8e8e8")
    paste_overview_icon("growth", 1326, 695, 24)
    put(1366, 692, "成长表现", font_24)
    put(1326, 755, "粉丝量变化幅度", font_21, "#666666")
    dashed(1326, 786, 1464)
    put(1326, 804, value("fansGrowthText"), font_27_bold, "#111111")
    put(1326, 846, value("fansGrowthPeerText"), font_19, "#777777")

    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def save_trend(chart):
    rows = trend_points(chart.get("rows"))[-30:]
    if len(rows) < 2:
        return False

    width, height, scale = 813, 419, 4
    img = Image.new("RGB", (width * scale, height * scale), "white")
    draw = ImageDraw.Draw(img)
    title_font = load_font(16 * scale)
    ui_font = load_font(13 * scale)
    axis_font = load_font(13 * scale)
    info_font = load_font(8 * scale)

    def put(x, y, value, font=ui_font, fill="#262626", anchor=None):
        draw.text((x * scale, y * scale), str(value), font=font, fill=fill, anchor=anchor)

    def web_box(box, radius, fill, outline=None, line_width=1):
        scaled = tuple(round(value * scale) for value in box)
        if hasattr(draw, "rounded_rectangle"):
            draw.rounded_rectangle(
                scaled,
                radius=radius * scale,
                fill=fill,
                outline=outline,
                width=line_width * scale,
            )
        else:
            draw.rectangle(scaled, fill=fill, outline=outline, width=line_width * scale)

    # Fixed PGY web header and filters.
    web_box((25, 17, 29, 31), 2, "#ff2442")
    put(35, 15, "粉丝趋势", title_font)
    web_box((25, 60, 197, 92), 5, "#f7f7f7")
    web_box((29, 64, 109, 88), 4, "white", outline="#eeeeee")
    put(36, 69, "粉丝总量")
    put(120, 69, "粉丝增量", fill="#666666")
    for center_x in (95, 179):
        draw.ellipse(
            ((center_x - 5) * scale, 71 * scale, (center_x + 5) * scale, 81 * scale),
            outline="#999999",
            width=scale,
        )
        put(center_x, 76.4, "i", info_font, "#777777", anchor="mm")
    web_box((684, 60, 804, 92), 5, "#f7f7f7")
    put(695, 69, "近30日")
    draw.line((780 * scale, 73 * scale, 784 * scale, 77 * scale, 788 * scale, 73 * scale), fill="#888888", width=scale)

    axis_left, axis_right = 75, 785
    plot_left, plot_right = 87, 772
    plot_top, plot_bottom = 122, 382
    plot_height = plot_bottom - plot_top
    values = [row["num"] for row in rows]
    min_v = min(values)
    max_v = max(values)

    raw_step = max((max_v - min_v) / 5.0, 1.0)
    magnitude = 10 ** math.floor(math.log10(raw_step))
    step = 10 * magnitude
    for candidate in (1, 2, 3, 5, 10):
        candidate_step = candidate * magnitude
        if candidate_step >= raw_step:
            step = candidate_step
            break
    axis_max = math.ceil(max_v / step) * step
    axis_min = axis_max - 5 * step
    while min_v < axis_min:
        axis_max += step
        axis_min = axis_max - 5 * step

    for index in range(5):
        y = plot_top + index * 52
        for dash_x in range(axis_left, axis_right, 6):
            draw.line(
                (dash_x * scale, y * scale, min(dash_x + 4, axis_right) * scale, y * scale),
                fill="#e8e8e8",
                width=scale,
            )
        label_value = axis_max - index * step
        label = f"{label_value / 10000:.2f}w" if abs(label_value) >= 10000 else str(int(round(label_value)))
        put(axis_left - 2, y, label, axis_font, "#666666", anchor="rm")
    draw.line((axis_left * scale, plot_bottom * scale, axis_right * scale, plot_bottom * scale), fill="#cccccc", width=scale)

    def x_at(index):
        return plot_left + (plot_right - plot_left) * index / (len(rows) - 1)

    def y_at(value):
        return plot_bottom - (value - axis_min) / (axis_max - axis_min) * plot_height

    points = [(x_at(index), y_at(row["num"])) for index, row in enumerate(rows)]
    # Smooth through every daily point. This changes only the segment shape; no day is sampled out.
    curve = []
    for index in range(len(points) - 1):
        p0 = points[max(0, index - 1)]
        p1 = points[index]
        p2 = points[index + 1]
        p3 = points[min(len(points) - 1, index + 2)]
        for sample in range(12):
            t = sample / 12.0
            t2 = t * t
            t3 = t2 * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            curve.append((round(x * scale), round(y * scale)))
    curve.append((round(points[-1][0] * scale), round(points[-1][1] * scale)))
    draw.line(curve, fill="#3f6eff", width=2 * scale, joint="curve")

    def date_label(value):
        digits = re.sub(r"\D", "", str(value or ""))
        if len(digits) >= 8:
            return f"{digits[-4:-2]}/{digits[-2:]}"
        match = re.search(r"(\d{1,2})\D+(\d{1,2})$", str(value or ""))
        return f"{int(match.group(1)):02d}/{int(match.group(2)):02d}" if match else str(value or "")

    if len(rows) >= 25:
        label_indices = [0, 6, 12, 18, 24]
    else:
        label_indices = sorted({round(index * (len(rows) - 1) / 4) for index in range(5)})
    for index in label_indices:
        put(x_at(index), 397, date_label(rows[index]["date"]), axis_font, "#666666", anchor="ms")

    resampling = getattr(Image, "Resampling", Image)
    img = img.resize((width, height), getattr(resampling, "LANCZOS"))
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def main():
    raw = sys.stdin.buffer.read()
    payload = json.loads(raw.decode("utf-8"))
    paths = {}
    errors = {}
    for chart in payload.get("charts") or []:
        field = chart.get("field")
        try:
            chart_type = chart.get("type")
            ok = False
            if chart_type == "bar":
                ok = save_bar(chart)
            elif chart_type == "age-distribution":
                ok = save_age_distribution(chart)
            elif chart_type == "region-distribution":
                ok = save_region_distribution(chart)
            elif chart_type == "gender":
                ok = save_gender(chart)
            elif chart_type == "gender-age-distribution":
                ok = save_gender_age_distribution(chart)
            elif chart_type == "trend":
                ok = save_trend(chart)
            elif chart_type == "daily-note-performance":
                ok = save_daily_note_performance(chart)
            elif chart_type == "blogger-overview":
                ok = save_blogger_overview(chart)
            if ok and field:
                paths[field] = chart.get("output")
        except Exception as exc:
            if field:
                errors[field] = str(exc)
    output = json.dumps({"ok": True, "paths": paths, "errors": errors}, ensure_ascii=False)
    sys.stdout.buffer.write((output + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
