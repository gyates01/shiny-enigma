import pytest
from pathlib import Path
from recipe_extractor.pantry import (
    init_pantry_table, add_item, list_items, delete_item, update_note
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
    item = add_item("garlic", "1 bulb", "Produce", db)
    assert item["name"] == "garlic"
    assert item["category"] == "Produce"
    assert item["note"] == "1 bulb"
    assert "id" in item

    items = list_items(db)
    assert len(items) == 1
    assert items[0]["name"] == "garlic"


def test_add_duplicate_raises(db):
    import sqlite3
    add_item("garlic", None, "Produce", db)
    with pytest.raises(sqlite3.IntegrityError):
        add_item("garlic", None, "Produce", db)


def test_list_sorted_by_category_then_name(db):
    add_item("zucchini", None, "Produce", db)
    add_item("butter", None, "Dairy", db)
    add_item("apple", None, "Produce", db)
    items = list_items(db)
    names = [i["name"] for i in items]
    assert names == ["butter", "apple", "zucchini"]


def test_delete_item(db):
    item = add_item("salt", None, "Pantry", db)
    assert delete_item(item["id"], db) is True
    assert list_items(db) == []


def test_delete_nonexistent_returns_false(db):
    init_pantry_table(db)
    assert delete_item(9999, db) is False


def test_update_note(db):
    item = add_item("flour", "1 bag", "Pantry", db)
    updated = update_note(item["id"], "running low", db)
    assert updated["note"] == "running low"
    assert updated["name"] == "flour"


def test_update_note_nonexistent_returns_none(db):
    init_pantry_table(db)
    assert update_note(9999, "test", db) is None
