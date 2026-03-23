from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from api.deps import get_db_path
from recipe_extractor.scraper import extract_recipe
from recipe_extractor.database import (
    list_recipes, search_recipes, get_recipe, save_recipe, delete_recipe, update_recipe
)

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_EXT_MAP = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB

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
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
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
