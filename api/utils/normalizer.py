"""Ingredient normalization, category detection, and pantry matching."""

import re

# Strip trailing prep notes: ", minced", "(optional)", "; to taste"
_PREP_RE = re.compile(r'\s*,.*$|\s*\(.*?\)|\s*;.*$')

# Strip leading number (including fractions like 1/2, decimals, ranges like 1-2)
_NUM_RE = re.compile(r'^\s*(?:a\s+(?:pinch|dash|handful)\s+of\s+)?(?:\d[\d\s/\.\-]*\s*)?')

# Strip leading unit word after number has been removed
_UNIT_RE = re.compile(
    r'^(?:cups?|tablespoons?|tbsps?|teaspoons?|tsps?|pounds?|lbs?|ounces?|oz|'
    r'grams?|g\b|kg|cloves?|stalks?|heads?|bunches?|slices?|cans?|jars?|bags?|'
    r'pieces?|sprigs?|pinch(?:es)?|dashes?)\s+',
    re.IGNORECASE,
)

# Strip common filler adjectives
_FILLER_RE = re.compile(
    r'\b(?:fresh|freshly|dried|large|small|medium|extra|virgin|fine|ground|'
    r'whole|raw|divided|ripe|firm|cooked|chopped|sliced|diced)\b\s*',
    re.IGNORECASE,
)

_PUNCT_RE = re.compile(r'[^a-z0-9\s]')
_SPACE_RE = re.compile(r'\s+')


def normalize_ingredient(ingredient: str) -> str:
    """Strip quantity, unit, prep notes, and filler words from a recipe ingredient string."""
    s = ingredient.lower()
    s = _PREP_RE.sub('', s)
    s = _NUM_RE.sub('', s)
    s = _UNIT_RE.sub('', s)
    s = _FILLER_RE.sub('', s)
    s = _PUNCT_RE.sub('', s)
    return _SPACE_RE.sub(' ', s).strip()


def is_on_hand(ingredient: str, pantry_names: list[str]) -> bool:
    """Return True if any pantry item name appears as a whole word in the normalized ingredient.

    Uses word-boundary matching to prevent partial-word false positives:
    'egg' must not match 'eggplant', 'butter' must not match 'butternut squash'.
    Intentionally one-directional: the pantry item must be contained within the
    ingredient — not the reverse — so 'rice flour' in pantry does not match
    the ingredient 'rice'.
    """
    norm = normalize_ingredient(ingredient)
    return any(
        re.search(r'\b' + re.escape(item.lower()) + r'\b', norm)
        for item in pantry_names
    )


def find_pantry_match(ing_text: str, pantry_items: list[dict]) -> dict | None:
    """Return the first pantry item whose name matches ing_text (word-boundary), or None.

    Uses the same word-boundary logic as is_on_hand. Returns the full item dict
    so callers can access stock_mode, stock_value, backup_value, etc.
    """
    norm = normalize_ingredient(ing_text)
    for item in pantry_items:
        if re.search(r'\b' + re.escape(item['name'].lower()) + r'\b', norm):
            return item
    return None


# Category detection lookup. More-specific keys come before general ones
# so that e.g. "bell pepper" → Produce before "pepper" → Spices.
CATEGORY_MAP: dict[str, str] = {
    # Produce
    "bell pepper": "Produce", "green onion": "Produce", "scallion": "Produce",
    "garlic": "Produce", "onion": "Produce", "tomato": "Produce",
    "lemon": "Produce", "lime": "Produce", "potato": "Produce", "carrot": "Produce",
    "celery": "Produce", "spinach": "Produce", "kale": "Produce", "lettuce": "Produce",
    "mushroom": "Produce", "zucchini": "Produce", "eggplant": "Produce",
    "broccoli": "Produce", "cauliflower": "Produce", "cabbage": "Produce",
    "avocado": "Produce", "cucumber": "Produce", "ginger": "Produce",
    "shallot": "Produce", "leek": "Produce", "basil": "Produce", "parsley": "Produce",
    "cilantro": "Produce", "mint": "Produce", "thyme": "Produce", "rosemary": "Produce",
    "sage": "Produce", "dill": "Produce", "chive": "Produce",
    "apple": "Produce", "banana": "Produce", "orange": "Produce",
    "strawberry": "Produce", "blueberry": "Produce", "grape": "Produce",
    "mango": "Produce", "pineapple": "Produce", "peach": "Produce",
    "cherry": "Produce", "pear": "Produce", "raspberry": "Produce",
    # Dairy
    "heavy cream": "Dairy", "sour cream": "Dairy", "cream cheese": "Dairy",
    "half and half": "Dairy", "parmesan": "Dairy", "mozzarella": "Dairy",
    "cheddar": "Dairy", "ricotta": "Dairy", "buttermilk": "Dairy",
    "butter": "Dairy", "milk": "Dairy", "cream": "Dairy",
    "cheese": "Dairy", "egg": "Dairy", "yogurt": "Dairy",
    # Meat
    "ground beef": "Meat", "chicken": "Meat", "beef": "Meat", "pork": "Meat",
    "lamb": "Meat", "turkey": "Meat", "salmon": "Meat", "tuna": "Meat",
    "shrimp": "Meat", "bacon": "Meat", "sausage": "Meat", "ham": "Meat",
    "pancetta": "Meat", "prosciutto": "Meat", "chorizo": "Meat",
    "steak": "Meat", "cod": "Meat", "tilapia": "Meat",
    # Spices (before generic "pepper" and "oil" catch-alls)
    "black pepper": "Spices", "chili powder": "Spices", "chili flake": "Spices",
    "red pepper flake": "Spices", "garam masala": "Spices", "curry powder": "Spices",
    "bay leaf": "Spices", "pepper": "Spices", "cumin": "Spices", "paprika": "Spices",
    "turmeric": "Spices", "cinnamon": "Spices", "oregano": "Spices",
    "cayenne": "Spices", "coriander": "Spices", "cardamom": "Spices",
    "clove": "Spices", "nutmeg": "Spices", "allspice": "Spices",
    # Pantry (longer keys first to avoid early substring matches)
    "olive oil": "Pantry", "sesame oil": "Pantry", "vegetable oil": "Pantry",
    "canola oil": "Pantry", "coconut oil": "Pantry",
    "soy sauce": "Pantry", "fish sauce": "Pantry", "hot sauce": "Pantry",
    "worcestershire": "Pantry", "tomato paste": "Pantry", "tomato sauce": "Pantry",
    "baking powder": "Pantry", "baking soda": "Pantry",
    "maple syrup": "Pantry", "apple cider vinegar": "Pantry",
    "coconut milk": "Pantry", "breadcrumb": "Pantry",
    "flour": "Pantry", "sugar": "Pantry", "salt": "Pantry", "oil": "Pantry",
    "vinegar": "Pantry", "pasta": "Pantry", "rice": "Pantry", "bread": "Pantry",
    "stock": "Pantry", "broth": "Pantry", "honey": "Pantry", "vanilla": "Pantry",
    "cocoa": "Pantry", "chocolate": "Pantry", "oat": "Pantry",
    "almond": "Pantry", "walnut": "Pantry", "lentil": "Pantry",
    "bean": "Pantry", "chickpea": "Pantry", "quinoa": "Pantry",
    "cornstarch": "Pantry", "yeast": "Pantry", "mustard": "Pantry",
    "ketchup": "Pantry", "mayonnaise": "Pantry", "noodle": "Pantry",
    "tortilla": "Pantry",
}


_QTY_CATEGORIES: frozenset[str] = frozenset({'Produce', 'Meat'})
_EGG_RE = re.compile(r'\beggs?\b', re.IGNORECASE)


def detect_stock_mode(category: str, name: str) -> str:
    """Return 'qty' for Produce, Meat, and egg items; 'level' for everything else."""
    if _EGG_RE.search(name):
        return 'qty'
    return 'qty' if category in _QTY_CATEGORIES else 'level'


def detect_category(name: str) -> str:
    """Auto-detect pantry category from item name. Falls back to 'Other'."""
    lower = name.lower()
    for key, cat in CATEGORY_MAP.items():
        if key in lower:
            return cat
    return "Other"
