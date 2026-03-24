import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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

# Serve uploaded images (must be mounted before SPA catch-all)
_data_dir = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent / "data")))
_images_dir = _data_dir / "images"
_images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=_images_dir), name="images")

# Serve built React app in production
_dist = Path(__file__).parent.parent / "frontend" / "dist"

@app.get("/_debug", include_in_schema=False)
def debug():
    import os
    return {
        "dist_path": str(_dist),
        "dist_exists": _dist.exists(),
        "file": __file__,
        "cwd": os.getcwd(),
        "dist_contents": list(str(p) for p in _dist.iterdir()) if _dist.exists() else [],
    }

if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def serve_spa_root():
        return FileResponse(_dist / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(_dist / "index.html")
