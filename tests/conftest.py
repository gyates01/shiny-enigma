import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from api.main import app
from api.deps import get_db_path


@pytest.fixture
def tmp_db(tmp_path):
    db = tmp_path / "test_recipes.db"
    return db


@pytest.fixture
def client(tmp_db):
    app.dependency_overrides[get_db_path] = lambda: tmp_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
