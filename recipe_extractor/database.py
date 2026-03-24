"""SQLite persistence layer for the recipe extractor."""

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

_data_dir = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent / "data")))
DB_PATH = _data_dir / "recipes.db"


def _connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db(db_path: Path = DB_PATH) -> None:
    """Create tables if they don't exist."""
    with _connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS recipes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT    NOT NULL,
                source_url  TEXT    UNIQUE NOT NULL,
                date_added  TEXT    NOT NULL,
                servings    TEXT,
                prep_time   INTEGER,
                cook_time   INTEGER,
                total_time  INTEGER,
                ingredients TEXT,
                instructions TEXT,
                cuisine     TEXT,
                category    TEXT,
                tags        TEXT,
                calories    REAL,
                protein_g   REAL,
                carbs_g     REAL,
                fat_g       REAL,
                fiber_g     REAL,
                image_url   TEXT,
                description TEXT
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_title ON recipes (title COLLATE NOCASE)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cuisine ON recipes (cuisine COLLATE NOCASE)"
        )


def save_recipe(recipe: dict, db_path: Path = DB_PATH) -> int:
    """Insert or replace a recipe. Returns the row id.

    Raises sqlite3.IntegrityError if the URL already exists and replace=False.
    """
    init_db(db_path)
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "title": recipe.get("title", ""),
        "source_url": recipe["source_url"],
        "date_added": now,
        "servings": recipe.get("servings", ""),
        "prep_time": recipe.get("prep_time"),
        "cook_time": recipe.get("cook_time"),
        "total_time": recipe.get("total_time"),
        "ingredients": json.dumps(recipe.get("ingredients") or []),
        "instructions": json.dumps(recipe.get("instructions") or []),
        "cuisine": recipe.get("cuisine", ""),
        "category": recipe.get("category", ""),
        "tags": json.dumps(recipe.get("tags") or []),
        "calories": recipe.get("calories"),
        "protein_g": recipe.get("protein_g"),
        "carbs_g": recipe.get("carbs_g"),
        "fat_g": recipe.get("fat_g"),
        "fiber_g": recipe.get("fiber_g"),
        "image_url": recipe.get("image_url", ""),
        "description": recipe.get("description", ""),
    }

    with _connect(db_path) as conn:
        cur = conn.execute("""
            INSERT INTO recipes
                (title, source_url, date_added, servings, prep_time, cook_time,
                 total_time, ingredients, instructions, cuisine, category, tags,
                 calories, protein_g, carbs_g, fat_g, fiber_g, image_url, description)
            VALUES
                (:title, :source_url, :date_added, :servings, :prep_time, :cook_time,
                 :total_time, :ingredients, :instructions, :cuisine, :category, :tags,
                 :calories, :protein_g, :carbs_g, :fat_g, :fiber_g, :image_url, :description)
            ON CONFLICT(source_url) DO UPDATE SET
                title        = excluded.title,
                date_added   = excluded.date_added,
                servings     = excluded.servings,
                prep_time    = excluded.prep_time,
                cook_time    = excluded.cook_time,
                total_time   = excluded.total_time,
                ingredients  = excluded.ingredients,
                instructions = excluded.instructions,
                cuisine      = excluded.cuisine,
                category     = excluded.category,
                tags         = excluded.tags,
                calories     = excluded.calories,
                protein_g    = excluded.protein_g,
                carbs_g      = excluded.carbs_g,
                fat_g        = excluded.fat_g,
                fiber_g      = excluded.fiber_g,
                image_url    = excluded.image_url,
                description  = excluded.description
        """, row)
        return cur.lastrowid


def list_recipes(db_path: Path = DB_PATH) -> list[dict]:
    """Return all recipes as a list of dicts (lightweight — no ingredients/instructions)."""
    init_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute("""
            SELECT id, title, cuisine, category, total_time, calories, servings,
                   date_added, source_url, image_url
            FROM recipes
            ORDER BY date_added DESC
        """).fetchall()
    return [dict(r) for r in rows]


def search_recipes(query: str, db_path: Path = DB_PATH) -> list[dict]:
    """Full-text search across title, cuisine, category, tags, ingredients."""
    init_db(db_path)
    like = f"%{query}%"
    with _connect(db_path) as conn:
        rows = conn.execute("""
            SELECT id, title, cuisine, category, total_time, calories, servings,
                   date_added, source_url, image_url
            FROM recipes
            WHERE title       LIKE :q COLLATE NOCASE
               OR cuisine     LIKE :q COLLATE NOCASE
               OR category    LIKE :q COLLATE NOCASE
               OR tags        LIKE :q COLLATE NOCASE
               OR ingredients LIKE :q COLLATE NOCASE
               OR description LIKE :q COLLATE NOCASE
            ORDER BY date_added DESC
        """, {"q": like}).fetchall()
    return [dict(r) for r in rows]


def filter_recipes(
    query: str = "",
    cuisine: str = "",
    category: str = "",
    max_time: Optional[int] = None,
    db_path: Path = DB_PATH,
) -> list[dict]:
    """Return recipes matching all provided filters. Empty/None values are ignored."""
    init_db(db_path)
    conditions = []
    params: dict = {}

    if query:
        conditions.append("""(
            title       LIKE :q COLLATE NOCASE
            OR cuisine  LIKE :q COLLATE NOCASE
            OR category LIKE :q COLLATE NOCASE
            OR tags     LIKE :q COLLATE NOCASE
            OR ingredients LIKE :q COLLATE NOCASE
            OR description LIKE :q COLLATE NOCASE
        )""")
        params["q"] = f"%{query}%"

    if cuisine:
        conditions.append("cuisine = :cuisine COLLATE NOCASE")
        params["cuisine"] = cuisine

    if category:
        conditions.append("category = :category COLLATE NOCASE")
        params["category"] = category

    if max_time is not None:
        conditions.append("total_time IS NOT NULL AND total_time <= :max_time")
        params["max_time"] = max_time

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    with _connect(db_path) as conn:
        rows = conn.execute(f"""
            SELECT id, title, cuisine, category, total_time, calories, servings,
                   date_added, source_url, image_url
            FROM recipes
            {where}
            ORDER BY date_added DESC
        """, params).fetchall()
    return [dict(r) for r in rows]


def update_recipe(recipe_id: int, fields: dict, db_path: Path = DB_PATH) -> bool:
    """Update editable fields of a recipe. Returns True if a row was updated.

    List-type fields (ingredients, instructions, tags) are JSON-encoded automatically.
    source_url and date_added are not updatable.
    """
    ALLOWED = {
        "title", "description", "servings", "prep_time", "cook_time", "total_time",
        "cuisine", "category", "tags", "ingredients", "instructions",
        "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "image_url",
    }
    LIST_FIELDS = {"tags", "ingredients", "instructions"}

    safe = {k: v for k, v in fields.items() if k in ALLOWED}
    if not safe:
        return False

    for k in LIST_FIELDS:
        if k in safe and isinstance(safe[k], list):
            safe[k] = json.dumps(safe[k])

    clauses = ", ".join(f'"{k}" = :{k}' for k in safe)
    safe["_id"] = recipe_id

    init_db(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute(
            f"UPDATE recipes SET {clauses} WHERE id = :_id", safe
        )
    return cur.rowcount > 0


def get_recipe(recipe_id: int, db_path: Path = DB_PATH) -> Optional[dict]:
    """Fetch a single recipe by id, with full ingredients/instructions."""
    init_db(db_path)
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM recipes WHERE id = ?", (recipe_id,)
        ).fetchone()
    if not row:
        return None
    r = dict(row)
    r["ingredients"] = json.loads(r["ingredients"] or "[]")
    r["instructions"] = json.loads(r["instructions"] or "[]")
    r["tags"] = json.loads(r["tags"] or "[]")
    return r


def get_recipe_by_url(url: str, db_path: Path = DB_PATH) -> Optional[dict]:
    """Return id and title for a recipe matching source_url, or None."""
    init_db(db_path)
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, title FROM recipes WHERE source_url = ?", (url,)
        ).fetchone()
    return dict(row) if row else None


def get_stats(db_path: Path = DB_PATH) -> dict:
    """Return aggregate stats about the recipe collection."""
    init_db(db_path)
    with _connect(db_path) as conn:
        total = conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        avg_cal = conn.execute(
            "SELECT ROUND(AVG(calories), 1) FROM recipes WHERE calories IS NOT NULL"
        ).fetchone()[0]
        avg_time = conn.execute(
            "SELECT ROUND(AVG(total_time), 1) FROM recipes WHERE total_time IS NOT NULL"
        ).fetchone()[0]
        by_cuisine = conn.execute("""
            SELECT COALESCE(NULLIF(cuisine,''), 'Unknown') AS cuisine, COUNT(*) AS cnt
            FROM recipes
            GROUP BY cuisine
            ORDER BY cnt DESC
            LIMIT 10
        """).fetchall()
        by_category = conn.execute("""
            SELECT COALESCE(NULLIF(category,''), 'Unknown') AS category, COUNT(*) AS cnt
            FROM recipes
            GROUP BY category
            ORDER BY cnt DESC
            LIMIT 10
        """).fetchall()
    return {
        "total": total,
        "avg_calories": avg_cal,
        "avg_total_time_min": avg_time,
        "by_cuisine": [dict(r) for r in by_cuisine],
        "by_category": [dict(r) for r in by_category],
    }


def delete_recipe(recipe_id: int, db_path: Path = DB_PATH) -> bool:
    """Delete a recipe by id. Returns True if a row was deleted."""
    init_db(db_path)
    with _connect(db_path) as conn:
        cur = conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    return cur.rowcount > 0
