"""
sync_to_prod.py — Sync local recipes to the production Railway deployment.

What it does:
  - Compares local DB recipes against production by source_url
  - MISSING: adds the recipe by re-extracting from its source URL
  - CORRUPT: deletes the bad production copy and re-extracts
  - OK: leaves it alone

Usage:
  python sync_to_prod.py           # dry run — shows what would change
  python sync_to_prod.py --apply   # actually makes the changes
"""

import json
import sqlite3
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("Install requests first: pip install requests")
    sys.exit(1)

PROD = "https://shiny-enigma-production-ee0c.up.railway.app"
LOCAL_DB = Path(__file__).parent / "data" / "recipes.db"
DRY_RUN = "--apply" not in sys.argv


def local_recipes():
    conn = sqlite3.connect(LOCAL_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, title, source_url, ingredients FROM recipes ORDER BY id"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def prod_recipes():
    r = requests.get(f"{PROD}/api/recipes", timeout=15)
    r.raise_for_status()
    return {rec["source_url"]: rec for rec in r.json()}


def prod_detail(recipe_id):
    r = requests.get(f"{PROD}/api/recipes/{recipe_id}", timeout=15)
    r.raise_for_status()
    return r.json()


def is_corrupted(detail):
    """True if any ingredient contains the [object Object] corruption string."""
    for ing in detail.get("ingredients", []):
        text = ing.get("text", ing) if isinstance(ing, dict) else ing
        if "object Object" in str(text):
            return True
    return False


def delete_prod(recipe_id):
    requests.delete(f"{PROD}/api/recipes/{recipe_id}", timeout=15)


def add_to_prod(source_url):
    return requests.post(
        f"{PROD}/api/recipes",
        json={"url": source_url},
        timeout=60,  # extraction can be slow
    )


def main():
    print(f"{'DRY RUN — pass --apply to make changes' if DRY_RUN else 'LIVE MODE — changes will be made'}\n")

    print("Fetching local recipes...")
    local = local_recipes()
    print(f"  {len(local)} local recipes\n")

    print("Fetching production recipes...")
    try:
        prod_by_url = prod_recipes()
    except Exception as e:
        print(f"  Failed to reach production: {e}")
        sys.exit(1)
    print(f"  {len(prod_by_url)} production recipes\n")

    missing, corrupted, ok, failed = [], [], [], []

    for recipe in local:
        url = recipe["source_url"]
        title = recipe["title"]

        if url not in prod_by_url:
            missing.append(recipe)
            print(f"  MISSING  {title}")
        else:
            prod_rec = prod_by_url[url]
            detail = prod_detail(prod_rec["id"])
            if is_corrupted(detail):
                corrupted.append((recipe, prod_rec))
                print(f"  CORRUPT  {title}")
            else:
                ok.append(recipe)
                print(f"  OK       {title}")
        time.sleep(0.2)

    print(f"\nSummary: {len(ok)} ok · {len(missing)} missing · {len(corrupted)} corrupted · {len(local)} total\n")

    if not missing and not corrupted:
        print("Nothing to do.")
        return

    if DRY_RUN:
        print("Run with --apply to fix the above.")
        return

    # Fix corrupted
    for recipe, prod_rec in corrupted:
        print(f"Fixing:  {recipe['title']}")
        delete_prod(prod_rec["id"])
        time.sleep(1)
        r = add_to_prod(recipe["source_url"])
        if r.status_code == 201:
            print(f"  [OK] Re-imported")
        else:
            print(f"  [FAIL] ({r.status_code}): {r.text[:120]}")
            failed.append(recipe)
        time.sleep(1)

    # Add missing
    for recipe in missing:
        print(f"Adding:  {recipe['title']}")
        r = add_to_prod(recipe["source_url"])
        if r.status_code == 201:
            print(f"  [OK] Added")
        elif r.status_code == 409:
            print(f"  [SKIP] Already exists on prod (URL matched differently)")
        else:
            print(f"  [FAIL] ({r.status_code}): {r.text[:120]}")
            failed.append(recipe)
        time.sleep(1)

    print(f"\nDone. {len(failed)} failures." if failed else "\nDone. All succeeded.")
    if failed:
        print("Failed recipes:")
        for r in failed:
            print(f"  {r['title']}  {r['source_url']}")


if __name__ == "__main__":
    main()
