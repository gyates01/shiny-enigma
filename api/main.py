import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import recipes, stats, export

app = FastAPI(title="Recipe Extractor API")

import logging
_logger = logging.getLogger("uvicorn.error")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recipes.router, prefix="/api")
app.include_router(stats.router,   prefix="/api")
app.include_router(export.router,  prefix="/api")

# Serve uploaded images
_data_dir = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent / "data")))
_images_dir = _data_dir / "images"
_images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=_images_dir), name="images")

# Serve built React app — html=True serves index.html for / and unknown paths (SPA mode)
_dist = Path(__file__).parent.parent / "frontend" / "dist"
_logger.info(f"STARTUP: dist path={_dist}, exists={_dist.exists()}")
if _dist.exists():
    _logger.info(f"STARTUP: dist contents={list(_dist.iterdir())}")
    app.mount("/", StaticFiles(directory=_dist, html=True), name="spa")
else:
    _logger.warning("STARTUP: frontend/dist not found — SPA will not be served")
