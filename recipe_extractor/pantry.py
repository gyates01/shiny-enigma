"""SQLite persistence layer for pantry items."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from recipe_extractor.database import DB_PATH, _connect


def _column_exists(conn, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def init_pantry_table(db_path: Path = DB_PATH) -> None:
    """Create pantry_items table if it doesn't exist, and migrate old schemas."""
    with _connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pantry_items (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL UNIQUE,
                note        TEXT,
                category    TEXT    NOT NULL DEFAULT 'Other',
                added_at    TEXT    NOT NULL,
                stock_mode  TEXT    DEFAULT 'level',
                stock_value TEXT
            )
        """)
        if not _column_exists(conn, 'pantry_items', 'stock_mode'):
            conn.execute("ALTER TABLE pantry_items ADD COLUMN stock_mode TEXT DEFAULT 'level'")
        if not _column_exists(conn, 'pantry_items', 'stock_value'):
            conn.execute("ALTER TABLE pantry_items ADD COLUMN stock_value TEXT")


def add_item(
    name: str,
    note: Optional[str],
    category: str,
    stock_mode: str = 'level',
    db_path: Path = DB_PATH,
) -> dict:
    """Insert a new pantry item. Raises sqlite3.IntegrityError on duplicate name."""
    init_pantry_table(db_path)
    now = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO pantry_items (name, note, category, added_at, stock_mode) "
            "VALUES (?, ?, ?, ?, ?)",
            (name, note, category, now, stock_mode),
        )
        return {
            "id": cur.lastrowid, "name": name, "note": note,
            "category": category, "added_at": now,
            "stock_mode": stock_mode, "stock_value": None,
        }


def list_items(db_path: Path = DB_PATH) -> list[dict]:
    """Return all pantry items sorted by category then name."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, note, category, added_at, stock_mode, stock_value "
            "FROM pantry_items ORDER BY category, name COLLATE NOCASE"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_item(item_id: int, db_path: Path = DB_PATH) -> bool:
    """Delete a pantry item by id. Returns True if a row was deleted."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute("DELETE FROM pantry_items WHERE id = ?", (item_id,))
    return cur.rowcount > 0


def update_note(item_id: int, note: Optional[str], db_path: Path = DB_PATH) -> Optional[dict]:
    """Compatibility shim: delegates to update_item. Will be removed in Task 4."""
    return update_item(item_id, {"note": note}, db_path)


def update_item(
    item_id: int,
    fields: dict,
    db_path: Path = DB_PATH,
) -> Optional[dict]:
    """Update allowed fields (note, stock_mode, stock_value) on a pantry item.

    Returns the updated item dict, or None if the item doesn't exist or fields is empty.
    """
    allowed = {'note', 'stock_mode', 'stock_value'}
    valid = {k: v for k, v in fields.items() if k in allowed}
    if not valid:
        return None
    init_pantry_table(db_path)
    set_clause = ', '.join(f"{k} = ?" for k in valid)
    values = list(valid.values()) + [item_id]
    with _connect(db_path) as conn:
        cur = conn.execute(
            f"UPDATE pantry_items SET {set_clause} WHERE id = ?", values
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, name, note, category, added_at, stock_mode, stock_value "
            "FROM pantry_items WHERE id = ?",
            (item_id,),
        ).fetchone()
    return dict(row)
