import pytest
from pathlib import Path
from recipe_extractor.pantry import (
    init_pantry_table, add_item, list_items, delete_item, update_item
)


@pytest.fixture
def db(tmp_path):
    return tmp_path / "test.db"


def test_init_creates_table(db):
    init_pantry_table(db)
    from recipe_extractor.database import _connect
    with _connect(db) as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='pantry_items'"
        ).fetchone()
    assert row is not None


def test_add_and_list(db):
    item = add_item("garlic", "1 bulb", "Produce", "qty", db)
    assert item["name"] == "garlic"
    assert item["category"] == "Produce"
    assert item["note"] == "1 bulb"
    assert "id" in item

    items = list_items(db)
    assert len(items) == 1
    assert items[0]["name"] == "garlic"


def test_add_duplicate_raises(db):
    import sqlite3
    add_item("garlic", None, "Produce", "qty", db)
    with pytest.raises(sqlite3.IntegrityError):
        add_item("garlic", None, "Produce", "qty", db)


def test_list_sorted_by_category_then_name(db):
    add_item("zucchini", None, "Produce", "qty", db)
    add_item("butter", None, "Dairy", "level", db)
    add_item("apple", None, "Produce", "qty", db)
    items = list_items(db)
    names = [i["name"] for i in items]
    assert names == ["butter", "apple", "zucchini"]


def test_delete_item(db):
    item = add_item("salt", None, "Pantry", "level", db)
    assert delete_item(item["id"], db) is True
    assert list_items(db) == []


def test_delete_nonexistent_returns_false(db):
    init_pantry_table(db)
    assert delete_item(9999, db) is False


def test_update_item_note(db):
    item = add_item("flour", "1 bag", "Pantry", "level", db)
    updated = update_item(item["id"], {"note": "running low"}, db)
    assert updated["note"] == "running low"
    assert updated["name"] == "flour"


def test_update_item_stock(db):
    item = add_item("garlic", None, "Produce", "qty", db)
    updated = update_item(item["id"], {"stock_value": "3"}, db)
    assert updated["stock_value"] == "3"
    assert updated["stock_mode"] == "qty"


def test_update_item_nonexistent_returns_none(db):
    init_pantry_table(db)
    assert update_item(9999, {"note": "test"}, db) is None


def test_update_item_empty_fields_returns_none(db):
    item = add_item("salt", None, "Pantry", "level", db)
    assert update_item(item["id"], {}, db) is None


def test_add_item_returns_stock_mode(db):
    item = add_item("chicken", None, "Meat", "qty", db)
    assert item["stock_mode"] == "qty"
    assert item["stock_value"] is None


def test_list_items_includes_stock_columns(db):
    add_item("garlic", None, "Produce", "qty", db)
    items = list_items(db)
    assert "stock_mode" in items[0]
    assert "stock_value" in items[0]


def test_migration_adds_columns_to_existing_table(db):
    """Simulate a pre-migration DB: create table without stock columns, then call init."""
    from recipe_extractor.database import _connect
    with _connect(db) as conn:
        conn.execute("""
            CREATE TABLE pantry_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                note TEXT,
                category TEXT NOT NULL DEFAULT 'Other',
                added_at TEXT NOT NULL
            )
        """)
    # Now call init — it should add the missing columns
    init_pantry_table(db)
    with _connect(db) as conn:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(pantry_items)").fetchall()]
    assert "stock_mode" in cols
    assert "stock_value" in cols


def test_add_item_returns_backup_value_none(db):
    item = add_item("soy sauce", None, "Pantry", "level", db)
    assert "backup_value" in item
    assert item["backup_value"] is None


def test_list_items_includes_backup_value(db):
    add_item("soy sauce", None, "Pantry", "level", db)
    items = list_items(db)
    assert "backup_value" in items[0]
    assert items[0]["backup_value"] is None


def test_update_item_backup_value(db):
    item = add_item("soy sauce", None, "Pantry", "level", db)
    updated = update_item(item["id"], {"backup_value": "2"}, db)
    assert updated["backup_value"] == "2"


def test_update_item_backup_value_clear(db):
    item = add_item("soy sauce", None, "Pantry", "level", db)
    update_item(item["id"], {"backup_value": "1"}, db)
    updated = update_item(item["id"], {"backup_value": None}, db)
    assert updated["backup_value"] is None


def test_migration_adds_backup_value_column(db):
    """Simulate a DB that has stock_mode/stock_value but not backup_value."""
    from recipe_extractor.database import _connect
    with _connect(db) as conn:
        conn.execute("""
            CREATE TABLE pantry_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                note TEXT,
                category TEXT NOT NULL DEFAULT 'Other',
                added_at TEXT NOT NULL,
                stock_mode TEXT DEFAULT 'level',
                stock_value TEXT
            )
        """)
    init_pantry_table(db)
    with _connect(db) as conn:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(pantry_items)").fetchall()]
    assert "backup_value" in cols
