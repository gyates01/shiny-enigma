import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from api.routes import recipes, stats, export

app = FastAPI(title="Recipe Extractor API")

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

_dist = Path(__file__).parent.parent / "frontend" / "dist"

if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

@app.get("/api/_debug", include_in_schema=False)
def debug():
    return {
        "dist_path": str(_dist),
        "dist_exists": _dist.exists(),
        "file": __file__,
        "cwd": os.getcwd(),
        "dist_contents": list(str(p) for p in _dist.iterdir()) if _dist.exists() else [],
    }

@app.get("/")
def serve_root():
    if _dist.exists():
        return FileResponse(_dist / "index.html")
    return JSONResponse({"status": "running", "dist_exists": False})

@app.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str):
    if _dist.exists():
        return FileResponse(_dist / "index.html")
    return JSONResponse({"status": "running", "path": full_path, "dist_exists": False})
