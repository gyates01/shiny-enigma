"""Export recipes from SQLite to a formatted Excel workbook."""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from openpyxl import Workbook
from openpyxl.styles import (
    Alignment,
    Font,
    PatternFill,
    Border,
    Side,
)
from openpyxl.utils import get_column_letter

from .database import DB_PATH, _connect, init_db

# ── Styling constants ────────────────────────────────────────────────────────

HEADER_FILL = PatternFill("solid", fgColor="2E7D32")   # dark green
ALT_FILL    = PatternFill("solid", fgColor="F1F8E9")   # light green tint
WHITE_FILL  = PatternFill("solid", fgColor="FFFFFF")
HEADER_FONT = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
BODY_FONT   = Font(name="Calibri", size=10)
THIN_BORDER = Border(
    left=Side(style="thin", color="BDBDBD"),
    right=Side(style="thin", color="BDBDBD"),
    top=Side(style="thin", color="BDBDBD"),
    bottom=Side(style="thin", color="BDBDBD"),
)

# Columns: (header label, db key or callable, width)
COLUMNS = [
    ("ID",           "id",           6),
    ("Title",        "title",        35),
    ("Cuisine",      "cuisine",      16),
    ("Category",     "category",     16),
    ("Servings",     "servings",     10),
    ("Prep (min)",   "prep_time",    11),
    ("Cook (min)",   "cook_time",    11),
    ("Total (min)",  "total_time",   11),
    ("Calories",     "calories",     10),
    ("Protein (g)",  "protein_g",    11),
    ("Carbs (g)",    "carbs_g",      10),
    ("Fat (g)",      "fat_g",        9),
    ("Fiber (g)",    "fiber_g",      9),
    ("Tags",         "tags",         30),
    ("Date Added",   "date_added",   20),
    ("Source URL",   "source_url",   50),
]


def _fmt_tags(value) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value
    return ", ".join(value) if isinstance(value, list) else str(value)


def _fmt_date(value: str) -> str:
    if not value:
        return ""
    try:
        dt = datetime.fromisoformat(value)
        return dt.strftime("%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        return value


def _cell_value(row: dict, key: str):
    val = row.get(key)
    if key == "tags":
        return _fmt_tags(val)
    if key == "date_added":
        return _fmt_date(val)
    if val is None:
        return ""
    return val


def export_to_excel(
    output_path: Optional[Path] = None,
    db_path: Path = DB_PATH,
) -> Path:
    """Export all recipes to an Excel workbook. Returns the output path."""
    if output_path is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = Path(__file__).parent.parent / "exports" / f"recipes_{timestamp}.xlsx"

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    init_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute("SELECT * FROM recipes ORDER BY date_added DESC").fetchall()

    wb = Workbook()

    # ── Sheet 1: Recipes ────────────────────────────────────────────────────
    ws = wb.active
    ws.title = "Recipes"

    # Header row
    for col_idx, (label, _, width) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=False)
        cell.border = THIN_BORDER
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    ws.row_dimensions[1].height = 20
    ws.freeze_panes = "A2"

    # Data rows
    for row_idx, db_row in enumerate(rows, start=2):
        row_dict = dict(db_row)
        fill = ALT_FILL if row_idx % 2 == 0 else WHITE_FILL
        for col_idx, (_, key, _) in enumerate(COLUMNS, start=1):
            val = _cell_value(row_dict, key)
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = BODY_FONT
            cell.fill = fill
            cell.border = THIN_BORDER
            cell.alignment = Alignment(
                horizontal="left", vertical="top",
                wrap_text=(key == "source_url"),
            )

    # Auto-filter
    ws.auto_filter.ref = ws.dimensions

    # ── Sheet 2: Ingredients & Instructions ─────────────────────────────────
    ws2 = wb.create_sheet("Ingredients & Steps")

    detail_headers = ["ID", "Title", "Ingredients", "Instructions"]
    detail_widths  = [6, 35, 60, 80]
    for col_idx, (label, width) in enumerate(zip(detail_headers, detail_widths), start=1):
        cell = ws2.cell(row=1, column=col_idx, value=label)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = THIN_BORDER
        ws2.column_dimensions[get_column_letter(col_idx)].width = width

    ws2.freeze_panes = "A2"

    for row_idx, db_row in enumerate(rows, start=2):
        row_dict = dict(db_row)
        fill = ALT_FILL if row_idx % 2 == 0 else WHITE_FILL

        try:
            ingredients = json.loads(row_dict.get("ingredients") or "[]")
            ing_text = "\n".join(f"• {i}" for i in ingredients)
        except (json.JSONDecodeError, TypeError):
            ing_text = row_dict.get("ingredients", "")

        try:
            instructions = json.loads(row_dict.get("instructions") or "[]")
            inst_text = "\n".join(f"{n}. {s}" for n, s in enumerate(instructions, 1))
        except (json.JSONDecodeError, TypeError):
            inst_text = row_dict.get("instructions", "")

        for col_idx, val in enumerate(
            [row_dict["id"], row_dict["title"], ing_text, inst_text], start=1
        ):
            cell = ws2.cell(row=row_idx, column=col_idx, value=val)
            cell.font = BODY_FONT
            cell.fill = fill
            cell.border = THIN_BORDER
            cell.alignment = Alignment(
                horizontal="left", vertical="top", wrap_text=True
            )

        # Row height proportional to ingredient count
        line_count = max(
            len(ing_text.splitlines()),
            len(inst_text.splitlines()),
            1,
        )
        ws2.row_dimensions[row_idx].height = min(15 * line_count, 400)

    # ── Sheet 3: Stats summary ───────────────────────────────────────────────
    ws3 = wb.create_sheet("Stats")

    def _stat_header(cell_ref: str, text: str):
        c = ws3[cell_ref]
        c.value = text
        c.font = Font(name="Calibri", bold=True, size=12, color="FFFFFF")
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal="left")

    def _stat_row(row: int, label: str, value):
        label_cell = ws3.cell(row=row, column=1, value=label)
        label_cell.font = Font(name="Calibri", bold=True, size=10)
        val_cell = ws3.cell(row=row, column=2, value=value)
        val_cell.font = BODY_FONT

    ws3.column_dimensions["A"].width = 28
    ws3.column_dimensions["B"].width = 20

    _stat_header("A1", "Recipe Collection — Summary")
    ws3.merge_cells("A1:B1")

    _stat_row(3, "Total recipes", len(rows))

    cals = [r["calories"] for r in rows if r["calories"]]
    avg_cal = round(sum(cals) / len(cals), 1) if cals else "N/A"
    _stat_row(4, "Avg calories", avg_cal)

    times = [r["total_time"] for r in rows if r["total_time"]]
    avg_time = round(sum(times) / len(times), 1) if times else "N/A"
    _stat_row(5, "Avg total time (min)", avg_time)

    ws3.cell(row=7, column=1, value="Breakdown by Cuisine").font = Font(bold=True, size=11)
    from collections import Counter
    cuisines = Counter(
        (dict(r).get("cuisine") or "Unknown") for r in rows
    )
    for i, (cuisine, count) in enumerate(cuisines.most_common(15), start=8):
        ws3.cell(row=i, column=1, value=cuisine).font = BODY_FONT
        ws3.cell(row=i, column=2, value=count).font = BODY_FONT

    wb.save(output_path)
    return output_path
