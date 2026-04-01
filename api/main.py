import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api.routes import recipes, stats, export, pantry, assistant, integrations
from recipe_extractor.database import init_db

app = FastAPI(title="Recipe Extractor API")
init_db()  # ensure all tables exist before any request arrives

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recipes.router, prefix="/api")
app.include_router(stats.router,   prefix="/api")
app.include_router(export.router,  prefix="/api")
app.include_router(pantry.router,        prefix="/api")
app.include_router(assistant.router,     prefix="/api")
app.include_router(integrations.router,  prefix="/api")

# Serve uploaded images
_data_dir = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent / "data")))
_images_dir = _data_dir / "images"
try:
    _images_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/images", StaticFiles(directory=_images_dir), name="images")
except Exception:
    pass

# Serve built React app
_dist = Path(__file__).parent.parent / "frontend" / "dist"

_misc_router = APIRouter()

# Serve frontend assets (JS/CSS bundles)
if (_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

# SPA catch-all: any unmatched route returns index.html so React Router works
@_misc_router.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index = _dist / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"error": "frontend not built", "dist": str(_dist)}, status_code=404)

app.include_router(_misc_router)
