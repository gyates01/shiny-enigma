"""Command-line interface for the recipe extractor."""

import argparse
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box

console = Console()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _time_str(minutes) -> str:
    if minutes is None:
        return "—"
    h, m = divmod(int(minutes), 60)
    return f"{h}h {m}m" if h else f"{m}m"


def _trunc(text: str, n: int = 40) -> str:
    if not text:
        return "—"
    return text if len(text) <= n else text[: n - 1] + "…"


# ── Commands ─────────────────────────────────────────────────────────────────

def cmd_add(args):
    from .scraper import extract_recipe
    from .database import save_recipe

    urls = args.urls
    ok = 0
    for url in urls:
        console.print(f"[cyan]Fetching:[/cyan] {url}")
        try:
            recipe = extract_recipe(url)
            save_recipe(recipe)
            console.print(
                f"  [green]✓[/green] Saved: [bold]{recipe['title']}[/bold]"
            )
            ok += 1
        except Exception as exc:
            console.print(f"  [red]✗[/red] {exc}")

    if len(urls) > 1:
        console.print(f"\n[bold]Done:[/bold] {ok}/{len(urls)} recipes saved.")


def cmd_list(args):
    from .database import list_recipes

    recipes = list_recipes()
    if not recipes:
        console.print("[yellow]No recipes saved yet.[/yellow]")
        return

    table = Table(
        title=f"Saved Recipes ({len(recipes)})",
        box=box.ROUNDED,
        show_lines=False,
        highlight=True,
    )
    table.add_column("#",        style="dim",    width=4,  justify="right")
    table.add_column("Title",    style="bold",   min_width=25, max_width=40)
    table.add_column("Cuisine",  style="cyan",   width=14)
    table.add_column("Category", style="magenta",width=14)
    table.add_column("Time",     style="green",  width=8,  justify="right")
    table.add_column("Cal",      style="yellow", width=6,  justify="right")
    table.add_column("Servings", width=8)
    table.add_column("Added",    style="dim",    width=12)

    for r in recipes:
        date_short = (r["date_added"] or "")[:10]
        table.add_row(
            str(r["id"]),
            _trunc(r["title"], 40),
            r.get("cuisine") or "—",
            r.get("category") or "—",
            _time_str(r.get("total_time")),
            str(int(r["calories"])) if r.get("calories") else "—",
            r.get("servings") or "—",
            date_short,
        )

    console.print(table)


def cmd_search(args):
    from .database import search_recipes

    results = search_recipes(args.query)
    if not results:
        console.print(f"[yellow]No recipes found matching '{args.query}'.[/yellow]")
        return

    console.print(f"[bold]Found {len(results)} result(s) for '{args.query}':[/bold]\n")
    for r in results:
        console.print(
            f"  [bold cyan]{r['id']:>3}.[/bold cyan] [bold]{r['title']}[/bold]"
            f"  [dim]{r.get('cuisine') or ''}  {_time_str(r.get('total_time'))}[/dim]"
        )
        console.print(f"       [dim blue]{r['source_url']}[/dim blue]")


def cmd_show(args):
    from .database import get_recipe

    recipe = get_recipe(args.id)
    if not recipe:
        console.print(f"[red]No recipe with id {args.id}.[/red]")
        return

    lines = [
        f"[bold yellow]{recipe['title']}[/bold yellow]",
        f"[dim]{recipe['source_url']}[/dim]",
        "",
    ]
    if recipe.get("description"):
        lines += [recipe["description"], ""]

    meta = []
    if recipe.get("cuisine"):  meta.append(f"Cuisine: {recipe['cuisine']}")
    if recipe.get("category"): meta.append(f"Category: {recipe['category']}")
    if recipe.get("servings"): meta.append(f"Servings: {recipe['servings']}")
    if recipe.get("total_time"): meta.append(f"Time: {_time_str(recipe['total_time'])}")
    if meta:
        lines.append("  ".join(meta))
        lines.append("")

    nut = []
    if recipe.get("calories"):  nut.append(f"Calories: {recipe['calories']:.0f}")
    if recipe.get("protein_g"): nut.append(f"Protein: {recipe['protein_g']:.1f}g")
    if recipe.get("carbs_g"):   nut.append(f"Carbs: {recipe['carbs_g']:.1f}g")
    if recipe.get("fat_g"):     nut.append(f"Fat: {recipe['fat_g']:.1f}g")
    if nut:
        lines.append("  ".join(nut))
        lines.append("")

    if recipe.get("ingredients"):
        lines.append("[bold]Ingredients:[/bold]")
        for ing in recipe["ingredients"]:
            lines.append(f"  • {ing}")
        lines.append("")

    if recipe.get("instructions"):
        lines.append("[bold]Instructions:[/bold]")
        for n, step in enumerate(recipe["instructions"], 1):
            lines.append(f"  [bold]{n}.[/bold] {step}")

    console.print(Panel("\n".join(lines), expand=False))


def cmd_delete(args):
    from .database import delete_recipe

    if not args.yes:
        confirm = console.input(
            f"[red]Delete recipe {args.id}? (y/N)[/red] "
        ).strip().lower()
        if confirm != "y":
            console.print("Aborted.")
            return

    deleted = delete_recipe(args.id)
    if deleted:
        console.print(f"[green]Deleted recipe {args.id}.[/green]")
    else:
        console.print(f"[yellow]No recipe found with id {args.id}.[/yellow]")


def cmd_export(args):
    from .exporter import export_to_excel

    output = Path(args.output) if args.output else None
    console.print("[cyan]Exporting to Excel…[/cyan]")
    try:
        path = export_to_excel(output_path=output)
        console.print(f"[green]✓ Exported to:[/green] {path}")
    except Exception as exc:
        console.print(f"[red]Export failed:[/red] {exc}")
        sys.exit(1)


def cmd_stats(args):
    from .database import get_stats

    stats = get_stats()
    console.print(Panel(
        f"[bold]Total recipes:[/bold]  {stats['total']}\n"
        f"[bold]Avg calories:[/bold]   {stats['avg_calories'] or '—'}\n"
        f"[bold]Avg cook time:[/bold]  {_time_str(stats['avg_total_time_min'])}",
        title="[bold green]Recipe Stats[/bold green]",
        expand=False,
    ))

    if stats["by_cuisine"]:
        table = Table(title="By Cuisine", box=box.SIMPLE)
        table.add_column("Cuisine", style="cyan")
        table.add_column("Count", justify="right")
        for row in stats["by_cuisine"]:
            table.add_row(row["cuisine"], str(row["cnt"]))
        console.print(table)

    if stats["by_category"]:
        table = Table(title="By Category", box=box.SIMPLE)
        table.add_column("Category", style="magenta")
        table.add_column("Count", justify="right")
        for row in stats["by_category"]:
            table.add_row(row["category"], str(row["cnt"]))
        console.print(table)


# ── Parser ────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="recipe_extractor",
        description="Extract, store, and export recipes from URLs.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # add
    p_add = sub.add_parser("add", help="Add one or more recipes by URL")
    p_add.add_argument("urls", nargs="+", metavar="URL")

    # list
    sub.add_parser("list", help="List all saved recipes")

    # search
    p_search = sub.add_parser("search", help="Search recipes by keyword")
    p_search.add_argument("query", metavar="QUERY")

    # show
    p_show = sub.add_parser("show", help="Show full details of a recipe")
    p_show.add_argument("id", type=int, metavar="ID")

    # delete
    p_del = sub.add_parser("delete", help="Delete a recipe by id")
    p_del.add_argument("id", type=int, metavar="ID")
    p_del.add_argument("-y", "--yes", action="store_true", help="Skip confirmation")

    # export
    p_exp = sub.add_parser("export", help="Export recipes to Excel")
    p_exp.add_argument(
        "output", nargs="?", metavar="FILE",
        help="Output path (default: exports/recipes_<timestamp>.xlsx)"
    )

    # stats
    sub.add_parser("stats", help="Show collection statistics")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    dispatch = {
        "add":    cmd_add,
        "list":   cmd_list,
        "search": cmd_search,
        "show":   cmd_show,
        "delete": cmd_delete,
        "export": cmd_export,
        "stats":  cmd_stats,
    }
    dispatch[args.command](args)
