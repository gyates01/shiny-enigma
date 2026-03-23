from pathlib import Path
from fastapi import APIRouter, Depends
from api.deps import get_db_path
from recipe_extractor.database import get_stats

router = APIRouter()

@router.get("/stats")
def api_stats(db: Path = Depends(get_db_path)):
    return get_stats(db_path=db)
