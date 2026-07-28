# -*- coding: utf-8 -*-
import base64
import io
import json
import math
import os
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


def save_gender(chart):
    data = chart.get("data") or {}
    female = to_num(data.get("female"))
    male = to_num(data.get("male"))
    total = female + male
    if total <= 0:
        return False
    female = female / total * 100
    male = male / total * 100
    width = height = 520
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text((34, 24), "粉丝性别分布", font=FONT_TITLE, fill="#111827")
    box = (118, 92, 402, 376)
    female_angle = 360 * female / 100
    draw.pieslice(box, start=-90, end=-90 + female_angle, fill="#2563eb")
    draw.pieslice(box, start=-90 + female_angle, end=270, fill="#7dd3fc")
    draw.ellipse((184, 158, 336, 310), fill="white")
    center = f"{female:.1f}%"
    draw.text((260 - text_width(draw, center, FONT_TITLE) / 2, 220), center, font=FONT_TITLE, fill="#111827")
    draw.text((220, 252), "女性占比", font=FONT_SMALL, fill="#64748b")
    rounded_rect(draw, (98, 424, 120, 446), 4, "#2563eb")
    draw.text((132, 420), f"女性 {female:.1f}%", font=FONT_TEXT, fill="#334155")
    rounded_rect(draw, (314, 424, 336, 446), 4, "#7dd3fc")
    draw.text((348, 420), f"男性 {male:.1f}%", font=FONT_TEXT, fill="#334155")
    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def trend_points(rows):
    points = []
    for row in rows or []:
        value = to_num(row.get("num", row.get("value")))
        date = str(row.get("dateKey", row.get("date", "")) or "")
        if math.isfinite(value):
            points.append({"date": date, "num": value})
    return points


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
        ((379, 50, 517, 83), "图文+视频"),
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
    font_18 = load_font(18)
    font_19 = load_font(19)
    font_20 = load_font(20)
    font_21 = load_font(21)
    font_22 = load_font(22)
    font_24 = load_font(24)
    font_24_bold = load_font(24, True)
    font_26_bold = load_font(26, True)
    font_27 = load_font(27)
    font_27_bold = load_font(27, True)
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

    # Static PGY page chrome.
    box((96, 20, 616, 118), 14)
    box((126, 42, 340, 90), 5, "white", "#eeeeee")
    box((340, 42, 586, 90), 5, "#f6f6f6")
    put(188, 52, "笔记主页", font_24_bold)
    put(424, 52, "直播主页", font_24, "#666666")
    box((650, 20, 1948, 94), 14)
    put(712, 41, "数据概览", font_26_bold)
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
    put(252, 168, value("nickname"), font_24_bold, max_width=230)
    draw.ellipse((378, 176, 402, 200), fill="#e9f1ff")
    if bool(data.get("verified")):
        draw.ellipse((415, 176, 439, 200), fill="#edf9ef", outline="#5ab76b", width=2)
        line(421, 188, 425, 192, "#5ab76b", 2)
        line(425, 192, 432, 183, "#5ab76b", 2)
    put(252, 216, "小红书号：", font_19, "#999999")
    put(354, 216, value("redId"), font_20, "#5273b4", 190)
    put(252, 256, f"● {value('location')}", font_18, "#999999", 150)
    draw.rectangle((420, 260, 432, 274), outline="#777777", width=2)
    line(424, 263, 424, 271, "#777777")
    line(428, 263, 428, 271, "#777777")
    put(440, 256, value("mcn"), font_18, "#5273b4", 130)
    tags = data.get("categoryTags") if isinstance(data.get("categoryTags"), list) else []
    for index, tag in enumerate(tags[:3]):
        x = 126 + index * 112
        box((x, 303, x + 92, 333), 4, "#f2f2f2")
        put(x + 10, 307, str(tag), font_18, "#595959", 72)
    put(198, 382, "粉丝数", font_22)
    put(402, 382, "获赞与收藏", font_22)
    put(192, 425, value("fansText"), font_32_bold)
    put(402, 425, value("likeCollectText"), font_32_bold)
    line(126, 500, 586, 500, "#f1f1f1")
    box((126, 530, 336, 586), 6, "#f7f7f7")
    box((352, 530, 586, 586), 6, "#f23b49")
    put(190, 545, "☆ 收藏", font_22)
    draw.ellipse((406, 548, 420, 562), outline="white", width=2)
    draw.ellipse((416, 548, 430, 562), outline="white", width=2)
    put(442, 545, "邀约", font_22, "white")

    box((96, 650, 616, 1040), 14)
    put(126, 676, "合作报价", font_28_bold)
    for y, label, key in [
        (736, "图文笔记一口价", "picturePriceText"),
        (882, "视频笔记一口价", "videoPriceText"),
    ]:
        box((126, y, 586, y + 126), 5, "white", "#e8e8e8")
        put(158, y + 26, label, font_22, "#595959")
        put(158, y + 70, value(key), font_27)
        draw.ellipse((538, y + 48, 566, y + 76), outline="#d73c51", width=3)
        put(545, y + 47, "+", font_22, "#d73c51")

    # Overview content column.
    box((650, 112, 1948, 1040), 14)
    put(700, 142, "数据概览", font_28_bold)
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
    box((726, 372, 760, 406), 8, "#fff0e7")
    for y in (381, 388, 395):
        line(736, y, 750, y, "#e8753a", 2)
    put(778, 371, "笔记数据", font_27_bold)
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
        put(x, 548, value(value_key), font_31_bold, "#111111")
        put(x, 585, value(peer_key), font_19, "#777777")
    line(1078, 506, 1078, 608)
    line(1500, 506, 1500, 608)

    box((700, 662, 1274, 902), 9, "white", "#e8e8e8")
    box((726, 690, 760, 724), 8, "#e8f4ff")
    put(738, 696, "◇", font_19, "#4a91d8")
    put(778, 689, "服务表现", font_27_bold)
    put(726, 755, "近7天活跃天数", font_21, "#666666")
    dashed(726, 786, 862)
    put(726, 800, value("activeDaysText"), font_31_bold, "#111111")
    box((726, 846, 806, 875), 0, "#eef2ff")
    put(736, 846, value("activeLabelText"), font_18, "#5273b4", 62)
    line(986, 758, 986, 866)
    put(1020, 755, "邀约48小时回复率", font_21, "#666666")
    dashed(1020, 786, 1180)
    put(1020, 800, value("replyRateText"), font_31_bold, "#111111")
    box((1020, 846, 1112, 875), 0, "#eef2ff")
    put(1030, 846, value("replyLabelText"), font_18, "#5273b4", 72)

    box((1300, 662, 1898, 902), 9, "white", "#e8e8e8")
    box((1326, 690, 1360, 724), 8, "#e8f7f4")
    line(1335, 713, 1335, 701, "#58aa9b", 2)
    line(1335, 713, 1351, 713, "#58aa9b", 2)
    line(1338, 709, 1343, 704, "#58aa9b", 2)
    line(1343, 704, 1348, 707, "#58aa9b", 2)
    line(1348, 707, 1353, 698, "#58aa9b", 2)
    put(1378, 689, "成长表现", font_27_bold)
    put(1326, 755, "粉丝量变化幅度", font_21, "#666666")
    dashed(1326, 786, 1464)
    put(1326, 800, value("fansGrowthText"), font_31_bold, "#111111")
    put(1326, 846, value("fansGrowthPeerText"), font_19, "#777777")

    output = chart.get("output")
    ensure_dir(output)
    img.save(output, "PNG", optimize=True)
    return True


def save_trend(chart):
    rows = trend_points(chart.get("rows"))
    if len(rows) < 2:
        return False
    width, height = 800, 430
    left, right, top, bottom = 78, 34, 74, 58
    plot_w = width - left - right
    plot_h = height - top - bottom
    values = [row["num"] for row in rows]
    min_v = min(values)
    max_v = max(values)
    span = max(max_v - min_v, 1)
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text((34, 24), "粉丝增长趋势", font=FONT_TITLE, fill="#111827")
    for i in range(5):
        y = top + plot_h * i / 4
        draw.line((left, y, width - right, y), fill="#e5e7eb", width=1)
        label_v = max_v - span * i / 4
        label = f"{label_v / 10000:.1f}w" if abs(label_v) >= 10000 else str(int(round(label_v)))
        draw.text((left - 12 - text_width(draw, label, FONT_SMALL), y - 8), label, font=FONT_SMALL, fill="#64748b")

    def x_at(index):
        return left + plot_w * index / (len(rows) - 1)

    def y_at(value):
        return top + (max_v - value) / span * plot_h

    points = [(x_at(index), y_at(row["num"])) for index, row in enumerate(rows)]
    for a, b in zip(points, points[1:]):
        draw.line((a[0], a[1], b[0], b[1]), fill="#2563eb", width=4)
    for x, y in points:
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill="#2563eb")
    step = max(1, len(rows) // 6)
    for i, row in enumerate(rows):
        if i % step == 0 or i == len(rows) - 1:
            label = row["date"]
            if len(label) >= 8 and label.isdigit():
                label = label[4:6] + "/" + label[6:8]
            x = x_at(i)
            draw.text((x - text_width(draw, label, FONT_SMALL) / 2, height - 38), label, font=FONT_SMALL, fill="#64748b")
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
            elif chart_type == "gender":
                ok = save_gender(chart)
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
