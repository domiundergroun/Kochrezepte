"""Rezept-Import von Webseiten (schema.org/Recipe, z. B. Chefkoch)."""

from __future__ import annotations

import html
import json
import logging
import re
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

_LOGGER = logging.getLogger(__name__)

_LD_RE = re.compile(
    r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.S | re.I,
)
_DURATION_RE = re.compile(
    r"P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?",
    re.I,
)
_TAG_RE = re.compile(r"<[^>]+>")

UNITS = [
    "kg", "g", "mg", "l", "ml", "cl", "dl", "EL", "TL", "Msp.", "Msp", "Prise",
    "Prisen", "Pck.", "Pck", "Päckchen", "Becher", "Dose", "Dosen", "Bund",
    "Stück", "Stk.", "Stk", "Scheibe", "Scheiben", "Zehe", "Zehen", "Tasse",
    "Tassen", "Glas", "Gläser", "Handvoll", "Spritzer", "Schuss", "Würfel",
    "Zweig", "Zweige", "Blatt", "Blätter", "Liter", "Gramm", "Kilogramm",
    "Esslöffel", "Teelöffel", "etwas", "cm", "Tropfen", "Packung", "Paket",
    "Stange", "Stangen", "Knolle", "Kopf", "Becher", "Flasche", "cup", "cups",
    "tbsp", "tsp", "oz", "lb",
]
_AMOUNT_RE = re.compile(
    r"^\s*((?:\d+[.,/]?\d*\s*(?:-|–|bis)\s*)?\d+(?:[.,/]\d+)?|[½¼¾⅓⅔⅛]|\d+\s*[½¼¾⅓⅔])\s*"
)


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        value = " ".join(_text(v) for v in value)
    if isinstance(value, dict):
        value = value.get("text") or value.get("name") or ""
    value = html.unescape(_TAG_RE.sub(" ", str(value)))
    return re.sub(r"\s+", " ", value).strip()


def parse_duration(value: Any) -> int:
    """ISO-8601-Dauer (PT1H30M) in Minuten."""
    if not value or not isinstance(value, str):
        return 0
    match = _DURATION_RE.fullmatch(value.strip())
    if not match:
        return 0
    days, hours, minutes = match.groups()
    total = float(days or 0) * 1440 + float(hours or 0) * 60 + float(minutes or 0)
    return int(round(total))


def parse_ingredient(line: str) -> dict[str, str]:
    """Zerlegt '200 g Mehl' in Menge, Einheit, Name."""
    line = _text(line)
    amount = unit = ""
    match = _AMOUNT_RE.match(line)
    rest = line
    if match:
        amount = match.group(1).replace(" ", "")
        rest = line[match.end():]
    for candidate in sorted(UNITS, key=len, reverse=True):
        if rest.lower().startswith(candidate.lower()) and (
            len(rest) == len(candidate)
            or not rest[len(candidate)].isalpha()
        ):
            unit = rest[: len(candidate)]
            rest = rest[len(candidate):]
            break
    return {"amount": amount, "unit": unit.strip(), "name": rest.strip(" ,"), "group": ""}


def _find_recipe(node: Any) -> dict[str, Any] | None:
    if isinstance(node, list):
        for item in node:
            found = _find_recipe(item)
            if found:
                return found
        return None
    if not isinstance(node, dict):
        return None
    node_type = node.get("@type")
    types = node_type if isinstance(node_type, list) else [node_type]
    if "Recipe" in types:
        return node
    for key in ("@graph", "mainEntity", "itemListElement"):
        if key in node:
            found = _find_recipe(node[key])
            if found:
                return found
    return None


def _steps(instructions: Any) -> list[str]:
    steps: list[str] = []
    if isinstance(instructions, str):
        parts = re.split(r"\n+|(?<=[.!?])\s{2,}", html.unescape(instructions))
        return [_text(p) for p in parts if _text(p)]
    if isinstance(instructions, dict):
        instructions = [instructions]
    for item in instructions or []:
        if isinstance(item, str):
            steps.extend(_steps(item))
        elif isinstance(item, dict):
            if item.get("@type") == "HowToSection" or "itemListElement" in item:
                steps.extend(_steps(item.get("itemListElement")))
            else:
                text = _text(item.get("text") or item.get("name"))
                if text:
                    steps.append(text)
    return steps


def _image(value: Any) -> str:
    if isinstance(value, list) and value:
        return _image(value[0])
    if isinstance(value, dict):
        return str(value.get("url") or value.get("contentUrl") or "")
    return str(value or "")


def _servings(value: Any) -> int:
    if isinstance(value, list) and value:
        value = value[0]
    match = re.search(r"\d+", str(value or ""))
    return int(match.group(0)) if match else 4


def recipe_from_ld(data: dict[str, Any], url: str) -> dict[str, Any]:
    keywords = data.get("keywords") or []
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",")]
    author = data.get("author")
    if isinstance(author, list) and author:
        author = author[0]
    rating = 0
    agg = data.get("aggregateRating")
    if isinstance(agg, dict):
        try:
            rating = round(float(str(agg.get("ratingValue")).replace(",", ".")))
        except (TypeError, ValueError):
            rating = 0
    prep = parse_duration(data.get("prepTime"))
    cook = parse_duration(data.get("cookTime"))
    total = parse_duration(data.get("totalTime"))
    if not prep and not cook and total:
        prep = total
    return {
        "title": _text(data.get("name")),
        "description": _text(data.get("description"))[:600],
        "image": _image(data.get("image")),
        "servings": _servings(data.get("recipeYield")),
        "prep_time": prep,
        "cook_time": cook,
        "ingredients": [
            parse_ingredient(i) for i in data.get("recipeIngredient") or [] if _text(i)
        ],
        "steps": _steps(data.get("recipeInstructions")),
        "tags": [_text(k) for k in keywords if _text(k)][:8],
        "source": url,
        "author": _text(author),
        "rating": rating if 0 < rating <= 5 else 0,
        "difficulty": 1,
    }


async def async_import_url(hass: HomeAssistant, url: str) -> dict[str, Any]:
    if not re.match(r"^https?://", url or "", re.I):
        raise ValueError("Bitte eine gültige Web-Adresse (http/https) angeben")
    session = async_get_clientsession(hass)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ),
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.6",
    }
    async with session.get(url, headers=headers, timeout=20) as resp:
        if resp.status >= 400:
            raise ValueError(f"Seite antwortet mit Fehler {resp.status}")
        page = await resp.text(errors="replace")
    for block in _LD_RE.findall(page):
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            try:
                data = json.loads(re.sub(r"[\x00-\x1f]", " ", block.strip()))
            except json.JSONDecodeError:
                continue
        found = _find_recipe(data)
        if found:
            return recipe_from_ld(found, url)
    raise ValueError("Auf dieser Seite wurde kein Rezept gefunden")
