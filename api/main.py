import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

print("=== api.main loading ===", flush=True)

from api.routes import recipes, stats, export

print("=== imports done ===", flush=True)

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
try:
    _images_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/images", StaticFiles(directory=_images_dir), name="images")
except Exception as e:
    print(f"WARNING: /images setup failed: {e}", flush=True)

# Serve built React app
_dist = Path(__file__).parent.parent / "frontend" / "dist"

@app.get("/api/_distinfo")
def dist_info():
    import sys
    contents = list(_dist.iterdir()) if _dist.exists() else []
    return {
        "dist_path": str(_dist),
        "exists": _dist.exists(),
        "contents": [str(p) for p in contents],
        "cwd": str(Path.cwd()),
        "file": __file__,
        "python": sys.executable,
    }

# Serve frontend assets (JS/CSS bundles)
if (_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

# SPA catch-all: any unmatched route returns index.html so React Router works
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index = _dist / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"error": "frontend not built", "dist": str(_dist)}, status_code=404)

print(f"=== app ready, routes: {[getattr(r, 'path', repr(r)) for r in app.routes]} ===", flush=True)
