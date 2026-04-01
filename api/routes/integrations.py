"""Todoist OAuth and shopping-list push integration."""

import os

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from recipe_extractor.database import get_setting, set_setting, delete_setting, get_recipe
from recipe_extractor.pantry import list_items
from api.utils.normalizer import find_pantry_match

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

    pantry = list_items()
    missing = [
        ing for ing in (recipe.get("ingredients") or [])
        if not find_pantry_match(ing, pantry)
    ]
    if not missing:
        return {"sent": 0, "message": "All ingredients are on hand"}

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient() as client:
        # Create a project named after the recipe
        proj_resp = await client.post(
            f"{_TODOIST_API}/projects",
            headers=headers,
            json={"name": recipe["title"]},
        )
        if proj_resp.status_code in (200, 204):
            project_id = proj_resp.json().get("id")
        else:
            project_id = None  # fall back to inbox

        # Post each missing ingredient as a task
        for ing in missing:
            payload = {"content": ing}
            if project_id:
                payload["project_id"] = project_id
            await client.post(f"{_TODOIST_API}/tasks", headers=headers, json=payload)

    project_url = f"https://todoist.com/app/project/{project_id}" if project_id else "https://todoist.com/app/inbox"
    return {"sent": len(missing), "project_url": project_url}
