"""Konstanten für die Kochbuch-Integration."""

DOMAIN = "kochbuch"
VERSION = "1.5.0"

STORAGE_KEY = "kochbuch.rezepte"
STORAGE_VERSION = 1

PANEL_URL_PATH = "kochbuch"
PANEL_TITLE = "Kochbuch"
PANEL_ICON = "mdi:chef-hat"
PANEL_COMPONENT = "kochbuch-panel"

FRONTEND_URL = "/kochbuch_static"
IMAGES_URL = "/kochbuch_bilder"
IMAGES_DIR = "kochbuch_bilder"

SIGNAL_UPDATED = "kochbuch_updated"

DEFAULT_CATEGORIES = [
    {"id": "nudeln", "name": "Nudeln", "icon": "mdi:pasta", "color": "#D99A2B"},
    {"id": "sossen", "name": "Soßen", "icon": "mdi:bowl-mix", "color": "#C2452D"},
    {"id": "braten", "name": "Braten", "icon": "mdi:food-turkey", "color": "#8A5A3B"},
    {"id": "backen", "name": "Backen", "icon": "mdi:cake-variant", "color": "#B8738F"},
    {"id": "kuchen", "name": "Kuchen", "icon": "mdi:cake-variant", "color": "#B8738F", "parent": "backen"},
    {"id": "plaetzchen", "name": "Plätzchen", "icon": "mdi:cookie", "color": "#A8657F", "parent": "backen"},
    {"id": "suppen", "name": "Suppen", "icon": "mdi:pot-steam", "color": "#3F7F6E"},
    {"id": "salat", "name": "Salat", "icon": "mdi:leaf", "color": "#6A994E"},
]

# Kategorien, die mit Version 1.5.0 dazukommen (einmalig ergänzt, falls nicht vorhanden)
CATEGORIES_V15 = [c for c in DEFAULT_CATEGORIES if c["id"] in ("kuchen", "plaetzchen", "salat")]

# Kategorien der Version 1.0.x – werden einmalig durch die neuen ersetzt,
# solange sie unverändert sind.
OLD_DEFAULT_CATEGORY_IDS = {
    "fruehstueck", "vorspeise", "suppe", "salat", "hauptgericht", "pasta",
    "beilage", "sauce", "dessert", "backen", "snack", "getraenk",
}

DEFAULT_SETTINGS = {
    "shopping_list": "",
    "default_servings": 4,
    "categories": DEFAULT_CATEGORIES,
    "categories_v15": True,
}
