from pathlib import Path
from recipe_extractor.database import DB_PATH

def get_db_path() -> Path:
    return DB_PATH
