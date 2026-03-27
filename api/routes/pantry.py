import sqlite3
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_db_path
from recipe_extractor.pantry import add_item, list_items, delete_item, update_item
from api.utils.normalizer import normalize_ingredient, detect_category, detect_stock_mode

router = APIRouter()


class AddItemRequest(BaseModel):
    name: str
    note: Optional[str] = None


class PatchItemRequest(BaseModel):
    note: Optional[str] = None
    stock_mode: Optional[Literal['level', 'qty']] = None
    stock_value: Optional[str] = None
    backup_value: Optional[str] = None


@router.get("/pantry")
def api_list_pantry(db: Path = Depends(get_db_path)):
    return list_items(db_path=db)


@router.post("/pantry", status_code=201)
def api_add_pantry_item(body: AddItemRequest, db: Path = Depends(get_db_path)):
    name = normalize_ingredient(body.name)
    if not name:
        raise HTTPException(status_code=422, detail="Please enter an ingredient name")
    category = detect_category(name)
    stock_mode = detect_stock_mode(category, name)
    try:
        return add_item(name, body.note, category, stock_mode, db_path=db)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail=f"'{name}' is already in your pantry")


@router.delete("/pantry/{item_id}", status_code=204)
def api_delete_pantry_item(item_id: int, db: Path = Depends(get_db_path)):
    if not delete_item(item_id, db_path=db):
        raise HTTPException(status_code=404, detail="Item not found")


@router.patch("/pantry/{item_id}")
def api_patch_pantry_item(item_id: int, body: PatchItemRequest, db: Path = Depends(get_db_path)):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update")
    updated = update_item(item_id, fields, db_path=db)
    if updated is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return updated
