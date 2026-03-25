"""SQLite persistence layer for pantry items."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from recipe_extractor.database import DB_PATH, _connect


def init_pantry_table(db_path: Path = DB_PATH) -> None:
    """Create pantry_items table if it doesn't exist."""
    with _connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pantry_items (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                name      TEXT    NOT NULL UNIQUE,
                note      TEXT,
                category  TEXT    NOT NULL DEFAULT 'Other',
                added_at  TEXT    NOT NULL
            )
        """)


def add_item(
    name: str,
    note: Optional[str],
    category: str,
    db_path: Path = DB_PATH,
) -> dict:
    """Insert a new pantry item. Raises sqlite3.IntegrityError on duplicate name."""
    init_pantry_table(db_path)
    now = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        cur = conn.execute(
            "INSERT INTO pantry_items (name, note, category, added_at) VALUES (?, ?, ?, ?)",
            (name, note, category, now),
        )
        return {"id": cur.lastrowid, "name": name, "note": note, "category": category, "added_at": now}


def list_items(db_path: Path = DB_PATH) -> list[dict]:
    """Return all pantry items sorted by category then name."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, note, category, added_at FROM pantry_items "
            "ORDER BY category, name COLLATE NOCASE"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_item(item_id: int, db_path: Path = DB_PATH) -> bool:
    """Delete a pantry item by id. Returns True if a row was deleted."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute("DELETE FROM pantry_items WHERE id = ?", (item_id,))
    return cur.rowcount > 0


def update_note(item_id: int, note: str, db_path: Path = DB_PATH) -> Optional[dict]:
    """Update the note field of a pantry item. Returns updated item or None if not found."""
    init_pantry_table(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute(
            "UPDATE pantry_items SET note = ? WHERE id = ?", (note, item_id)
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, name, note, category, added_at FROM pantry_items WHERE id = ?",
            (item_id,),
        ).fetchone()
    return dict(row)
