from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
