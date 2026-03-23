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
