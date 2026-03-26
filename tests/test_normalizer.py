from api.utils.normalizer import normalize_ingredient, detect_category, is_on_hand


# --- normalize_ingredient ---

def test_strips_quantity_and_unit():
    assert normalize_ingredient("2 cups all-purpose flour") == "allpurpose flour"


def test_strips_prep_note_after_comma():
    assert normalize_ingredient("3 cloves garlic, minced") == "garlic"


def test_strips_parenthetical():
    assert normalize_ingredient("1 tsp salt (optional)") == "salt"


def test_strips_filler_adjective():
    assert normalize_ingredient("fresh basil leaves") == "basil leaves"


def test_strips_fraction():
    assert normalize_ingredient("1/2 tsp black pepper") == "black pepper"


def test_handles_metric():
    assert normalize_ingredient("200g spaghetti") == "spaghetti"


def test_empty_string_returns_empty():
    assert normalize_ingredient("   ") == ""


def test_only_number_returns_empty():
    assert normalize_ingredient("2") == ""


# --- is_on_hand ---

def test_on_hand_exact():
    assert is_on_hand("salt", ["salt"]) is True


def test_on_hand_with_quantity():
    assert is_on_hand("3 cloves garlic, minced", ["garlic"]) is True


def test_on_hand_partial_match():
    assert is_on_hand("2 cups all-purpose flour, sifted", ["flour"]) is True


def test_not_on_hand():
    assert is_on_hand("150g pancetta", ["garlic", "flour"]) is False


def test_direction_check_rice_flour():
    # "rice flour" in pantry should NOT match the ingredient "rice"
    # because "rice flour" is not a substring of normalized "rice"
    assert is_on_hand("rice", ["rice flour"]) is False


def test_on_hand_empty_pantry():
    assert is_on_hand("garlic", []) is False


# --- detect_category ---

def test_detects_produce():
    assert detect_category("garlic") == "Produce"


def test_detects_dairy():
    assert detect_category("butter") == "Dairy"


def test_detects_spices():
    assert detect_category("cumin") == "Spices"


def test_detects_pantry():
    assert detect_category("olive oil") == "Pantry"


def test_detects_meat():
    assert detect_category("chicken breast") == "Meat"


def test_unknown_falls_back_to_other():
    assert detect_category("xanthan gum") == "Other"


def test_egg_does_not_match_eggplant():
    assert is_on_hand("eggplant", ["egg"]) is False


def test_butter_does_not_match_butternut_squash():
    assert is_on_hand("butternut squash", ["butter"]) is False


def test_butter_matches_peanut_butter():
    # "butter" IS a whole word inside "peanut butter"
    assert is_on_hand("peanut butter", ["butter"]) is True


def test_rice_does_not_match_rice_flour_pantry_item():
    # Existing direction test: "rice flour" in pantry must NOT match ingredient "rice"
    assert is_on_hand("rice", ["rice flour"]) is False
