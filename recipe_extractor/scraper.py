"""Extract structured recipe data from a URL.

Primary strategy: recipe-scrapers (handles 300+ sites via schema.org + site-specific parsers).
Fallback: attempt raw schema.org/Recipe JSON-LD extraction via BeautifulSoup.
"""

import json
import re
from typing import Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

try:
    from recipe_scrapers import scrape_me, WebsiteNotImplementedError
    _SCRAPERS_AVAILABLE = True
except ImportError:
    _SCRAPERS_AVAILABLE = False


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}
TIMEOUT = 15


def _minutes(value) -> Optional[int]:
    """Convert a time value (int, timedelta, ISO 8601 duration string) to minutes."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    # timedelta
    if hasattr(value, "total_seconds"):
        secs = value.total_seconds()
        return int(secs // 60) if secs else None
    s = str(value).strip()
    if not s:
        return None
    # ISO 8601 duration e.g. PT1H30M
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s, re.IGNORECASE)
    if m:
        hours = int(m.group(1) or 0)
        mins = int(m.group(2) or 0)
        secs = int(m.group(3) or 0)
        total = hours * 60 + mins + round(secs / 60)
        return total or None
    # plain integer string
    if s.isdigit():
        return int(s)
    return None


def _coerce_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if v]
    if isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line.strip()]
    return []


def _safe_call(fn, *args, default=None):
    try:
        return fn(*args)
    except Exception:
        return default


def _scrape_with_library(url: str) -> dict:
    """Use recipe-scrapers to extract data."""
    scraper = scrape_me(url)

    nutrients = _safe_call(scraper.nutrients, default={}) or {}

    def _nut(key: str) -> Optional[float]:
        val = nutrients.get(key)
        if val is None:
            return None
        # strip units like "10g", "150 kcal"
        m = re.search(r"[\d.]+", str(val))
        return float(m.group()) if m else None

    return {
        "title": _safe_call(scraper.title, default=""),
        "description": _safe_call(scraper.description, default=""),
        "servings": _safe_call(scraper.yields, default=""),
        "prep_time": _minutes(_safe_call(scraper.prep_time)),
        "cook_time": _minutes(_safe_call(scraper.cook_time)),
        "total_time": _minutes(_safe_call(scraper.total_time)),
        "ingredients": _coerce_list(_safe_call(scraper.ingredients, default=[])),
        "instructions": _coerce_list(_safe_call(scraper.instructions_list, default=[])),
        "image_url": _safe_call(scraper.image, default=""),
        "cuisine": _safe_call(scraper.cuisine, default=""),
        "category": _safe_call(scraper.category, default=""),
        "tags": _coerce_list(_safe_call(scraper.tags, default=[])),
        "calories": _nut("calories") or _nut("calorieContent"),
        "protein_g": _nut("proteinContent"),
        "carbs_g": _nut("carbohydrateContent"),
        "fat_g": _nut("fatContent"),
        "fiber_g": _nut("fiberContent"),
    }


def _extract_image(img) -> str:
    """Extract a URL string from schema.org image field (str, dict, or list)."""
    if isinstance(img, str):
        return img
    if isinstance(img, list) and img:
        img = img[0]
    if isinstance(img, dict):
        return img.get("url", "")
    return ""


def _scrape_jsonld_fallback(url: str) -> dict:
    """Parse schema.org/Recipe JSON-LD from the page source directly."""
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    data = {}
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            payload = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        # Handle @graph arrays
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict) and "Recipe" in str(item.get("@type", "")):
                    data = item
                    break
        elif isinstance(payload, dict):
            if "Recipe" in str(payload.get("@type", "")):
                data = payload
            elif "@graph" in payload:
                for item in payload["@graph"]:
                    if isinstance(item, dict) and "Recipe" in str(item.get("@type", "")):
                        data = item
                        break
        if data:
            break

    if not data:
        raise ValueError("No schema.org/Recipe JSON-LD found on page")

    def _nut(key: str) -> Optional[float]:
        val = (data.get("nutrition") or {}).get(key)
        if val is None:
            return None
        m = re.search(r"[\d.]+", str(val))
        return float(m.group()) if m else None

    raw_instructions = data.get("recipeInstructions", [])
    if isinstance(raw_instructions, list):
        steps = []
        for item in raw_instructions:
            if isinstance(item, str):
                steps.append(item.strip())
            elif isinstance(item, dict):
                steps.append((item.get("text") or "").strip())
        instructions = [s for s in steps if s]
    else:
        instructions = _coerce_list(raw_instructions)

    return {
        "title": data.get("name", ""),
        "description": data.get("description", ""),
        "servings": str(data.get("recipeYield", "")),
        "prep_time": _minutes(data.get("prepTime")),
        "cook_time": _minutes(data.get("cookTime")),
        "total_time": _minutes(data.get("totalTime")),
        "ingredients": _coerce_list(data.get("recipeIngredient", [])),
        "instructions": instructions,
        "image_url": _extract_image(data.get("image")),
        "cuisine": (
            ", ".join(data["recipeCuisine"])
            if isinstance(data.get("recipeCuisine"), list)
            else str(data.get("recipeCuisine") or "")
        ),
        "category": (
            ", ".join(data["recipeCategory"])
            if isinstance(data.get("recipeCategory"), list)
            else str(data.get("recipeCategory") or "")
        ),
        "tags": _coerce_list(data.get("keywords", [])),
        "calories": _nut("calories") or _nut("calorieContent"),
        "protein_g": _nut("proteinContent"),
        "carbs_g": _nut("carbohydrateContent"),
        "fat_g": _nut("fatContent"),
        "fiber_g": _nut("fiberContent"),
    }


def extract_recipe(url: str) -> dict:
    """Extract recipe data from a URL. Returns a dict ready for database insertion.

    Raises:
        ValueError: if no recipe data could be extracted.
        requests.RequestException: on network errors.
    """
    url = url.strip()
    # Validate URL
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid URL (must start with http/https): {url}")

    errors = []

    # Strategy 1: recipe-scrapers
    if _SCRAPERS_AVAILABLE:
        try:
            recipe = _scrape_with_library(url)
            if recipe.get("title"):
                recipe["source_url"] = url
                return recipe
            errors.append("recipe-scrapers returned no title")
        except Exception as exc:
            errors.append(f"recipe-scrapers: {exc}")

    # Strategy 2: JSON-LD fallback
    try:
        recipe = _scrape_jsonld_fallback(url)
        if recipe.get("title"):
            recipe["source_url"] = url
            return recipe
        errors.append("JSON-LD fallback returned no title")
    except Exception as exc:
        errors.append(f"JSON-LD fallback: {exc}")

    raise ValueError(
        f"Could not extract recipe from {url}.\n  " + "\n  ".join(errors)
    )
