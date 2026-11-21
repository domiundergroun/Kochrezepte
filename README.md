# Kochbuch für Home Assistant

Euer gemeinsames Rezeptbuch direkt in Home Assistant – mit eigener Seite in der Seitenleiste, Kochmodus fürs Küchentablet und Einkaufsliste per Knopfdruck.

![Version](https://img.shields.io/badge/Version-1.0.0-2F5D50) ![HACS](https://img.shields.io/badge/HACS-Custom-F2B134)

## Was es kann

- **Rezepte sammeln** mit Foto, Kategorie, Schlagworten, Zeiten, Schwierigkeit, Bewertung, Zutaten (mit Zwischenüberschriften) und Arbeitsschritten
- **Übersicht mit Register-Reitern** pro Kategorie, Favoriten, Suche (auch nach Zutaten) und Sortierung
- **Portionen umrechnen** – alle Mengen passen sich automatisch an (inkl. ½, ¼ …)
- **Einkaufsliste**: Zutaten antippen, die schon da sind – der Rest landet in eurer To-do-Liste (z. B. „Einkaufsliste“)
- **Kochmodus**: ein Schritt pro Bildschirm in großer Schrift, Bildschirm bleibt an, Zutaten daneben
- **Timer**: „20 Minuten“ im Text wird automatisch zum Timer-Knopf, mit Signalton
- **Import aus dem Internet**: Adresse von Chefkoch, Lecker, Foodblogs usw. einfügen – Rezept und Foto werden übernommen
- **Zutatenliste einfügen**: ganze Liste aus der Zwischenablage, wird automatisch in Menge/Einheit/Zutat zerlegt
- **Drucken** als schlichtes Rezeptblatt
- **Sicherung** herunterladen und wieder einspielen
- **Eigene Kategorien** mit Farbe und Symbol
- **Dashboard-Karte** „Heute kochen“, Lieblingsrezepte oder neue Rezepte
- **Sensor** `sensor.kochbuch_rezepte` mit Anzahl, Favoriten und Rezept des Tages
- Hell- und Dunkelmodus, optimiert für Handy, Tablet und Desktop

## Installation

### Über HACS (empfohlen)

1. HACS öffnen → oben rechts ⋮ → **Benutzerdefinierte Repositories**
2. Repository `https://github.com/domiundergroun/Kochrezepte`, Typ **Integration** hinzufügen
3. „Kochbuch“ suchen und herunterladen
4. Home Assistant neu starten
5. **Einstellungen → Geräte & Dienste → Integration hinzufügen → Kochbuch**

Updates erscheinen danach automatisch in HACS.

### Manuell

Den Ordner `custom_components/kochbuch` nach `/config/custom_components/kochbuch` kopieren, Home Assistant neu starten und die Integration wie oben hinzufügen.

## Dashboard-Karte

```yaml
type: custom:kochbuch-card
mode: heute        # heute | favoriten | neu
title: Was kochen wir?   # optional
anzahl: 4          # bei favoriten/neu
```

„Heute“ wählt jeden Tag ein anderes Rezept (aus den Favoriten, sobald es mindestens fünf gibt). Ein Tipp auf ein Rezept öffnet es im Kochbuch.

## Wo liegen die Daten?

- Rezepte und Einstellungen: `/config/.storage/kochbuch.rezepte` (in jeder Home-Assistant-Sicherung enthalten)
- Fotos: `/config/kochbuch_bilder/`

## Versionen

| Version | Änderungen |
|---|---|
| 1.0.0 | Erste Version: Rezeptverwaltung, Kochmodus, Timer, Einkaufsliste, Web-Import, Sicherung, Dashboard-Karte, Sensor |
