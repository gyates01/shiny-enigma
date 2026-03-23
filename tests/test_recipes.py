import pytest
import api.routes.recipes as recipes_mod


def _raise_value_error(url):
    raise ValueError("No recipe found")


def test_list_recipes_empty(client):
    r = client.get("/api/recipes")
    assert r.status_code == 200
    assert r.json() == []


def test_add_and_list_recipe(client, monkeypatch):
    # Patch scraper so we don't hit the network
    fake = {
        "title": "Test Recipe",
        "source_url": "https://example.com/recipe",
        "ingredients": ["1 cup flour"],
        "instructions": ["Mix it"],
        "cuisine": "Italian",
        "category": "Dinner",
        "servings": "4",
        "prep_time": 10,
        "cook_time": 20,
        "total_time": 30,
        "calories": 300.0,
        "protein_g": None,
        "carbs_g": None,
        "fat_g": None,
        "fiber_g": None,
        "image_url": "",
        "description": "",
        "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda url: {**fake, "source_url": url})

    r = client.post("/api/recipes", json={"url": "https://example.com/recipe"})
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Test Recipe"

    r2 = client.get("/api/recipes")
    assert len(r2.json()) == 1


def test_get_recipe_detail(client, monkeypatch):
    fake = {
        "title": "Test Recipe",
        "source_url": "https://example.com/recipe",
        "ingredients": ["1 cup flour"],
        "instructions": ["Mix it"],
        "cuisine": "Italian", "category": "Dinner", "servings": "4",
        "prep_time": 10, "cook_time": 20, "total_time": 30,
        "calories": 300.0, "protein_g": None, "carbs_g": None,
        "fat_g": None, "fiber_g": None, "image_url": "", "description": "", "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda url: {**fake, "source_url": url})

    add = client.post("/api/recipes", json={"url": "https://example.com/recipe"})
    recipe_id = add.json()["id"]

    r = client.get(f"/api/recipes/{recipe_id}")
    assert r.status_code == 200
    assert r.json()["ingredients"] == ["1 cup flour"]


def test_get_recipe_not_found(client):
    r = client.get("/api/recipes/9999")
    assert r.status_code == 404


def test_delete_recipe(client, monkeypatch):
    fake = {
        "title": "Test Recipe", "source_url": "https://example.com/recipe",
        "ingredients": [], "instructions": [], "cuisine": "", "category": "",
        "servings": "", "prep_time": None, "cook_time": None, "total_time": None,
        "calories": None, "protein_g": None, "carbs_g": None, "fat_g": None,
        "fiber_g": None, "image_url": "", "description": "", "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda url: {**fake, "source_url": url})

    add = client.post("/api/recipes", json={"url": "https://example.com/recipe"})
    recipe_id = add.json()["id"]

    r = client.delete(f"/api/recipes/{recipe_id}")
    assert r.status_code == 204

    r2 = client.get(f"/api/recipes/{recipe_id}")
    assert r2.status_code == 404


def test_search_recipes(client, monkeypatch):
    fake = {
        "title": "Chicken Tikka", "source_url": "https://example.com/tikka",
        "ingredients": ["chicken"], "instructions": [], "cuisine": "Indian",
        "category": "", "servings": "", "prep_time": None, "cook_time": None,
        "total_time": None, "calories": None, "protein_g": None, "carbs_g": None,
        "fat_g": None, "fiber_g": None, "image_url": "", "description": "", "tags": [],
    }
    monkeypatch.setattr(recipes_mod, "extract_recipe", lambda url: {**fake, "source_url": url})
    client.post("/api/recipes", json={"url": "https://example.com/tikka"})

    r = client.get("/api/recipes?q=chicken")
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = client.get("/api/recipes?q=pasta")
    assert r2.json() == []


def test_add_recipe_invalid_url(client):
    r = client.post("/api/recipes", json={"url": "not-a-url"})
    assert r.status_code == 422
    assert "Invalid URL" in r.json()["detail"]


def test_add_recipe_scraper_error(client, monkeypatch):
    monkeypatch.setattr(recipes_mod, "extract_recipe", _raise_value_error)

    r = client.post("/api/recipes", json={"url": "https://example.com/nope"})
    assert r.status_code == 422
    assert "No recipe found" in r.json()["detail"]


# Tests for filter_recipes and update_recipe (Task 1)
from recipe_extractor.database import filter_recipes, update_recipe, save_recipe, init_db


def _seed(db, **overrides):
    """Helper: save a recipe to db and return its id."""
    recipe = {
        "title": "Test", "source_url": "https://example.com/test",
        "ingredients": ["flour"], "instructions": ["mix"],
        "cuisine": "Italian", "category": "Dinner",
        "servings": "4", "prep_time": 10, "cook_time": 20, "total_time": 30,
        "calories": 300.0, "protein_g": None, "carbs_g": None,
        "fat_g": None, "fiber_g": None, "image_url": "https://img.com/a.jpg",
        "description": "", "tags": [],
    }
    recipe.update(overrides)
    return save_recipe(recipe, db_path=db)


def test_filter_recipes_returns_all_when_no_filters(tmp_db):
    _seed(tmp_db)
    _seed(tmp_db, title="Other", source_url="https://example.com/other",
          cuisine="French", category="Lunch")
    results = filter_recipes(db_path=tmp_db)
    assert len(results) == 2


def test_filter_recipes_by_cuisine(tmp_db):
    _seed(tmp_db)
    _seed(tmp_db, title="French dish", source_url="https://example.com/french",
          cuisine="French", category="Lunch")
    results = filter_recipes(cuisine="Italian", db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["cuisine"] == "Italian"


def test_filter_recipes_by_category(tmp_db):
    _seed(tmp_db)
    _seed(tmp_db, title="Lunch dish", source_url="https://example.com/lunch",
          cuisine="Italian", category="Lunch")
    results = filter_recipes(category="Dinner", db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["category"] == "Dinner"


def test_filter_recipes_by_max_time(tmp_db):
    _seed(tmp_db)  # total_time=30
    _seed(tmp_db, title="Quick", source_url="https://example.com/quick",
          total_time=15)
    results = filter_recipes(max_time=20, db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["title"] == "Quick"


def test_filter_recipes_combined(tmp_db):
    _seed(tmp_db)  # Italian, Dinner, 30 min
    _seed(tmp_db, title="French dinner", source_url="https://example.com/fd",
          cuisine="French", category="Dinner", total_time=25)
    results = filter_recipes(cuisine="Italian", max_time=30, db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["cuisine"] == "Italian"


def test_filter_recipes_includes_image_url(tmp_db):
    _seed(tmp_db)
    results = filter_recipes(db_path=tmp_db)
    assert "image_url" in results[0]
    assert results[0]["image_url"] == "https://img.com/a.jpg"


def test_filter_recipes_text_query(tmp_db):
    _seed(tmp_db)  # title="Test"
    _seed(tmp_db, title="Pasta", source_url="https://example.com/pasta",
          cuisine="Italian")
    results = filter_recipes(query="Pasta", db_path=tmp_db)
    assert len(results) == 1
    assert results[0]["title"] == "Pasta"


def test_update_recipe_title(tmp_db):
    rid = _seed(tmp_db)
    result = update_recipe(rid, {"title": "Updated"}, db_path=tmp_db)
    assert result is True
    from recipe_extractor.database import get_recipe
    r = get_recipe(rid, db_path=tmp_db)
    assert r["title"] == "Updated"


def test_update_recipe_list_fields_stored_as_json(tmp_db):
    rid = _seed(tmp_db)
    update_recipe(rid, {"ingredients": ["a", "b"], "tags": ["quick"]}, db_path=tmp_db)
    from recipe_extractor.database import get_recipe
    r = get_recipe(rid, db_path=tmp_db)
    assert r["ingredients"] == ["a", "b"]
    assert r["tags"] == ["quick"]


def test_update_recipe_nonexistent_returns_false(tmp_db):
    init_db(tmp_db)
    result = update_recipe(9999, {"title": "x"}, db_path=tmp_db)
    assert result is False
