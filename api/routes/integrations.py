"""Todoist OAuth and shopping-list push integration."""

import os

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from recipe_extractor.database import get_setting, set_setting, delete_setting, get_recipe

router = APIRouter()

_TODOIST_AUTH_URL = "https://todoist.com/oauth/authorize"
_TODOIST_TOKEN_URL = "https://todoist.com/oauth/access_token"
_TODOIST_API = "https://api.todoist.com/rest/v2"


def _client_id() -> str:
    v = os.environ.get("TODOIST_CLIENT_ID", "")
    if not v:
        raise HTTPException(status_code=503, detail="TODOIST_CLIENT_ID not configured")
    return v


def _client_secret() -> str:
    v = os.environ.get("TODOIST_CLIENT_SECRET", "")
    if not v:
        raise HTTPException(status_code=503, detail="TODOIST_CLIENT_SECRET not configured")
    return v


@router.get("/integrations/todoist/auth")
async def todoist_auth():
    redirect_uri = os.environ.get(
        "TODOIST_REDIRECT_URI",
        "https://shiny-enigma-production-ee0c.up.railway.app/api/integrations/todoist/callback",
    )
    url = (
        f"{_TODOIST_AUTH_URL}"
        f"?client_id={_client_id()}"
        f"&scope=data:read_write"
        f"&redirect_uri={redirect_uri}"
    )
    return RedirectResponse(url)


@router.get("/integrations/todoist/callback")
async def todoist_callback(code: str = "", error: str = ""):
    if error:
        return RedirectResponse("/recipes?todoist=denied")

    redirect_uri = os.environ.get(
        "TODOIST_REDIRECT_URI",
        "https://shiny-enigma-production-ee0c.up.railway.app/api/integrations/todoist/callback",
    )
    async with httpx.AsyncClient() as client:
        resp = await client.post(_TODOIST_TOKEN_URL, data={
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "code": code,
            "redirect_uri": redirect_uri,
        })
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Token exchange failed")

    token = resp.json().get("access_token", "")
    if not token:
        raise HTTPException(status_code=502, detail="No access_token in response")

    set_setting("todoist_token", token)
    return RedirectResponse("/recipes?todoist=connected")


@router.get("/integrations/todoist/status")
async def todoist_status():
    token = get_setting("todoist_token")
    return {"connected": bool(token)}


@router.delete("/integrations/todoist/disconnect")
async def todoist_disconnect():
    delete_setting("todoist_token")
    return {"disconnected": True}


@router.post("/recipes/{recipe_id}/shopping-list")
async def send_shopping_list(recipe_id: int):
    token = get_setting("todoist_token")
    if not token:
        raise HTTPException(status_code=401, detail="Todoist not connected")

    recipe = get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    ingredients = recipe.get("ingredients") or []
    if not ingredients:
        return {"sent": 0}

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    sent = 0
    last_error = None
    async with httpx.AsyncClient() as client:
        for ing in ingredients:
            resp = await client.post(
                f"{_TODOIST_API}/tasks",
                headers=headers,
                json={"content": ing},
            )
            if resp.status_code == 200:
                sent += 1
            else:
                last_error = f"Todoist {resp.status_code}: {resp.text[:200]}"

    if sent == 0 and last_error:
        raise HTTPException(status_code=502, detail=last_error)

    return {"sent": sent}
