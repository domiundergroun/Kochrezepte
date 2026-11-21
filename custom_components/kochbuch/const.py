"""Konstanten für die Kochbuch-Integration."""

DOMAIN = "kochbuch"
VERSION = "1.0.1"

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
    {"id": "fruehstueck", "name": "Frühstück", "icon": "mdi:egg-fried", "color": "#E9A23B"},
    {"id": "vorspeise", "name": "Vorspeise", "icon": "mdi:food-variant", "color": "#8FA37E"},
    {"id": "suppe", "name": "Suppe", "icon": "mdi:pot-steam", "color": "#D9822B"},
    {"id": "salat", "name": "Salat", "icon": "mdi:leaf", "color": "#6A994E"},
    {"id": "hauptgericht", "name": "Hauptgericht", "icon": "mdi:silverware-fork-knife", "color": "#C8553D"},
    {"id": "pasta", "name": "Pasta", "icon": "mdi:pasta", "color": "#D4A373"},
    {"id": "beilage", "name": "Beilage", "icon": "mdi:rice", "color": "#B5838D"},
    {"id": "sauce", "name": "Saucen & Dips", "icon": "mdi:bowl-mix", "color": "#9C6644"},
    {"id": "dessert", "name": "Dessert", "icon": "mdi:ice-cream", "color": "#E07A9F"},
    {"id": "backen", "name": "Backen", "icon": "mdi:cupcake", "color": "#B07D62"},
    {"id": "snack", "name": "Snack", "icon": "mdi:food-croissant", "color": "#CB997E"},
    {"id": "getraenk", "name": "Getränke", "icon": "mdi:glass-cocktail", "color": "#4D908E"},
]

DEFAULT_SETTINGS = {
    "shopping_list": "",
    "default_servings": 4,
    "categories": DEFAULT_CATEGORIES,
}
