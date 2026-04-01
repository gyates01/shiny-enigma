import os
from pathlib import Path
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_db_path
from recipe_extractor.database import get_recipe

router = APIRouter()

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")
        _client = anthropic.Anthropic(api_key=key)
    return _client


class AskRequest(BaseModel):
    question: str


@router.post("/recipes/{recipe_id}/ask")
def api_ask_recipe(recipe_id: int, body: AskRequest, db: Path = Depends(get_db_path)):
    recipe = get_recipe(recipe_id, db_path=db)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    ingredients = [
        (i["text"] if isinstance(i, dict) else i)
        for i in recipe.get("ingredients") or []
    ]
    instructions = recipe.get("instructions") or []

    system = (
        "You are a concise, helpful cooking assistant. "
        "Answer questions specifically about the recipe provided. "
        "Keep responses focused and practical — no lengthy preambles."
    )

    recipe_context = (
        f"Recipe: {recipe['title']}\n"
        f"Serves: {recipe.get('servings', 'unknown')}\n"
        f"Total time: {recipe.get('total_time', 'unknown')} min\n\n"
        f"Ingredients:\n" + "\n".join(f"- {i}" for i in ingredients) + "\n\n"
        f"Instructions:\n" + "\n".join(f"{n+1}. {s}" for n, s in enumerate(instructions))
    )

    message = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=system,
        messages=[{"role": "user", "content": f"{recipe_context}\n\n---\n\n{body.question}"}],
    )

    return {"answer": message.content[0].text}
