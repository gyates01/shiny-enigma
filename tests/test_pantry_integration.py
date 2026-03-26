import pytest


# Reusable fake recipe with two ingredients
FAKE_RECIPE = {
    "title": "Test Pasta",
    "source_url": "https://example.com/pasta",
    "ingredients": ["3 cloves garlic, minced", "150g pancetta"],
    "instructions": ["Cook it"],
    "cuisine": "Italian", "category": "Dinner", "servings": "2",
    "prep_time": 5, "cook_time": 15, "total_time": 20,
    "calories": 400.0, "protein_g": None, "carbs_g": None,
    "fat_g": None, "fiber_g": None, "image_url": "", "description": "", "tags": [],
}


@pytest.fixture
def seeded_client(client, monkeypatch):
    """Client with one recipe already saved."""
    import api.routes.recipes as mod
    monkeypatch.setattr(mod, "extract_recipe", lambda url: {**FAKE_RECIPE, "source_url": url})
    client.post("/api/recipes", json={"url": "https://example.com/pasta"})
    return client


def test_recipe_detail_ingredients_have_on_hand_field(seeded_client):
    recipes = seeded_client.get("/api/recipes").json()
    recipe_id = recipes[0]["id"]
    r = seeded_client.get(f"/api/recipes/{recipe_id}")
    assert r.status_code == 200
    ingredients = r.json()["ingredients"]
    # Should be list of objects, not plain strings
    assert isinstance(ingredients[0], dict)
    assert "text" in ingredients[0]
    assert "on_hand" in ingredients[0]


def test_on_hand_false_with_empty_pantry(seeded_client):
    recipe_id = seeded_client.get("/api/recipes").json()[0]["id"]
    ingredients = seeded_client.get(f"/api/recipes/{recipe_id}").json()["ingredients"]
    assert all(not ing["on_hand"] for ing in ingredients)


def test_on_hand_true_when_pantry_has_item(seeded_client):
    seeded_client.post("/api/pantry", json={"name": "garlic"})
    recipe_id = seeded_client.get("/api/recipes").json()[0]["id"]
    ingredients = seeded_client.get(f"/api/recipes/{recipe_id}").json()["ingredients"]

    garlic_ing = next(i for i in ingredients if "garlic" in i["text"])
    pancetta_ing = next(i for i in ingredients if "pancetta" in i["text"])

    assert garlic_ing["on_hand"] is True
    assert pancetta_ing["on_hand"] is False


def test_makeable_false_with_missing_ingredients(seeded_client):
    seeded_client.post("/api/pantry", json={"name": "garlic"})
    recipes = seeded_client.get("/api/recipes").json()
    assert recipes[0]["makeable"] is False


def test_makeable_true_when_all_on_hand(seeded_client):
    seeded_client.post("/api/pantry", json={"name": "garlic"})
    seeded_client.post("/api/pantry", json={"name": "pancetta"})
    recipes = seeded_client.get("/api/recipes").json()
    assert recipes[0]["makeable"] is True


def test_makeable_filter(seeded_client):
    # Without all ingredients, should not appear in ?makeable=true
    seeded_client.post("/api/pantry", json={"name": "garlic"})
    r = seeded_client.get("/api/recipes?makeable=true")
    assert r.json() == []

    # Add missing ingredient — now it should appear
    seeded_client.post("/api/pantry", json={"name": "pancetta"})
    r2 = seeded_client.get("/api/recipes?makeable=true")
    assert len(r2.json()) == 1


def test_recipe_list_always_has_makeable_field(seeded_client):
    recipes = seeded_client.get("/api/recipes").json()
    assert "makeable" in recipes[0]
