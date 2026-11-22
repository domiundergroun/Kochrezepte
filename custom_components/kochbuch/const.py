"""Konstanten für die Kochbuch-Integration."""

DOMAIN = "kochbuch"
VERSION = "1.7.4"

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
    {"id": "vorspeisen", "name": "Vorspeisen", "icon": "mdi:food-variant", "color": "#7D9B6B"},
    {"id": "hauptgericht", "name": "Hauptgericht", "icon": "mdi:silverware-fork-knife", "color": "#C2452D"},
    {"id": "nudeln", "name": "Nudel", "icon": "mdi:pasta", "color": "#D99A2B", "parent": "hauptgericht"},
    {"id": "reis", "name": "Reis", "icon": "mdi:rice", "color": "#B9975B", "parent": "hauptgericht"},
    {"id": "braten", "name": "Braten", "icon": "mdi:food-turkey", "color": "#8A5A3B", "parent": "hauptgericht"},
    {"id": "suppen", "name": "Suppe", "icon": "mdi:pot-steam", "color": "#3F7F6E", "parent": "hauptgericht"},
    {"id": "anderes", "name": "Anderes", "icon": "mdi:food", "color": "#9C6644", "parent": "hauptgericht"},
    {"id": "beilage", "name": "Beilage", "icon": "mdi:french-fries", "color": "#6A994E"},
    {"id": "salat", "name": "Salat", "icon": "mdi:leaf", "color": "#5E8C3F", "parent": "beilage"},
    {"id": "backen", "name": "Backen", "icon": "mdi:cake-variant", "color": "#B8738F"},
    {"id": "kuchen", "name": "Kuchen", "icon": "mdi:cake-variant", "color": "#B8738F", "parent": "backen"},
    {"id": "plaetzchen", "name": "Plätzchen", "icon": "mdi:cookie", "color": "#A8657F", "parent": "backen"},
    {"id": "nachspeise", "name": "Nachspeise", "icon": "mdi:ice-cream", "color": "#D9739A"},
]

# Umbau der Kategorien mit Version 1.7.0: bisherige Kategorien (nach ID oder Name)
# werden der neuen Struktur zugeordnet, damit Rezepte ihren Platz behalten.
CATEGORY_ALIASES_V17 = {
    "vorspeisen": ["vorspeisen", "vorspeise"],
    "hauptgericht": ["hauptgericht", "hauptgerichte"],
    "nudeln": ["nudeln", "nudel", "pasta"],
    "reis": ["reis"],
    "braten": ["braten", "fleisch"],
    "suppen": ["suppen", "suppe"],
    "anderes": ["anderes", "sossen", "soßen", "sauce", "saucen & dips"],
    "beilage": ["beilage", "beilagen"],
    "salat": ["salat", "salate"],
    "backen": ["backen"],
    "kuchen": ["kuchen"],
    "plaetzchen": ["plaetzchen", "plätzchen", "kekse"],
    "nachspeise": ["nachspeise", "nachspeisen", "dessert", "desserts"],
}


DEFAULT_SETTINGS = {
    "shopping_list": "",
    "default_servings": 4,
    "categories": DEFAULT_CATEGORIES,
    "categories_v17": True,
}
