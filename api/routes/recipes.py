from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from api.deps import get_db_path
from recipe_extractor.scraper import extract_recipe
from recipe_extractor.database import (
    list_recipes, search_recipes, get_recipe, save_recipe, delete_recipe
)

router = APIRouter()


class AddRecipeRequest(BaseModel):
    url: str


@router.get("/recipes")
def api_list_recipes(q: Optional[str] = None, db: Path = Depends(get_db_path)):
    if q:
        return search_recipes(q, db_path=db)
    return list_recipes(db_path=db)


@router.post("/recipes", status_code=201)
def api_add_recipe(body: AddRecipeRequest, db: Path = Depends(get_db_path)):
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail=f"Invalid URL: {url}")
    try:
        recipe = extract_recipe(url)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    row_id = save_recipe(recipe, db_path=db)
    saved = get_recipe(row_id, db_path=db)
    return JSONResponse(content=saved, status_code=201)


@router.get("/recipes/{recipe_id}")
def api_get_recipe(recipe_id: int, db: Path = Depends(get_db_path)):
    recipe = get_recipe(recipe_id, db_path=db)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.delete("/recipes/{recipe_id}", status_code=204)
def api_delete_recipe(recipe_id: int, db: Path = Depends(get_db_path)):
    deleted = delete_recipe(recipe_id, db_path=db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Recipe not found")
