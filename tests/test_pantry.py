def test_list_empty(client):
    r = client.get("/api/pantry")
    assert r.status_code == 200
    assert r.json() == []


def test_add_item(client):
    r = client.post("/api/pantry", json={"name": "garlic"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "garlic"
    assert data["category"] == "Produce"
    assert data["note"] is None
    assert "id" in data


def test_add_item_with_note(client):
    r = client.post("/api/pantry", json={"name": "flour", "note": "1 bag"})
    assert r.status_code == 201
    assert r.json()["note"] == "1 bag"


def test_add_item_normalizes_name(client):
    # raw input "  Garlic  " should be stored as "garlic"
    r = client.post("/api/pantry", json={"name": "  Garlic  "})
    assert r.status_code == 201
    assert r.json()["name"] == "garlic"


def test_add_duplicate_returns_409(client):
    client.post("/api/pantry", json={"name": "garlic"})
    r = client.post("/api/pantry", json={"name": "garlic"})
    assert r.status_code == 409


def test_add_blank_name_returns_422(client):
    r = client.post("/api/pantry", json={"name": "   "})
    assert r.status_code == 422


def test_delete_item(client):
    add = client.post("/api/pantry", json={"name": "salt"})
    item_id = add.json()["id"]
    r = client.delete(f"/api/pantry/{item_id}")
    assert r.status_code == 204
    assert client.get("/api/pantry").json() == []


def test_delete_nonexistent_returns_404(client):
    r = client.delete("/api/pantry/9999")
    assert r.status_code == 404


def test_patch_note(client):
    add = client.post("/api/pantry", json={"name": "butter", "note": "1 block"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={"note": "running low"})
    assert r.status_code == 200
    assert r.json()["note"] == "running low"


def test_patch_nonexistent_returns_404(client):
    r = client.patch("/api/pantry/9999", json={"note": "test"})
    assert r.status_code == 404


def test_list_sorted_by_category_then_name(client):
    client.post("/api/pantry", json={"name": "zucchini"})  # Produce
    client.post("/api/pantry", json={"name": "butter"})    # Dairy
    client.post("/api/pantry", json={"name": "apple"})     # Produce
    items = client.get("/api/pantry").json()
    names = [i["name"] for i in items]
    assert names == ["butter", "apple", "zucchini"]


def test_add_item_returns_stock_fields(client):
    r = client.post("/api/pantry", json={"name": "garlic"})
    assert r.status_code == 201
    data = r.json()
    assert data["stock_mode"] == "qty"   # Produce → qty
    assert data["stock_value"] is None


def test_add_meat_gets_qty_mode(client):
    r = client.post("/api/pantry", json={"name": "chicken"})
    assert r.status_code == 201
    assert r.json()["stock_mode"] == "qty"


def test_add_pantry_item_gets_level_mode(client):
    r = client.post("/api/pantry", json={"name": "flour"})
    assert r.status_code == 201
    assert r.json()["stock_mode"] == "level"


def test_patch_stock_value(client):
    add = client.post("/api/pantry", json={"name": "garlic"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={"stock_value": "3"})
    assert r.status_code == 200
    assert r.json()["stock_value"] == "3"


def test_patch_stock_mode(client):
    add = client.post("/api/pantry", json={"name": "flour"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={"stock_mode": "qty", "stock_value": None})
    assert r.status_code == 200
    assert r.json()["stock_mode"] == "qty"
    assert r.json()["stock_value"] is None


def test_patch_empty_body_returns_422(client):
    add = client.post("/api/pantry", json={"name": "salt"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={})
    assert r.status_code == 422


def test_add_item_returns_backup_value_field(client):
    r = client.post("/api/pantry", json={"name": "soy sauce"})
    assert r.status_code == 201
    assert "backup_value" in r.json()
    assert r.json()["backup_value"] is None


def test_patch_backup_value(client):
    add = client.post("/api/pantry", json={"name": "soy sauce"})
    item_id = add.json()["id"]
    r = client.patch(f"/api/pantry/{item_id}", json={"backup_value": "2"})
    assert r.status_code == 200
    assert r.json()["backup_value"] == "2"


def test_patch_backup_value_clear(client):
    add = client.post("/api/pantry", json={"name": "soy sauce"})
    item_id = add.json()["id"]
    client.patch(f"/api/pantry/{item_id}", json={"backup_value": "1"})
    r = client.patch(f"/api/pantry/{item_id}", json={"backup_value": None})
    assert r.status_code == 200
    assert r.json()["backup_value"] is None
