from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from api.deps import get_db_path
from recipe_extractor.scraper import extract_recipe
from recipe_extractor.database import (
    filter_recipes, get_recipe, get_recipe_by_url, save_recipe, delete_recipe, update_recipe
)
from recipe_extractor.pantry import list_items
from api.utils.normalizer import is_on_hand

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_EXT_MAP = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB

router = APIRouter()


class AddRecipeRequest(BaseModel):
    url: str


class UpdateRecipeRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    servings: Optional[str] = None
    prep_time: Optional[int] = None
    cook_time: Optional[int] = None
    total_time: Optional[int] = None
    cuisine: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list] = None
    ingredients: Optional[list] = None
    instructions: Optional[list] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    image_url: Optional[str] = None


@router.get("/recipes")
def api_list_recipes(
    q: Optional[str] = None,
    cuisine: Optional[str] = None,
    category: Optional[str] = None,
    max_time: Optional[int] = None,
    makeable: bool = False,
    db: Path = Depends(get_db_path),
):
    recipes = filter_recipes(
        query=q or "",
        cuisine=cuisine or "",
        category=category or "",
        max_time=max_time,
        db_path=db,
    )
    pantry_names = [item["name"] for item in list_items(db_path=db)]
    for r in recipes:
        if pantry_names:
            full = get_recipe(r["id"], db_path=db)
            r["makeable"] = all(is_on_hand(ing, pantry_names) for ing in full["ingredients"])
        else:
            r["makeable"] = False
    if makeable:
        recipes = [r for r in recipes if r["makeable"]]
    return recipes


@router.post("/recipes", status_code=201)
def api_add_recipe(body: AddRecipeRequest, db: Path = Depends(get_db_path)):
    url = body.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=422, detail=f"Invalid URL: {url}")
    existing = get_recipe_by_url(url, db_path=db)
    if existing:
        raise HTTPException(status_code=409, detail={
            "message": "Recipe already in your collection",
            "id": existing["id"],
            "title": existing["title"],
        })
    try:
        recipe = extract_recipe(url)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    row_id = save_recipe(recipe, db_path=db)
    saved = get_recipe(row_id, db_path=db)
    pantry_names = [item["name"] for item in list_items(db_path=db)]
    saved["ingredients"] = [
        {"text": ing, "on_hand": is_on_hand(ing, pantry_names)}
        for ing in saved["ingredients"]
    ]
    return JSONResponse(content=saved, status_code=201)


@router.get("/recipes/{recipe_id}")
def api_get_recipe(recipe_id: int, db: Path = Depends(get_db_path)):
    recipe = get_recipe(recipe_id, db_path=db)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    pantry_names = [item["name"] for item in list_items(db_path=db)]
    recipe["ingredients"] = [
        {"text": ing, "on_hand": is_on_hand(ing, pantry_names)}
        for ing in recipe["ingredients"]
    ]
    return recipe


@router.put("/recipes/{recipe_id}")
def api_update_recipe(
    recipe_id: int,
    body: UpdateRecipeRequest,
    db: Path = Depends(get_db_path),
):
    if not get_recipe(recipe_id, db_path=db):
        raise HTTPException(status_code=404, detail="Recipe not found")
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update")
    update_recipe(recipe_id, fields, db_path=db)
    recipe = get_recipe(recipe_id, db_path=db)
    pantry_names = [item["name"] for item in list_items(db_path=db)]
    recipe["ingredients"] = [
        {"text": ing, "on_hand": is_on_hand(ing, pantry_names)}
        for ing in recipe["ingredients"]
    ]
    return recipe


@router.delete("/recipes/{recipe_id}", status_code=204)
def api_delete_recipe(recipe_id: int, db: Path = Depends(get_db_path)):
    deleted = delete_recipe(recipe_id, db_path=db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Recipe not found")


@router.post("/recipes/{recipe_id}/image")
async def api_upload_image(
    recipe_id: int,
    file: UploadFile = File(...),
    db: Path = Depends(get_db_path),
):
    if not get_recipe(recipe_id, db_path=db):
        raise HTTPException(status_code=404, detail="Recipe not found")
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="File too large (max 10 MB)")

    images_dir = db.parent / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    ext = _EXT_MAP[file.content_type]
    dest = images_dir / f"{recipe_id}{ext}"
    dest.write_bytes(contents)

    image_url = f"/images/{recipe_id}{ext}"
    update_recipe(recipe_id, {"image_url": image_url}, db_path=db)
    return {"image_url": image_url}
