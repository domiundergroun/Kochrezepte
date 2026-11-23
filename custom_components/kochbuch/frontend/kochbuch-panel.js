/* Kochbuch – Panel für Home Assistant
 * https://github.com/domiundergroun/Kochrezepte
 */
const KB_VERSION = "1.8.0";

/* ------------------------------------------------------------------ Hilfen */
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

function parseNumber(str) {
  str = String(str).trim();
  if (!str) return null;
  let m = str.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/);
  if (m) return parseInt(m[1], 10) + FRACTIONS[m[2]];
  if (FRACTIONS[str] !== undefined) return FRACTIONS[str];
  m = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  m = str.match(/^\d+(?:[.,]\d+)?$/);
  if (m) return parseFloat(str.replace(",", "."));
  return null;
}

function formatNumber(n) {
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n);
  const frac = n - whole;
  const nice = [[0.25, "¼"], [0.5, "½"], [0.75, "¾"], [1 / 3, "⅓"], [2 / 3, "⅔"]];
  for (const [v, s] of nice) {
    if (Math.abs(frac - v) < 0.03) return whole ? `${whole}${s}` : s;
  }
  if (frac < 0.03) return String(whole);
  if (frac > 0.97) return String(whole + 1);
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

function scaleAmount(amount, factor) {
  if (!amount) return "";
  const range = String(amount).split(/\s*(?:-|–|bis)\s*/);
  const nums = range.map(parseNumber);
  if (nums.some((n) => n === null)) return amount;
  return nums.map((n) => formatNumber(n * factor)).join("–");
}

const UNITS = ["kg", "g", "mg", "l", "ml", "cl", "dl", "EL", "TL", "Msp.", "Msp", "Prise", "Prisen", "Pck.", "Pck", "Päckchen", "Becher", "Dose", "Dosen", "Bund", "Stück", "Stk.", "Stk", "Scheibe", "Scheiben", "Zehe", "Zehen", "Tasse", "Tassen", "Glas", "Handvoll", "Spritzer", "Schuss", "Würfel", "Zweig", "Zweige", "Blatt", "Liter", "Gramm", "Esslöffel", "Teelöffel", "etwas", "cm", "Tropfen", "Packung", "Stange", "Stangen", "Knolle", "Kopf", "Flasche"].sort((a, b) => b.length - a.length);

function parseIngredientLine(line) {
  line = line.trim().replace(/^[-•*]\s*/, "");
  if (!line) return null;
  if (/^(#|für\s.+:$|.+:$)/i.test(line) && !/^\d/.test(line)) {
    return { amount: "", unit: "", name: "", group: line.replace(/^#\s*/, "").replace(/:$/, "") };
  }
  let amount = "", unit = "", rest = line;
  const m = line.match(/^((?:\d+[.,/]?\d*\s*(?:-|–|bis)\s*)?\d+(?:[.,/]\d+)?|[½¼¾⅓⅔⅛]|\d+\s*[½¼¾⅓⅔])\s*/);
  if (m) { amount = m[1].replace(/\s/g, ""); rest = line.slice(m[0].length); }
  for (const u of UNITS) {
    if (rest.toLowerCase().startsWith(u.toLowerCase()) && !/[a-zäöüß]/i.test(rest.charAt(u.length))) {
      unit = rest.slice(0, u.length); rest = rest.slice(u.length).trim(); break;
    }
  }
  return { amount, unit, name: rest.replace(/^,\s*/, ""), group: "" };
}

/** Reihenfolge für die Anzeige: Erledigtes/Abgewähltes rutscht ans Ende seiner Gruppe. */
function orderWithin(entries, isDown) {
  const out = [];
  let seg = [];
  const flush = () => { out.push(...seg.filter((e) => !isDown(e)), ...seg.filter((e) => isDown(e))); seg = []; };
  for (const e of entries) {
    if (e.heading) { flush(); out.push(e); } else seg.push(e);
  }
  flush();
  return out;
}

/** Sortiert die Listeneinträge im DOM neu und animiert die Bewegung (ohne Neuaufbau, Scrollposition bleibt). */
function reorderList(ul, itemSel, isDown) {
  if (!ul) return;
  const kids = [...ul.children];
  const before = new Map(kids.map((el) => [el, el.getBoundingClientRect().top]));
  const entries = kids.map((el) => ({ el, heading: !el.matches(itemSel), key: Number(el.dataset.idx ?? el.dataset.i ?? 0) }));
  // innerhalb einer Gruppe nach ursprünglicher Reihenfolge, Erledigtes zuletzt
  const ordered = [];
  let seg = [];
  const flush = () => {
    seg.sort((a, b) => a.key - b.key);
    ordered.push(...seg.filter((e) => !isDown(e.el)), ...seg.filter((e) => isDown(e.el)));
    seg = [];
  };
  for (const e of entries) { if (e.heading) { flush(); ordered.push(e); } else seg.push(e); }
  flush();
  ordered.forEach((e) => ul.appendChild(e.el));
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  for (const e of ordered) {
    const dy = before.get(e.el) - e.el.getBoundingClientRect().top;
    if (!dy) continue;
    e.el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 260, easing: "cubic-bezier(.2,.7,.3,1)" });
  }
}

function fmtMinutes(min) {
  min = Number(min) || 0;
  if (!min) return "";
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h >= 24) { const d = Math.floor(h / 24), rh = h % 24; return rh ? `${d} Tg ${rh} Std` : `${d} Tg`; }
  return m ? `${h} Std ${m} Min` : `${h} Std`;
}

const PHASES = [
  { key: "prep_steps", name: "Vorbereitung", icon: "mdi:knife", time: "prep_time" },
  { key: "steps", name: "Kochen", icon: "mdi:stove", time: "cook_time" },
];

function allSteps(r) {
  const out = [];
  for (const ph of PHASES) (r[ph.key] || []).forEach((text, i, arr) => out.push({ phase: ph, text, n: i + 1, of: arr.length }));
  return out;
}

const DIFFICULTY = { 1: "Einfach", 2: "Mittel", 3: "Anspruchsvoll" };
const ICONS = ["mdi:food", "mdi:egg-fried", "mdi:food-variant", "mdi:pot-steam", "mdi:leaf", "mdi:silverware-fork-knife", "mdi:pasta", "mdi:rice", "mdi:bowl-mix", "mdi:ice-cream", "mdi:cupcake", "mdi:food-croissant", "mdi:glass-cocktail", "mdi:fish", "mdi:food-drumstick", "mdi:food-steak", "mdi:pizza", "mdi:hamburger", "mdi:noodles", "mdi:carrot", "mdi:fruit-cherries", "mdi:bread-slice", "mdi:cake-variant", "mdi:cookie", "mdi:coffee", "mdi:grill", "mdi:sprout", "mdi:chili-mild", "mdi:baguette", "mdi:muffin", "mdi:food-turkey", "mdi:pot-mix", "mdi:pot", "mdi:bowl-mix-outline", "mdi:food-apple", "mdi:fish", "mdi:egg", "mdi:cheese", "mdi:mushroom", "mdi:pumpkin", "mdi:bowl"];

function resizeImage(file, max = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Kein gültiges Bild"));
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ensureFonts() {
  if (document.getElementById("kochbuch-fonts")) return;
  const link = document.createElement("link");
  link.id = "kochbuch-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap";
  document.head.appendChild(link);
}

/* ------------------------------------------------------------------ Styles */
const STYLES = `
:host {
  --kb-paper: #F4F6F1;
  --kb-surface: #FFFFFF;
  --kb-ink: #1E2B25;
  --kb-ink-soft: #55635C;
  --kb-line: #DCE3DC;
  --kb-herb: #2F5D50;
  --kb-herb-soft: #E3ECE7;
  --kb-saffron: #F2B134;
  --kb-saffron-ink: #3A2A05;
  --kb-tomato: #E2553F;
  --kb-shadow: 0 1px 2px rgba(30,43,37,.06), 0 8px 24px -12px rgba(30,43,37,.22);
  --kb-display: "Bricolage Grotesque", "Avenir Next Condensed", "Segoe UI", system-ui, sans-serif;
  --kb-body: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;
  display: block;
  min-height: 100vh;
  background: var(--kb-paper);
  color: var(--kb-ink);
  font-family: var(--kb-body);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
:host([dark]) {
  --kb-paper: #111915;
  --kb-surface: #1A2520;
  --kb-ink: #E7EEE9;
  --kb-ink-soft: #9DADA4;
  --kb-line: #2A3832;
  --kb-herb: #8CC2AE;
  --kb-herb-soft: #21332B;
  --kb-saffron: #F2B134;
  --kb-shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 28px -14px rgba(0,0,0,.6);
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
input, textarea, select { font: inherit; color: inherit; }
:focus-visible { outline: 3px solid var(--kb-saffron); outline-offset: 2px; border-radius: 6px; }
ha-icon { --mdc-icon-size: 20px; display: inline-flex; }
h1, h2, h3 { font-family: var(--kb-display); margin: 0; letter-spacing: -0.01em; }

/* Kopfzeile */
.top {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; gap: 12px;
  padding: 10px max(16px, env(safe-area-inset-left)) 10px 8px;
  background: color-mix(in srgb, var(--kb-paper) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.top ha-menu-button { color: var(--kb-ink); }
.brand { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.brand h1 { font-size: 26px; font-weight: 800; white-space: nowrap; }
.brand .count { color: var(--kb-ink-soft); font-size: 14px; white-space: nowrap; }
.spacer { flex: 1; }
.search {
  display: flex; align-items: center; gap: 8px;
  background: var(--kb-surface); border: 1.5px solid var(--kb-line);
  border-radius: 999px; padding: 0 14px; height: 44px;
  width: min(360px, 40vw);
  transition: border-color .15s;
}
.search:focus-within { border-color: var(--kb-herb); }
.search input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; height: 100%; }
.search ha-icon { color: var(--kb-ink-soft); }
.icon-btn {
  width: 44px; height: 44px; border-radius: 999px; border: 0; background: transparent;
  display: inline-flex; align-items: center; justify-content: center; color: var(--kb-ink);
  flex: none;
}
.icon-btn:hover { background: var(--kb-herb-soft); }
.btn {
  display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px;
  border-radius: 999px; border: 1.5px solid var(--kb-line); background: var(--kb-surface);
  font-weight: 700; white-space: nowrap;
}
.btn:hover { border-color: var(--kb-herb); }
.btn.primary { background: var(--kb-herb); border-color: var(--kb-herb); color: #fff; }
:host([dark]) .btn.primary { color: #0E1A15; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.saffron { background: var(--kb-saffron); border-color: var(--kb-saffron); color: var(--kb-saffron-ink); }
.btn.danger { color: var(--kb-tomato); }
.btn.danger:hover { border-color: var(--kb-tomato); }
.btn[disabled] { opacity: .5; pointer-events: none; }

main { max-width: 1280px; margin: 0 auto; padding: 4px 20px 80px; }

/* Register-Reiter der Kategorien */
.tabs {
  display: flex; gap: 6px; overflow-x: auto; padding: 14px 2px 0; margin: 0 -2px;
  scrollbar-width: none; border-bottom: 2px solid var(--kb-ink);
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: none; display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 16px 8px; border: 2px solid transparent; border-bottom: 0;
  border-radius: 12px 12px 0 0; background: transparent; color: var(--kb-ink-soft);
  font-weight: 700; position: relative; top: 2px;
}
.tab .dot { width: 10px; height: 10px; border-radius: 3px; background: var(--c, var(--kb-herb)); }
.tab .n { font-weight: 400; font-size: 13px; opacity: .8; }
.tab:hover { color: var(--kb-ink); }
.tab.on {
  background: var(--kb-surface); color: var(--kb-ink);
  border-color: var(--kb-ink); box-shadow: inset 0 4px 0 var(--c, var(--kb-herb));
}
.toolbar { display: flex; align-items: center; gap: 12px; padding: 18px 0 6px; color: var(--kb-ink-soft); font-size: 14px; }
.toolbar > span, .toolbar > label { white-space: nowrap; }
.toolbar select {
  border: 0; background: transparent; font-weight: 700; color: var(--kb-ink); padding: 4px; border-radius: 6px;
}

/* Rezeptkarten */
.grid {
  display: grid; gap: 26px 20px; padding-top: 18px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}
.card {
  position: relative; display: flex; flex-direction: column; text-align: left;
  background: var(--kb-surface); border: 0; padding: 0; border-radius: 4px 16px 16px 16px;
  box-shadow: var(--kb-shadow); overflow: visible;
  transition: transform .18s ease, box-shadow .18s ease;
}
.card:hover { transform: translateY(-3px); }
.card .flag {
  position: absolute; top: -13px; left: 0; height: 14px; padding: 0 12px;
  background: var(--c); border-radius: 8px 8px 0 0;
  font-size: 11px; line-height: 15px; font-weight: 700; color: #fff; max-width: 70%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.card .pic { aspect-ratio: 4 / 3; border-radius: 0 16px 0 0; overflow: hidden; position: relative; }
.card .body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.card { min-width: 0; }
.card h3 { font-size: 20px; font-weight: 700; line-height: 1.15; min-height: 2.3em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; hyphens: auto; }
.card .desc { height: 2.9em; line-height: 1.45; }
.card h3 { height: 2.3em; }
.card .facts { line-height: 1.5; height: 1.5em; }
.card .facts { flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
.top.has-search .row1 { display: contents; }
.top.has-search .row1 > .spacer { order: 1; }
.top.has-search > .search { order: 2; }
.top.has-search .row1 > .icon-btn, .top.has-search .row1 > .btn { order: 3; }
.top.has-search .row1 > .back-btn { order: 0; }
.card .desc { color: var(--kb-ink-soft); font-size: 14px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--kb-ink-soft); font-size: 14px; margin-top: auto; }
.facts span { display: inline-flex; align-items: center; gap: 5px; }
.facts ha-icon { --mdc-icon-size: 17px; }
.fav {
  position: absolute; top: 10px; right: 10px; width: 40px; height: 40px; border-radius: 999px; border: 0;
  background: rgba(255,255,255,.92); color: var(--kb-ink-soft); display: inline-flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,.15);
}
.fav.on { color: var(--kb-tomato); }
.fav:active { transform: scale(.9); }

.pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
.placeholder {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  background:
    radial-gradient(circle at 20% 25%, rgba(255,255,255,.18) 0 18%, transparent 19%),
    radial-gradient(circle at 85% 80%, rgba(255,255,255,.12) 0 24%, transparent 25%),
    var(--c, var(--kb-herb));
  color: rgba(255,255,255,.85);
}
.placeholder ha-icon { --mdc-icon-size: 64px; }

.empty { text-align: center; padding: 70px 20px; max-width: 460px; margin: 0 auto; }
.empty .plate {
  width: 120px; height: 120px; border-radius: 999px; margin: 0 auto 22px;
  background: var(--kb-surface); box-shadow: var(--kb-shadow), inset 0 0 0 14px var(--kb-herb-soft);
  display: flex; align-items: center; justify-content: center; color: var(--kb-herb);
}
.empty .plate ha-icon { --mdc-icon-size: 46px; }
.empty h2 { font-size: 26px; margin-bottom: 8px; }
.empty p { color: var(--kb-ink-soft); margin: 0 0 22px; }
.empty .row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

.crumbs { display: flex; align-items: center; gap: 2px; min-width: 0; font-weight: 700; }
.crumbs button { display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; height: 44px; padding: 0 12px; border-radius: 999px; font-family: var(--kb-display); font-size: 20px; font-weight: 800; color: var(--kb-ink); }
.crumbs button:hover { background: var(--kb-herb-soft); }
.crumbs button ha-icon { color: var(--kb-herb); }
.crumbs .crumb-cat { font-family: var(--kb-body); font-size: 17px; font-weight: 700; color: var(--kb-ink-soft); }
.crumbs .crumb-cat .title-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.crumbs .sep { color: var(--kb-ink-soft); --mdc-icon-size: 20px; display: inline-flex; }
.crumbs .here { display: inline-flex; align-items: center; padding: 0 8px; color: var(--kb-ink-soft); font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crumbs .here .title-dot { width: 10px; height: 10px; margin-right: 8px; vertical-align: 0; flex: none; }
.cat-title { font-size: clamp(34px, 5vw, 52px); font-weight: 800; margin: 18px 0 0; padding-bottom: 10px; border-bottom: 4px solid var(--c); display: inline-block; }

/* Startseite */
.title-dot { display: inline-block; width: 14px; height: 14px; border-radius: 4px; margin-right: 10px; vertical-align: 2px; }
.welcome {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px;
  background: var(--kb-herb); color: #fff; border-radius: 20px; padding: 22px 26px; margin: 14px 0 6px;
}
:host([dark]) .welcome { color: #0E1A15; }
.welcome h2 { font-size: 24px; font-weight: 800; }
.welcome p { margin: 4px 0 0; opacity: .9; max-width: 56ch; }
.welcome .row { display: flex; gap: 10px; flex-wrap: wrap; }
.welcome .btn { border-color: transparent; }
.welcome .btn.primary { background: var(--kb-saffron); color: var(--kb-saffron-ink); }
.shelf {
  display: grid; gap: 16px; padding-top: 18px;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}
.cat-tile {
  position: relative; overflow: hidden; text-align: left; border: 0; cursor: pointer;
  min-height: 168px; padding: 20px 20px 18px; border-radius: 6px 22px 22px 22px;
  background: var(--c); color: #fff; display: flex; flex-direction: column; justify-content: flex-end;
  box-shadow: var(--kb-shadow); transition: transform .18s ease;
}
.cat-tile:hover { transform: translateY(-3px); }
.cat-tile::after { content: ""; position: absolute; inset: 0; background: linear-gradient(160deg, rgba(255,255,255,.14), rgba(0,0,0,.12)); pointer-events: none; }
.cat-tile .bg { position: absolute; right: -18px; bottom: -22px; --mdc-icon-size: 150px; color: rgba(255,255,255,.2); transform: rotate(-12deg); }
.cat-tile .ct-name { position: relative; z-index: 1; font-family: var(--kb-display); font-weight: 800; font-size: 30px; line-height: 1.05; letter-spacing: -0.01em; }
.cat-tile .ct-count { position: relative; z-index: 1; font-size: 15px; opacity: .9; margin-top: 4px; }
.cat-tile .thumbs { position: absolute; top: 16px; right: 16px; display: flex; z-index: 1; }
.cat-tile .thumbs img { width: 50px; height: 50px; border-radius: 999px; object-fit: cover; border: 3px solid var(--c); margin-left: -14px; box-shadow: 0 3px 10px rgba(0,0,0,.2); }
.cat-tile.add {
  background: transparent; color: var(--kb-ink-soft); border: 2px dashed var(--kb-line); box-shadow: none;
  align-items: center; justify-content: center; text-align: center;
}
.cat-tile.add::after { display: none; }
.cat-tile.add ha-icon { --mdc-icon-size: 34px; margin-bottom: 6px; }
.cat-tile.add .ct-name { font-size: 20px; color: var(--kb-ink); }
.cat-tile.add .ct-count { font-size: 14px; }
.cat-tile.add:hover { border-color: var(--kb-herb); color: var(--kb-herb); }
.minis { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.mini-tile {
  display: flex; align-items: center; gap: 12px; padding: 12px 18px 12px 14px; border-radius: 16px; border: 1.5px solid var(--kb-line);
  background: var(--kb-surface); text-align: left;
}
.mini-tile:hover { border-color: var(--kb-herb); }
.mini-tile ha-icon { width: 40px; height: 40px; border-radius: 12px; background: var(--kb-herb-soft); color: var(--kb-herb); align-items: center; justify-content: center; }
.mini-tile.mini-fav ha-icon { color: var(--kb-tomato); background: color-mix(in srgb, var(--kb-tomato) 14%, transparent); }
.mini-tile b { display: block; font-size: 16px; }
.mini-tile small { color: var(--kb-ink-soft); font-size: 14px; }
.sec-title { font-size: 24px; font-weight: 800; margin: 38px 0 0; }

/* Detailansicht */
.detail { max-width: 1120px; margin: 0 auto; padding: 0 20px 90px; }
.hero {
  position: relative; border-radius: 24px; overflow: hidden; min-height: 300px; height: 46vh; max-height: 480px;
  box-shadow: var(--kb-shadow);
}
.hero .pic, .hero .placeholder { position: absolute; inset: 0; height: 100%; }
.hero .pic img { width: 100%; height: 100%; object-fit: cover; }
.hero .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(10,18,14,.82) 100%); }
.hero .title {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 28px 32px 48px; color: #fff;
}
.hero .cat {
  display: inline-flex; align-items: center; gap: 6px; background: var(--c); color: #fff;
  padding: 5px 12px; border-radius: 999px; font-weight: 700; font-size: 14px; margin-bottom: 12px;
}
.hero .cat ha-icon { --mdc-icon-size: 16px; }
.hero h1 { font-size: clamp(32px, 5.2vw, 60px); font-weight: 800; line-height: 1; max-width: 16ch; text-wrap: balance; }
.hero .by { margin-top: 10px; opacity: .85; font-size: 15px; }
.strip {
  display: flex; flex-wrap: wrap; gap: 10px; margin: -26px 24px 0; position: relative;
}
.pill {
  background: var(--kb-surface); border-radius: 14px; padding: 10px 16px; box-shadow: var(--kb-shadow);
  display: flex; flex-direction: column; min-width: 110px;
}
.pill small { color: var(--kb-ink-soft); font-size: 13px; }
.pill b { font-family: var(--kb-display); font-size: 19px; font-weight: 700; }
.pill.stars { justify-content: center; }
.stars-row { display: inline-flex; gap: 2px; }
.star { border: 0; background: transparent; padding: 2px; color: var(--kb-line); }
.star.on { color: var(--kb-saffron); }
.star ha-icon { --mdc-icon-size: 22px; }
.lead { font-size: 19px; line-height: 1.55; max-width: 62ch; margin: 30px 0 4px; color: var(--kb-ink); }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.tag { background: var(--kb-herb-soft); color: var(--kb-herb); border-radius: 999px; padding: 4px 12px; font-size: 14px; font-weight: 700; }

.cols { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 44px; margin-top: 34px; align-items: start; }
.ingredients {
  position: sticky; top: 76px; background: var(--kb-surface); border-radius: 20px; padding: 22px 22px 18px;
  box-shadow: var(--kb-shadow);
}
.sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.sec-head h2 { font-size: 26px; font-weight: 800; }
.stepper {
  display: inline-flex; align-items: center; background: var(--kb-saffron); color: var(--kb-saffron-ink);
  border-radius: 999px; padding: 3px; font-weight: 700;
}
.stepper button { width: 34px; height: 34px; border-radius: 999px; border: 0; background: transparent; color: inherit; display: inline-flex; align-items: center; justify-content: center; }
.stepper button:hover { background: rgba(255,255,255,.35); }
.stepper span { padding: 0 6px; min-width: 92px; text-align: center; font-size: 15px; }
.ing-list { list-style: none; margin: 0; padding: 0; }
.ing-group { font-family: var(--kb-display); font-weight: 700; font-size: 17px; margin: 16px 0 4px; color: var(--kb-herb); }
.ing {
  display: grid; grid-template-columns: 26px 92px 1fr; gap: 8px; align-items: baseline;
  padding: 9px 4px; border-bottom: 1px dashed var(--kb-line); cursor: pointer; user-select: none; border-radius: 6px;
}
.ing:last-child { border-bottom: 0; }
.ing:hover { background: var(--kb-herb-soft); }
.ing .box { width: 20px; height: 20px; border: 2px solid var(--kb-line); border-radius: 6px; align-self: center; display: flex; align-items: center; justify-content: center; color: #fff; }
.ing .amt { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.ing.done .box { background: var(--kb-herb); border-color: var(--kb-herb); }
.ing.done .amt, .ing.done .nm { text-decoration: line-through; opacity: .45; }
.ing .box ha-icon { --mdc-icon-size: 14px; }
.hint { color: var(--kb-ink-soft); font-size: 13px; margin: 12px 0 0; }
.ing-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.ing-actions .btn { justify-content: center; }

.steps { list-style: none; margin: 0; padding: 0; counter-reset: step; }
.step { display: grid; grid-template-columns: 56px 1fr; gap: 16px; padding: 0 0 26px; position: relative; }
.step::before {
  counter-increment: step; content: counter(step);
  width: 44px; height: 44px; border-radius: 14px; background: var(--kb-herb); color: #fff;
  font-family: var(--kb-display); font-weight: 800; font-size: 21px; display: flex; align-items: center; justify-content: center;
}
:host([dark]) .step::before { color: #0E1A15; }
.step:not(:last-child)::after { content: ""; position: absolute; left: 21px; top: 52px; bottom: 6px; width: 2px; background: var(--kb-line); }
.step p { margin: 8px 0 0; font-size: 18px; line-height: 1.6; max-width: 66ch; }
.timer-chip {
  display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; padding: 1px 10px; border-radius: 999px;
  border: 1.5px solid var(--kb-saffron); background: transparent; font-size: 14px; font-weight: 700; vertical-align: 2px;
}
.timer-chip ha-icon { --mdc-icon-size: 15px; }
.notes { margin-top: 10px; background: var(--kb-herb-soft); border-radius: 18px; padding: 18px 22px; }
.notes h3 { font-size: 19px; margin-bottom: 6px; }
.notes p { margin: 0; white-space: pre-wrap; }
.meta-foot { margin-top: 26px; color: var(--kb-ink-soft); font-size: 14px; display: flex; flex-wrap: wrap; gap: 6px 22px; }
.meta-foot a { color: var(--kb-herb); font-weight: 700; }

/* Vorbereitung / Kochen */
.phase + .phase { margin-top: 18px; }
.phase-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 14px; }
.phase-head h2 { font-size: 26px; font-weight: 800; }
.phase-time { display: inline-flex; align-items: center; gap: 5px; color: var(--kb-ink-soft); font-size: 15px; }
.phase-time ha-icon { --mdc-icon-size: 17px; }
.phase.ph-prep .step::before { background: var(--kb-saffron); color: var(--kb-saffron-ink); }
.phase.ph-prep .phase-head h2 { color: var(--kb-ink); }
.srow .num.pp { background: color-mix(in srgb, var(--kb-saffron) 30%, transparent); color: var(--kb-saffron-ink); }
:host([dark]) .srow .num.pp { color: var(--kb-saffron); }
.ph-title { display: inline-flex; align-items: center; gap: 10px; }
.ph-title ha-icon { color: var(--kb-herb); }
.cook .phase-label { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; padding: 6px 14px; border-radius: 999px; background: #21332B; color: #8CC2AE; font-weight: 700; margin-bottom: 14px; }
.cook .phase-label.pp { background: rgba(242,177,52,.15); color: var(--kb-saffron); }
.cook .progress i.pp { background: rgba(242,177,52,.25); }
.cook .progress i.pp.on { background: var(--kb-saffron); }
.cook .progress i.on:not(.pp) { background: #8CC2AE; }

/* Unterkategorien */
.cat-tile .ct-subs { position: relative; z-index: 1; font-size: 14px; opacity: .92; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub-shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin: 22px 0 6px; }
.sub-tile { display: flex; align-items: center; gap: 14px; text-align: left; padding: 12px 14px; border-radius: 18px; border: 0; background: var(--kb-surface); box-shadow: var(--kb-shadow); border-left: 6px solid var(--c); }
.sub-tile:hover { transform: translateY(-2px); }
.sub-tile .sub-icon { width: 46px; height: 46px; border-radius: 14px; background: var(--c); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; }
.sub-tile b { display: block; font-family: var(--kb-display); font-size: 20px; font-weight: 700; line-height: 1.15; }
.sub-tile small { color: var(--kb-ink-soft); font-size: 14px; }
.sub-tile > span:nth-child(2) { flex: 1; min-width: 0; }
.sub-tile .go { color: var(--kb-ink-soft); }
.sec-title.small { font-size: 20px; margin-top: 26px; }
.cat-sub { margin: 8px 0 0; color: var(--kb-ink-soft); font-size: 16px; }
.fav-tile .sub-icon { background: var(--kb-tomato); }
.cat-group { display: flex; flex-direction: column; gap: 6px; padding-bottom: 6px; }
.cat-group + .cat-group { border-top: 1px dashed var(--kb-line); padding-top: 10px; }
.cat-row { grid-template-columns: 44px 44px 1fr auto !important; grid-template-areas: "color prev name order" ". . icon parent"; }
.cat-row > input[type=color] { grid-area: color; }
.cat-row .prev { grid-area: prev; }
.cat-row .name-cell { grid-area: name; }
.cat-row .order { grid-area: order; }
.cat-row .icon-sel { grid-area: icon; }
.cat-row .parent-cell { grid-area: parent; min-width: 230px; display: flex; align-items: center; }
.cat-row .parent-cell select { width: 100%; }
.cat-row.sub { margin-left: 34px; position: relative; }
.cat-row.sub::before { content: ""; position: absolute; left: -22px; top: -6px; width: 14px; height: 34px; border-left: 2px solid var(--kb-line); border-bottom: 2px solid var(--kb-line); border-bottom-left-radius: 8px; }
.small-note { font-size: 13px; padding-left: 4px; }
.add-sub { align-self: flex-start; margin-left: 34px; display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; color: var(--kb-herb); font-weight: 700; padding: 6px 10px; border-radius: 10px; font-size: 14px; }
.add-sub:hover { background: var(--kb-herb-soft); }
.add-sub ha-icon { --mdc-icon-size: 18px; }

/* Editor */
.editor { max-width: 960px; margin: 0 auto; padding: 8px 20px 120px; }
.editor h1.page { font-size: 34px; font-weight: 800; margin: 10px 0 22px; }
.panel { background: var(--kb-surface); border-radius: 20px; padding: 22px; box-shadow: var(--kb-shadow); margin-bottom: 18px; }
.panel h2 { font-size: 21px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.fields { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; }
.f { display: flex; flex-direction: column; gap: 5px; grid-column: span 6; }
.f.s3 { grid-column: span 3; } .f.s2 { grid-column: span 2; }
.f label { font-size: 14px; font-weight: 700; color: var(--kb-ink-soft); }
.f input, .f textarea, .f select, .inp {
  width: 100%; border: 1.5px solid var(--kb-line); background: var(--kb-paper); border-radius: 12px;
  padding: 10px 12px; min-height: 44px; outline: none; transition: border-color .15s;
}
.f input:focus, .f textarea:focus, .f select:focus, .inp:focus { border-color: var(--kb-herb); }
.f textarea { resize: vertical; min-height: 80px; line-height: 1.5; }
.title-input { font-family: var(--kb-display); font-size: 26px !important; font-weight: 700; }
.img-drop {
  position: relative; aspect-ratio: 16 / 7; border-radius: 16px; overflow: hidden; border: 2px dashed var(--kb-line);
  display: flex; align-items: center; justify-content: center; color: var(--kb-ink-soft); background: var(--kb-paper);
}
.img-drop.has { border-style: solid; border-color: transparent; }
.img-drop img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.img-drop .img-actions { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 8px; }
.img-drop .center { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 20px; }
.diff { display: flex; gap: 6px; }
.diff button { flex: 1; min-height: 44px; border-radius: 12px; border: 1.5px solid var(--kb-line); background: var(--kb-paper); font-weight: 700; }
.diff button.on { background: var(--kb-herb); border-color: var(--kb-herb); color: #fff; }
:host([dark]) .diff button.on { color: #0E1A15; }
.rows { display: flex; flex-direction: column; gap: 8px; }
.irow { display: grid; grid-template-columns: 28px 90px 110px 1fr 40px; gap: 8px; align-items: center; }
.irow.head { grid-template-columns: 28px 1fr 40px; }
.irow.head .inp { font-family: var(--kb-display); font-weight: 700; color: var(--kb-herb); }
.grip { display: flex; flex-direction: column; align-items: center; color: var(--kb-ink-soft); }
.grip button { border: 0; background: transparent; padding: 0; height: 20px; color: inherit; }
.grip ha-icon { --mdc-icon-size: 18px; }
.srow { display: grid; grid-template-columns: 28px 36px 1fr 40px; gap: 8px; align-items: start; }
.srow .num { width: 36px; height: 44px; border-radius: 12px; background: var(--kb-herb-soft); color: var(--kb-herb); font-weight: 800; display: flex; align-items: center; justify-content: center; font-family: var(--kb-display); }
.srow textarea { min-height: 70px; resize: vertical; }
.add-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.chip-input { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; border: 1.5px solid var(--kb-line); background: var(--kb-paper); border-radius: 12px; padding: 6px 8px; min-height: 44px; }
.chip-input input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 120px; min-height: 30px; }
.chip-input .tag { display: inline-flex; align-items: center; gap: 4px; }
.chip-input .tag button { border: 0; background: transparent; padding: 0; color: inherit; display: inline-flex; }
.chip-input .tag ha-icon { --mdc-icon-size: 15px; }
.savebar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 6; display: flex; justify-content: flex-end; gap: 10px;
  padding: 12px max(20px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--kb-surface) 92%, transparent); backdrop-filter: blur(10px);
  border-top: 1px solid var(--kb-line);
}
.savebar .left { margin-right: auto; }
.lbl-m { display: none; }

/* Einstellungen */
.cat-row { display: grid; grid-template-columns: 44px 44px 1fr 190px auto; gap: 8px; align-items: center; padding: 8px; border-radius: 14px; background: var(--kb-paper); }
.cat-row .prev { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; }
.cat-row .prev ha-icon { --mdc-icon-size: 24px; }
.cat-row .name-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cat-row .name-cell small { color: var(--kb-ink-soft); font-size: 12px; padding-left: 4px; }
.cat-row .inp { background: var(--kb-surface); }
.cat-row .order { display: flex; gap: 4px; }
.cat-row .order .icon-btn { border: 1.5px solid var(--kb-line); background: var(--kb-surface); }
.cat-row .order .icon-btn[disabled] { opacity: .35; pointer-events: none; }
.cat-row.flash { animation: flash .6s ease; }
@keyframes flash { 0% { background: color-mix(in srgb, var(--kb-saffron) 35%, var(--kb-paper)); } }
.cat-row input[type=color] { width: 44px; height: 44px; padding: 3px; border-radius: 12px; border: 1.5px solid var(--kb-line); background: var(--kb-paper); }
.settings-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.muted { color: var(--kb-ink-soft); font-size: 14px; }

/* Import / Sicherung */
.seg { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--kb-paper); margin: 8px 0 14px; }
.seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 42px; border: 0; border-radius: 10px; background: transparent; font-weight: 700; color: var(--kb-ink-soft); }
.seg button.on { background: var(--kb-surface); color: var(--kb-ink); box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 120px; border: 2px dashed var(--kb-line); border-radius: 16px; cursor: pointer; font-weight: 700; color: var(--kb-herb); background: var(--kb-paper); }
.drop:hover { border-color: var(--kb-herb); }
.drop ha-icon { --mdc-icon-size: 32px; }
.drop.busy { cursor: progress; }
.btn.small { height: 36px; padding: 0 14px; font-size: 14px; }
.btn.small ha-icon { --mdc-icon-size: 18px; }
.switch { display: inline-flex; align-items: center; gap: 12px; font-weight: 700; cursor: pointer; }
.switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.switch .track { width: 46px; height: 28px; border-radius: 999px; background: var(--kb-line); position: relative; transition: background .15s; flex: none; }
.switch .track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .15s; }
.switch input:checked + .track { background: var(--kb-herb); }
.switch input:checked + .track::after { transform: translateX(18px); }
.switch input:focus-visible + .track { outline: 3px solid var(--kb-saffron); outline-offset: 2px; }
.check { display: inline-flex; align-items: center; gap: 10px; font-weight: 400 !important; color: var(--kb-ink) !important; }
.check input { width: 20px; height: 20px; min-height: 0; accent-color: var(--kb-herb); }
.bk-status { display: flex; flex-direction: column; gap: 4px; margin-top: 16px; padding: 12px 14px; border-radius: 12px; background: var(--kb-paper); font-size: 14px; color: var(--kb-ink-soft); }
.bk-status span { display: inline-flex; align-items: flex-start; gap: 8px; }
.bk-status ha-icon { --mdc-icon-size: 18px; flex: none; margin-top: 1px; }
.bk-ok ha-icon { color: var(--kb-herb); }
.bk-err { color: var(--kb-tomato); }
code { background: var(--kb-paper); padding: 1px 5px; border-radius: 5px; font-size: .92em; }

/* Einklappbare Bereiche */
.panel.fold { padding: 0; overflow: hidden; }
.fold-head { width: 100%; display: flex; align-items: center; gap: 14px; padding: 16px 20px; border: 0; background: transparent; text-align: left; min-height: 72px; }
.fold-head:hover { background: color-mix(in srgb, var(--kb-herb-soft) 60%, transparent); }
.fold-icon { width: 42px; height: 42px; border-radius: 12px; background: var(--kb-herb-soft); color: var(--kb-herb); display: flex; align-items: center; justify-content: center; flex: none; }
.fold-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.fold-text b { font-family: var(--kb-display); font-size: 20px; font-weight: 700; line-height: 1.2; }
.fold-text small { color: var(--kb-ink-soft); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fold-head .chev { color: var(--kb-ink-soft); transition: transform .2s ease; }
.fold.open .fold-head .chev { transform: rotate(180deg); }
.fold-body { padding: 4px 22px 22px; animation: fade .2s ease; }
.fold-sub { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; margin: 0 0 12px; }
.fold-sub ha-icon { color: var(--kb-herb); --mdc-icon-size: 20px; }
.fold-sub.divided { margin-top: 26px; padding-top: 20px; border-top: 1px solid var(--kb-line); }
.fold.open .fold-head { border-bottom: 1px solid var(--kb-line); margin-bottom: 14px; }
/* Bring! */
.btn.bring { background: #EE524F; border-color: #EE524F; color: #fff; }
.btn.bring:hover { filter: brightness(1.06); }
.bring-box { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 16px; background: var(--kb-paper); }
.bring-box.on { background: color-mix(in srgb, #EE524F 10%, var(--kb-paper)); }
.bring-badge { flex: none; width: 52px; height: 52px; border-radius: 14px; background: #EE524F; color: #fff; font-family: var(--kb-display); font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; }
.bring-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.bring-info small { color: var(--kb-ink-soft); }
.shop-head { display: flex; justify-content: space-between; align-items: center; color: var(--kb-ink-soft); font-size: 14px; margin-bottom: 6px; }
.linkish { border: 0; background: transparent; color: var(--kb-herb); font-weight: 700; padding: 4px 8px; border-radius: 8px; }
.linkish:hover { background: var(--kb-herb-soft); }
.shop-list { list-style: none; margin: 0; padding: 0; max-height: min(50vh, 420px); overflow-y: auto; border-top: 1px solid var(--kb-line); }
.shop-group { font-family: var(--kb-display); font-weight: 700; color: var(--kb-herb); padding: 12px 4px 4px; }
.shop-item { display: grid; grid-template-columns: 26px 1fr auto; gap: 10px; align-items: center; padding: 10px 6px; border-bottom: 1px dashed var(--kb-line); cursor: pointer; border-radius: 8px; user-select: none; }
.shop-item:hover { background: var(--kb-herb-soft); }
.shop-item .box { width: 22px; height: 22px; border: 2px solid var(--kb-line); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #fff; }
.shop-item .box ha-icon { --mdc-icon-size: 15px; }
.shop-item.on .box { background: var(--kb-herb); border-color: var(--kb-herb); }
.shop-item:not(.on) .nm, .shop-item:not(.on) .sp { opacity: .45; text-decoration: line-through; }
.shop-item .sp { color: var(--kb-ink-soft); font-size: 14px; text-align: right; }

.crumb-icon { --mdc-icon-size: 18px; margin-right: 6px; flex: none; }
.crumbs button.crumb-cat { gap: 0; }
.crumbs .here .crumb-icon { margin-right: 6px; }
.cat-title { display: inline-flex !important; align-items: center; gap: 16px; }
.cat-badge { width: 1.15em; height: 1.15em; border-radius: 0.3em; background: var(--c); color: #fff; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.cat-badge ha-icon { --mdc-icon-size: 0.7em; width: 0.7em; height: 0.7em; }
/* Einkaufen: Personenzahl */
.serv-pick { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 10px 0 4px; }
.serv-big { display: flex; align-items: center; gap: 22px; }
.serv-big button { width: 60px; height: 60px; border-radius: 999px; border: 2px solid var(--kb-line); background: var(--kb-surface); display: inline-flex; align-items: center; justify-content: center; }
.serv-big button:hover { border-color: var(--kb-herb); }
.serv-big button ha-icon { --mdc-icon-size: 28px; }
.serv-num { text-align: center; min-width: 120px; }
.serv-num b { display: block; font-family: var(--kb-display); font-size: 64px; font-weight: 800; line-height: 1; color: var(--kb-ink); }
.serv-num small { color: var(--kb-ink-soft); font-size: 16px; }
.serv-quick { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.serv-quick button { min-width: 48px; height: 40px; border-radius: 999px; border: 1.5px solid var(--kb-line); background: var(--kb-paper); font-weight: 700; }
.serv-quick button.on { background: var(--kb-herb); border-color: var(--kb-herb); color: #fff; }
:host([dark]) .serv-quick button.on { color: #0E1A15; }
.serv-note { color: var(--kb-ink-soft); font-size: 14px; margin: 0; text-align: center; }
.shop-for { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--kb-ink); }

/* Dialoge */
.scrim {
  position: fixed; inset: 0; z-index: 20; background: rgba(10,18,14,.5); display: flex; align-items: center; justify-content: center; padding: 20px;
  animation: fade .15s ease;
}
.dialog { background: var(--kb-surface); border-radius: 22px; padding: 24px; width: min(520px, 100%); box-shadow: 0 30px 60px -20px rgba(0,0,0,.5); animation: pop .18s ease; }
.dialog h2 { font-size: 24px; margin-bottom: 8px; }
.dialog p { color: var(--kb-ink-soft); margin: 0 0 16px; }
.dialog .row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; flex-wrap: wrap; }
.dialog textarea.inp { min-height: 220px; font-size: 15px; }
@keyframes fade { from { opacity: 0; } }
@keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.98); } }

.toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 30;
  background: var(--kb-ink); color: var(--kb-paper); padding: 12px 20px; border-radius: 14px; font-weight: 700;
  box-shadow: 0 10px 30px rgba(0,0,0,.3); animation: pop .2s ease; max-width: calc(100vw - 40px);
}
.toast.err { background: var(--kb-tomato); color: #fff; }
.spin { width: 22px; height: 22px; border: 3px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: rot .7s linear infinite; display: inline-block; }
@keyframes rot { to { transform: rotate(360deg); } }
.loading { display: flex; justify-content: center; padding: 120px 0; color: var(--kb-herb); }

/* Kochmodus */
.cook {
  position: fixed; inset: 0; z-index: 15; background: #0F1813; color: #EEF3EF; display: grid;
  grid-template-columns: 340px 1fr; animation: fade .2s ease;
}
.cook aside { background: #16221C; padding: 28px 24px; overflow-y: auto; }
.cook aside h3 { font-size: 20px; margin-bottom: 12px; color: var(--kb-saffron); }
.cook aside .ing { grid-template-columns: 26px 80px 1fr; border-color: #2A3832; }
.cook aside .ing:hover { background: #1F2E27; }
.cook aside .ing .box { border-color: #3A4C43; }
.cook aside .ing-group { color: #8CC2AE; }
.cook .stage { display: flex; flex-direction: column; padding: 24px 40px 30px; min-width: 0; }
.cook .bar { display: flex; align-items: center; gap: 12px; }
.cook .bar .icon-btn { color: #EEF3EF; }
.cook .bar .icon-btn:hover { background: #1F2E27; }
.cook .bar h2 { font-size: 18px; font-weight: 700; opacity: .7; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cook .progress { display: flex; gap: 6px; margin: 18px 0 0; }
.cook .progress i { flex: 1; height: 6px; border-radius: 3px; background: #2A3832; }
.cook .progress i.on { background: var(--kb-saffron); }
.cook .now { flex: 1; display: flex; flex-direction: column; justify-content: center; max-width: 900px; }
.cook .big-num { font-family: var(--kb-display); font-weight: 800; font-size: 120px; line-height: .9; color: var(--kb-saffron); }
.cook .big-num small { font-size: 28px; color: #6F8278; font-weight: 500; margin-left: 8px; }
.cook .now p { font-size: clamp(24px, 3.2vw, 38px); line-height: 1.35; margin: 18px 0 0; text-wrap: pretty; }
.cook .now .timer-chip { font-size: 20px; color: #EEF3EF; padding: 4px 14px; vertical-align: 4px; }
.cook .nav { display: flex; justify-content: space-between; gap: 12px; }
.cook .nav .btn { height: 60px; padding: 0 28px; font-size: 18px; background: #1F2E27; border-color: #2A3832; color: #EEF3EF; }
.cook .nav .btn.saffron { background: var(--kb-saffron); border-color: var(--kb-saffron); color: var(--kb-saffron-ink); }
.timers { position: fixed; right: 20px; top: 84px; z-index: 25; display: flex; flex-direction: column; gap: 8px; }
.timer {
  display: flex; align-items: center; gap: 10px; background: var(--kb-saffron); color: var(--kb-saffron-ink);
  padding: 8px 8px 8px 16px; border-radius: 16px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,.3);
}
.timer .t { font-family: var(--kb-display); font-size: 24px; font-variant-numeric: tabular-nums; min-width: 72px; }
.timer.ring { background: var(--kb-tomato); color: #fff; animation: pulse 1s ease infinite; }
.timer button { border: 0; background: rgba(0,0,0,.1); border-radius: 10px; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; color: inherit; }
@keyframes pulse { 50% { transform: scale(1.04); } }

@media (max-width: 860px) {
  .cols { grid-template-columns: 1fr; gap: 28px; }
  .ingredients { position: static; }
  .cook { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .cook aside { display: none; }
  .cook .stage { padding: 18px 20px 22px; }
  .cook .big-num { font-size: 84px; }
}
@media (max-width: 640px) {
  .brand .count, .btn .lbl { display: none; }
  .top .btn { padding: 0 12px; }
  .search { width: auto; flex: 1; min-width: 0; padding: 0 12px; }
  .top { gap: 6px; }
  .brand h1 { font-size: 22px; }
  .top.has-search { flex-direction: column; align-items: stretch; gap: 8px; }
  .top.has-search .row1 { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .top.has-search .row1 > * { order: 0; }
  .top.has-search .row1 > .brand, .top.has-search .row1 > .crumbs { flex: 0 1 auto; min-width: 0; overflow: hidden; }
  .top.has-search .row1 > .icon-btn, .top.has-search .row1 > .btn, .top.has-search .row1 > ha-menu-button { flex: none; }
  .top.has-search > .search { order: 0; width: 100%; margin: 0; flex: none; }
  .crumbs button { min-width: 0; max-width: 100%; }
  .crumbs button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row1 > .back-btn + .crumbs button span { display: none; }
  .brand h1 { overflow: hidden; text-overflow: ellipsis; }
  .top.list .brand .count { display: none; }
  main, .detail, .editor { padding-left: 14px; padding-right: 14px; }
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 12px; }
  .card .facts { flex-wrap: wrap; white-space: normal; line-height: 1.5; height: calc(3em + 4px); align-content: flex-start; margin-top: 0; }
  .card h3 { height: 2.3em; min-height: 0; }
  .card h3 { font-size: 16px; }
  .card .desc { display: none; }
  .card .body { padding: 10px 12px 12px; }
  .facts { font-size: 13px; gap: 4px 10px; }
  .hero { border-radius: 18px; height: 40vh; min-height: 260px; }
  .hero .title { padding: 20px; }
  .strip { margin: -22px 10px 0; }
  .pill { min-width: 0; flex: 1 1 40%; padding: 8px 12px; }
  .fields { grid-template-columns: 1fr 1fr; }
  .f.s3, .f.s2 { grid-column: span 1; }
  .f.full-m { grid-column: span 2; }
  .f { grid-column: span 2; }
  .irow { grid-template-columns: 24px 62px 74px 1fr 36px; gap: 6px; }
  .cat-row { grid-template-columns: 44px 44px 1fr !important; grid-template-areas: "color prev name" "icon icon icon" "parent parent parent" "order order order"; }
  .cat-row .parent-cell { min-width: 0; }
  .cat-row .order { justify-content: flex-end; }
  .cat-row.sub { margin-left: 18px; }
  .cat-row.sub::before { left: -14px; width: 8px; }
  .add-sub { margin-left: 18px; }
  .sub-shelf { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
  .sub-tile { padding: 10px; gap: 10px; border-left-width: 4px; border-radius: 14px; }
  .sub-tile .sub-icon { width: 38px; height: 38px; border-radius: 11px; }
  .sub-tile b { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub-tile small { font-size: 12.5px; }
  .sub-tile .go { display: none; }
  .crumbs button { font-size: 18px; padding: 0 8px; }
  .top.top-detail { gap: 2px; }
  .top.top-detail .crumbs button span, .top.top-detail [data-action=print] { display: none; }
  .top.top-detail .btn { padding: 0 11px; }
  .crumbs .sep, .crumbs .here, .crumbs .crumb-cat { display: none; }
  .cat-title { font-size: 30px; margin-top: 8px; }
  .savebar { padding-left: 14px; padding-right: 14px; }
  .savebar .btn { flex: 1 1 0; min-width: 0; justify-content: center; padding: 0 10px; }
  .savebar .btn ha-icon { display: none; }
  .savebar .lbl-m { display: inline; }
  .shelf { grid-template-columns: 1fr 1fr; gap: 12px; }
  .cat-tile { min-height: 132px; padding: 16px; }
  .cat-tile .ct-name { font-size: 22px; }
  .cat-tile .ct-count { font-size: 13px; }
  .cat-tile .bg { --mdc-icon-size: 110px; }
  .cat-tile .thumbs img { width: 38px; height: 38px; }
  .minis { display: grid; grid-template-columns: 1fr 1fr; }
  .mini-tile { padding: 10px 12px; }
  .step { grid-template-columns: 46px 1fr; }
  .step p { font-size: 17px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

/* ------------------------------------------------------------------ Panel */
class KochbuchPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.recipes = [];
    this.settings = { categories: [], shopping_list: "", default_servings: 4 };
    this.loaded = false;
    this.filter = "all";
    this.search = "";
    this.sort = localStorage.getItem("kochbuch-sort") || "title";
    this.view = { name: "list" };
    this.draft = null;
    this.servings = null;
    this.checked = new Set();
    this.dialog = null;
    this.cook = null;
    this.timers = [];
    try { this.folds = new Set(JSON.parse(localStorage.getItem("kochbuch-folds") || '["kategorien"]')); } catch (e) { this.folds = new Set(["kategorien"]); }
    this._timerTick = null;
    this._wakeLock = null;
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("input", (e) => this._onInput(e));
    this.shadowRoot.addEventListener("change", (e) => this._onChange(e));
    this.shadowRoot.addEventListener("keydown", (e) => this._onKey(e));
    this._onDocKey = (e) => this._onGlobalKey(e);
    ensureFonts();
  }

  connectedCallback() {
    if (!this.hasAttribute("lang")) this.setAttribute("lang", "de");
    document.addEventListener("keydown", this._onDocKey);
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this._onDocKey);
    if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; }
    this._releaseWake();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const dark = !!hass.themes?.darkMode;
    if (dark !== this.hasAttribute("dark")) this.toggleAttribute("dark", dark);
    const mb = this.shadowRoot.querySelector("ha-menu-button");
    if (mb) mb.hass = hass;
    if (first) this._load();
  }
  get hass() { return this._hass; }

  set narrow(v) {
    this._narrow = v;
    const mb = this.shadowRoot.querySelector("ha-menu-button");
    if (mb) mb.narrow = v;
  }

  set route(route) {
    this._route = route;
    this._applyRoute();
  }

  set panel(p) { this._panel = p; }

  async _load() {
    try {
      const data = await this._hass.callWS({ type: "kochbuch/data" });
      this._setData(data);
      this.loaded = true;
      this.settingsDraft = null;
      this._unsub = this._hass.connection.subscribeMessage((d) => this._onUpdate(d), { type: "kochbuch/subscribe" });
    } catch (err) {
      this.loaded = true;
      this._loadError = err.message || String(err);
    }
    this._applyRoute();
  }

  _setData(data) {
    this.recipes = data.recipes || [];
    this.settings = data.settings || this.settings;
    if (data.backup) this.backupCfg = data.backup;
  }

  _onUpdate(data) {
    this._setData(data);
    if (this.view.name === "edit" || this.view.name === "settings") return;
    if (this.view.name === "detail" && !this._recipe(this.view.id)) { this._go(""); return; }
    this.render();
  }

  /* --------------------------------------------------------- Navigation */
  _applyRoute() {
    const path = (this._route && this._route.path) || "";
    const parts = path.split("/").filter(Boolean);
    let view = { name: "home" };
    if (!parts.length) { this.filter = "all"; this.favOnly = false; }
    if (parts[0] === "kategorie" && parts[1]) {
      const favOnly = parts[2] === "favoriten";
      view = { name: "list", id: parts[1] + (favOnly ? "/fav" : "") };
      const f = { alle: "all", favoriten: "fav", ohne: "none" }[parts[1]] || decodeURIComponent(parts[1]);
      if (f !== this.filter || favOnly !== this.favOnly) this.search = "";
      this.filter = f;
      this.favOnly = favOnly;
    } else if (parts[0] === "rezept" && parts[1]) view = { name: "detail", id: parts[1] };
    else if (parts[0] === "neu") view = { name: "edit", id: null };
    else if (parts[0] === "bearbeiten" && parts[1]) view = { name: "edit", id: parts[1] };
    else if (parts[0] === "einstellungen") view = { name: "settings" };

    const prev = this.view;
    if (prev.name === "edit") this._readDraft();
    if (prev.name === "settings") this._readSettings();
    if (view.name === "detail"&& (prev.name !== "detail" || prev.id !== view.id)) {
      const r = this._recipe(view.id);
      this.servings = r ? r.servings : null;
      this.checked = new Set();
    }
    if (view.name === "edit" && !this.loaded) {
      this.draft = null;
    } else if (view.name === "edit") {
      const key = view.id || "__new__";
      if (!this.draft || this.draft._key !== key) {
        const r = view.id ? this._recipe(view.id) : null;
        if (view.id && !r && this.loaded) { this._go(""); return; }
        this.draft = r ? JSON.parse(JSON.stringify(r)) : this._newDraft(this._pendingImport);
        this.draft._key = key;
        this._pendingImport = null;
      }
    } else {
      this.draft = null;
    }
    if (view.name === "settings" && (prev.name !== "settings" || !this.settingsDraft)) {
      this.settingsDraft = JSON.parse(JSON.stringify(this.settings));
      this.backupDraft = null;
    }
    this.view = view;
    this.render();
    if (view.name === "home" && prev.name === "list") this.search = "";
    if (prev.name !== view.name || prev.id !== view.id) window.scrollTo?.(0, 0);
    this.shadowRoot.host.scrollTop = 0;
  }

  _go(sub, replace = false) {
    const base = (this._route && this._route.prefix) || "/kochbuch";
    const url = sub ? `${base}/${sub}` : base;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace } }));
  }

  _back() {
    if (history.length > 1 && this._navigatedInside) history.back();
    else this._go("", true);
  }

  _newDraft(base) {
    const cat = this.view.name === "list" && this._cat(this.filter) ? this.filter : ((this.settings.categories || [])[0]?.id || "");
    return {
      title: "", description: "", category: cat, tags: [], image: "",
      servings: this.settings.default_servings || 4, servings_unit: "Portionen",
      prep_time: 0, cook_time: 0, rest_time: 0, difficulty: 1, rating: 0, favorite: false,
      ingredients: [{ amount: "", unit: "", name: "", group: "" }],
      prep_steps: [""], steps: [""], notes: "", source: "", author: "",
      ...(base || {}),
    };
  }

  _recipe(id) { return this.recipes.find((r) => r.id === id); }
  _cat(id) { return (this.settings.categories || []).find((c) => c.id === id); }
  _parentOf(c) { return c && c.parent ? this._cat(c.parent) : null; }
  _topCats(list = this.settings.categories || []) { const ids = new Set(list.map((c) => c.id)); return list.filter((c) => !c.parent || !ids.has(c.parent)); }
  _subs(id, list = this.settings.categories || []) { return list.filter((c) => c.parent === id); }
  _family(id) { return new Set([id, ...this._subs(id).map((c) => c.id)]); }
  _catLabel(c) { const p = this._parentOf(c); return p ? `${p.name} › ${c.name}` : c.name; }

  /* ------------------------------------------------------------- Rendern */
  render() {
    const root = this.shadowRoot;
    let body = "";
    if (!this.loaded) body = `<div class="loading"><span class="spin"></span></div>`;
    else if (this._loadError) body = this._renderError();
    else if (this.view.name === "detail") body = this._renderDetail();
    else if (this.view.name === "edit") body = this._renderEditor();
    else if (this.view.name === "settings") body = this._renderSettings();
    else if (this.view.name === "list") body = this._renderList();
    else body = this._renderHome();

    // Scrollpositionen merken, damit ein Neuaufbau nicht nach oben springt
    const keep = [];
    for (let n = this; n; n = n.parentNode || n.host) {
      if (n.scrollTop > 0) keep.push([n, n.scrollTop]);
      if (n === document.documentElement) break;
    }
    const winY = window.scrollY;
    const inner = [".shop-list", ".cook aside", ".dialog"].map((sel) => [sel, root.querySelector(sel)?.scrollTop || 0]);
    const sameView = this._lastView === `${this.view.name}:${this.view.id || ""}`;
    this._lastView = `${this.view.name}:${this.view.id || ""}`;
    root.innerHTML = `<style>${STYLES}</style>${body}${this._renderCook()}${this._renderDialog()}${this._renderTimers()}${this._toast ? `<div class="toast ${this._toast.err ? "err" : ""}" role="status">${esc(this._toast.text)}</div>` : ""}`;
    const mb = root.querySelector("ha-menu-button");
    if (mb) { mb.hass = this._hass; mb.narrow = this._narrow; }
    if (sameView) {
      for (const [n, y] of keep) n.scrollTop = y;
      if (window.scrollY !== winY) window.scrollTo(0, winY);
      for (const [sel, y] of inner) { const el = root.querySelector(sel); if (el && y) el.scrollTop = y; }
    }
    if (this._focusSel) {
      const el = root.querySelector(this._focusSel);
      if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
      this._focusSel = null;
    }
  }

  _top(cls, inner) {
    const m = inner.match(/<label class="search">[\s\S]*?<\/label>/);
    if (!m) return `<header class="top ${cls || ""}"><ha-menu-button></ha-menu-button>${inner}</header>`;
    // Suchfeld getrennt, damit es auf dem Handy eine eigene Zeile bekommt
    return `<header class="top has-search ${cls || ""}"><div class="row1"><ha-menu-button></ha-menu-button>${inner.replace(m[0], "")}</div>${m[0]}</header>`;
  }

  _renderError() {
    return `${this._top("", `<div class="brand"><h1>Kochbuch</h1></div>`)}
      <div class="empty"><div class="plate"><ha-icon icon="mdi:alert-circle-outline"></ha-icon></div>
      <h2>Das Kochbuch lässt sich nicht laden</h2><p>${esc(this._loadError)}. Starte Home Assistant neu, nachdem du die Integration installiert oder aktualisiert hast.</p></div>`;
  }

  _filtered(filter = this.filter) {
    const q = this.search.trim().toLowerCase();
    let list = this.recipes.filter((r) => {
      if ((filter === "fav" || (this.favOnly && filter === this.filter)) && !r.favorite) return false;
      if (filter === "none" && r.category && this._cat(r.category)) return false;
      // Ohne Suche nur Rezepte direkt in diesem Ordner; die Suche umfasst auch die Unterkategorien
      if (!["all", "fav", "none"].includes(filter) && (q ? !this._family(filter).has(r.category) : r.category !== filter)) return false;
      if (!q) return true;
      const hay = [r.title, r.description, (r.tags || []).join(" "), (r.ingredients || []).map((i) => i.name).join(" ")].join(" ").toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    const total = (r) => (r.prep_time || 0) + (r.cook_time || 0);
    const sorts = {
      title: (a, b) => a.title.localeCompare(b.title, "de"),
      new: (a, b) => (b.created || "").localeCompare(a.created || ""),
      time: (a, b) => (total(a) || 9999) - (total(b) || 9999),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title, "de"),
      cooked: (a, b) => (b.cooked || []).length - (a.cooked || []).length,
    };
    // Favoriten stehen immer oben, darunter die gewählte Sortierung
    const by = sorts[this.sort] || sorts.title;
    return list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || by(a, b));
  }

  _slug(filter) { return { all: "alle", fav: "favoriten", none: "ohne" }[filter] || filter; }

  _filterName(filter) {
    if (filter === "all") return "Alle Rezepte";
    if (filter === "fav") return "Favoriten";
    if (filter === "none") return "Ohne Kategorie";
    return this._cat(filter)?.name || "Kategorie";
  }

  _header(cls, lead, title, sub) {
    return this._top(cls, `${lead}
      <div class="brand"><h1>${title}</h1>${sub ? `<span class="count">${sub}</span>` : ""}</div>
      <div class="spacer"></div>
      <label class="search"><ha-icon icon="mdi:magnify"></ha-icon><input id="search" type="search" placeholder="${this.view.name === "home" ? "Rezept oder Zutat suchen" : `In ${esc(this._filterName(this.filter))} suchen`}" value="${esc(this.search)}" aria-label="Suchen"></label>
      <button class="icon-btn" data-action="import" title="Rezepte importieren" aria-label="Rezepte importieren"><ha-icon icon="mdi:tray-arrow-down"></ha-icon></button>
      <button class="btn primary" data-action="new"><ha-icon icon="mdi:plus"></ha-icon><span class="lbl">Neues Rezept</span></button>
      <button class="icon-btn" data-action="settings" title="Einstellungen" aria-label="Einstellungen"><ha-icon icon="mdi:cog-outline"></ha-icon></button>`);
  }

  _toolbar(extra = "") {
    return `<div class="toolbar"><span id="result-count">${this._resultLabel()}</span><div class="spacer"></div>${extra}
        <label>Sortieren: <select id="sort">
          ${[["title", "A–Z"], ["new", "Neueste"], ["time", "Schnellste"], ["rating", "Beste Bewertung"], ["cooked", "Oft gekocht"]].map(([v, l]) => `<option value="${v}" ${this.sort === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></label></div>`;
  }

  _renderHome() {
    const n = this.recipes.length;
    const header = this._header("list", "", "Kochbuch", "");
    if (this.search.trim()) {
      return `${header}<main>${this._toolbar()}<section class="grid" id="grid">${this._renderCards()}</section></main>`;
    }
    const cats = this.settings.categories || [];
    const inCat = (id) => { const fam = this._family(id); return this.recipes.filter((r) => fam.has(r.category)); };
    const tiles = this._topCats(cats).map((c) => {
      const list = inCat(c.id);
      const subs = this._subs(c.id);
      const pics = list.filter((r) => r.image).slice(0, 3);
      return `<button class="cat-tile" style="--c:${esc(c.color)}" data-action="cat" data-id="${esc(c.id)}">
        <ha-icon class="bg" icon="${esc(c.icon)}"></ha-icon>
        ${pics.length ? `<span class="thumbs">${pics.map((r) => `<img src="${esc(r.image)}" alt="" loading="lazy">`).join("")}</span>` : ""}
        <span class="ct-name">${esc(c.name)}</span>
        <span class="ct-count">${list.length ? `${list.length} ${list.length === 1 ? "Rezept" : "Rezepte"}` : "Noch leer"}</span>
      </button>`;
    }).join("");
    const none = this.recipes.filter((r) => !r.category || !this._cat(r.category)).length;
    const noneTile = none ? `<button class="cat-tile" style="--c:#6B7A72" data-action="cat" data-id="none">
        <ha-icon class="bg" icon="mdi:tag-off-outline"></ha-icon>
        <span class="ct-name">Ohne Kategorie</span><span class="ct-count">${none} ${none === 1 ? "Rezept" : "Rezepte"}</span></button>` : "";
    const body = tiles || noneTile
      ? `<section class="shelf" aria-label="Kategorien">${tiles}${noneTile}</section>`
      : `<div class="empty"><div class="plate"><ha-icon icon="mdi:shape-outline"></ha-icon></div><h2>Noch keine Kategorien</h2><p>Legt in den Einstellungen Kategorien an, z. B. Nudeln oder Suppen.</p><div class="row"><button class="btn primary" data-action="settings"><ha-icon icon="mdi:cog-outline"></ha-icon>Zu den Einstellungen</button></div></div>`;
    return `${header}<main class="home">${body}</main>`;
  }

  _crumbs(extra) {
    return `<nav class="crumbs" aria-label="Pfad"><button data-action="home"><ha-icon icon="mdi:home-outline"></ha-icon><span>Kochbuch</span></button>${extra || ""}</nav>`;
  }

  _renderList() {
    const c = this._cat(this.filter);
    const parent = this._parentOf(c);
    const fav = this.favOnly && !!c;
    const sep = `<span class="sep"><ha-icon icon="mdi:chevron-right"></ha-icon></span>`;
    const crumbCat = (x) => `${sep}<button class="crumb-cat" data-action="cat" data-id="${esc(x.id)}"><ha-icon class="crumb-icon" icon="${esc(x.icon)}" style="color:${esc(x.color)}"></ha-icon>${esc(x.name)}</button>`;
    const here = fav
      ? `${sep}<span class="here"><ha-icon class="crumb-icon" icon="mdi:heart" style="color:var(--kb-tomato)"></ha-icon>Favoriten</span>`
      : `${sep}<span class="here">${c ? `<ha-icon class="crumb-icon" icon="${esc(c.icon)}" style="color:${esc(c.color)}"></ha-icon>` : ""}${esc(this._filterName(this.filter))}</span>`;
    // In Unterkategorien nur die aktuelle Kategorie zeigen; der Pfeil führt eine Ebene zurück
    const backTo = fav ? c : parent;
    const backBtn = backTo ? `<button class="icon-btn back-btn" data-action="cat" data-id="${esc(backTo.id)}" title="Zurück zu ${esc(backTo.name)}" aria-label="Zurück zu ${esc(backTo.name)}"><ha-icon icon="mdi:arrow-left"></ha-icon></button>` : "";
    const crumbs = backBtn + this._crumbs(`${fav ? crumbCat(c) : ""}${here}`);
    const fam = c ? this._family(c.id) : new Set();
    const subs = c && !parent && !fav ? this._subs(c.id) : [];
    const favTile = "";
    const subTiles = favTile || subs.length ? `<section class="sub-shelf" aria-label="Unterkategorien">${favTile}${subs.map((x) => {
      const n = this.recipes.filter((r) => r.category === x.id).length;
      return `<button class="sub-tile" style="--c:${esc(x.color)}" data-action="cat" data-id="${esc(x.id)}"><span class="sub-icon"><ha-icon icon="${esc(x.icon)}"></ha-icon></span><span><b>${esc(x.name)}</b><small>${n ? `${n} ${n === 1 ? "Rezept" : "Rezepte"}` : "Noch leer"}</small></span><ha-icon class="go" icon="mdi:chevron-right"></ha-icon></button>`;
    }).join("")}</section>` : "";
    const placeholder = fav ? `Favoriten in ${esc(c.name)} suchen` : `In ${esc(this._filterName(this.filter))} suchen`;
    const header = this._top("list", `${crumbs}<div class="spacer"></div>
      <label class="search"><ha-icon icon="mdi:magnify"></ha-icon><input id="search" type="search" placeholder="${placeholder}" value="${esc(this.search)}" aria-label="Suchen"></label>
      <button class="icon-btn" data-action="import" title="Rezepte importieren" aria-label="Rezepte importieren"><ha-icon icon="mdi:tray-arrow-down"></ha-icon></button>
      <button class="btn primary" data-action="new"><ha-icon icon="mdi:plus"></ha-icon><span class="lbl">Neues Rezept</span></button>
      <button class="icon-btn" data-action="settings" title="Einstellungen" aria-label="Einstellungen"><ha-icon icon="mdi:cog-outline"></ha-icon></button>`);
    const empty = !this._filtered().length && !this.search.trim();
    const title = fav
      ? `<h1 class="cat-title" style="--c:var(--kb-tomato)"><span class="cat-badge"><ha-icon icon="mdi:heart"></ha-icon></span>Favoriten</h1><p class="cat-sub">aus ${esc(c.name)}</p>`
      : `<h1 class="cat-title" style="--c:${esc(c ? c.color : "var(--kb-ink)")}">${c ? `<span class="cat-badge"><ha-icon icon="${esc(c.icon)}"></ha-icon></span>` : ""}${esc(this._filterName(this.filter))}</h1>`;
    return `${header}<main>
      ${title}
      ${subTiles}
      ${subTiles && !empty ? `<h2 class="sec-title small">${this.search.trim() ? `Gefunden in ${esc(c.name)}` : `Weitere Rezepte in ${esc(c.name)}`}</h2>` : ""}
      ${empty ? "" : this._toolbar(c && !fav && !this.search.trim() ? `<button class="btn small" data-action="export-cat" data-id="${esc(c.id)}" title="Kategorie exportieren" aria-label="Kategorie exportieren"><ha-icon icon="mdi:export-variant"></ha-icon><span class="lbl">Kategorie exportieren</span></button>` : "")}
      ${empty && subs.length ? "" : `<section class="grid" id="grid">${empty ? this._emptyCategory() : this._renderCards()}</section>`}
    </main>`;
  }

  _emptyCategory() {
    const c = this._cat(this.filter);
    if (this.favOnly && c) {
      return `<div class="empty" style="grid-column:1/-1"><div class="plate" style="color:var(--kb-tomato)"><ha-icon icon="mdi:heart-outline"></ha-icon></div>
        <h2>Noch keine Favoriten in ${esc(c.name)}</h2><p>Tippt bei einem Rezept auf das Herz, dann erscheint es hier.</p></div>`;
    }
    const what = this.filter === "fav" ? "Noch keine Favoriten. Tippt bei einem Rezept auf das Herz." : `In „${esc(this._filterName(this.filter))}“ gibt es noch kein Rezept.`;
    return `<div class="empty" style="grid-column:1/-1"><div class="plate" ${c ? `style="color:${esc(c.color)}"` : ""}><ha-icon icon="${esc(c ? c.icon : this.filter === "fav" ? "mdi:heart-outline" : "mdi:chef-hat")}"></ha-icon></div>
      <h2>${what}</h2>${this.filter === "fav" ? "" : `<p>${c && this._subs(c.id).length ? "Neue Rezepte könnt ihr direkt hier oder in einer Unterkategorie anlegen." : "Das erste Rezept landet direkt in dieser Kategorie."}</p><div class="row"><button class="btn primary" data-action="new"><ha-icon icon="mdi:pencil-plus"></ha-icon>Rezept schreiben</button></div>`}</div>`;
  }

  _resultLabel() {
    const n = this._filtered().length;
    return n === 1 ? "1 Rezept" : `${n} Rezepte`;
  }

  _renderCards(given) {
    const list = given || this._filtered();
    if (!list.length) {
      return `<div class="empty" style="grid-column:1/-1"><div class="plate"><ha-icon icon="mdi:magnify-close"></ha-icon></div>
        <h2>Nichts gefunden</h2><p>Kein Rezept passt zu dieser Suche. Versucht einen anderen Begriff oder wählt „Alle“.</p></div>`;
    }
    return list.map((r) => {
      const c = this._cat(r.category);
      const color = c ? c.color : "#2F5D50";
      const total = (r.prep_time || 0) + (r.cook_time || 0);
      return `<article class="card" style="--c:${esc(color)}" data-action="open" data-id="${esc(r.id)}" tabindex="0" role="link" aria-label="${esc(r.title)}">
        ${c ? `<span class="flag">${esc(c.name)}</span>` : ""}
        <div class="pic">${this._pic(r, c)}</div>
        <button class="fav ${r.favorite ? "on" : ""}" data-action="fav" data-id="${esc(r.id)}" aria-label="${r.favorite ? "Aus Favoriten entfernen" : "Zu Favoriten"}"><ha-icon icon="${r.favorite ? "mdi:heart" : "mdi:heart-outline"}"></ha-icon></button>
        <div class="body">
          <h3>${esc(r.title)}</h3>
          <div class="desc">${esc(r.description || "")}</div>
          <div class="facts">
            ${total ? `<span><ha-icon icon="mdi:clock-outline"></ha-icon>${fmtMinutes(total)}</span>` : ""}
            <span><ha-icon icon="mdi:chef-hat"></ha-icon>${DIFFICULTY[r.difficulty] || "Einfach"}</span>
            ${r.rating ? `<span><ha-icon icon="mdi:star" style="color:var(--kb-saffron)"></ha-icon>${r.rating}</span>` : ""}
          </div>
        </div>
      </article>`;
    }).join("");
  }

  _pic(r, c) {
    if (r.image) return `<img src="${esc(r.image)}" alt="" loading="lazy">`;
    return `<div class="placeholder" style="--c:${esc(c ? c.color : "#2F5D50")}"><ha-icon icon="${esc(c ? c.icon : "mdi:food")}"></ha-icon></div>`;
  }

  /* ---------------------------------------------------------- Detail */
  _renderDetail() {
    const r = this._recipe(this.view.id);
    if (!r) return `${this._top("", `<button class="icon-btn" data-action="home"><ha-icon icon="mdi:arrow-left"></ha-icon></button>`)}<div class="empty"><h2>Rezept nicht gefunden</h2></div>`;
    const c = this._cat(r.category);
    const color = c ? c.color : "#2F5D50";
    const servings = this.servings || r.servings;
    const factor = servings / (r.servings || 1);
    const cookedN = (r.cooked || []).length;

    const header = this._top("top-detail", `
      ${this._crumbs([c].filter(Boolean).map((x) => `<span class="sep"><ha-icon icon="mdi:chevron-right"></ha-icon></span><button class="crumb-cat" data-action="cat" data-id="${esc(x.id)}"><ha-icon class="crumb-icon" icon="${esc(x.icon)}" style="color:${esc(x.color)}"></ha-icon>${esc(x.name)}</button>`).join(""))}
      <div class="spacer"></div>
      <button class="icon-btn" data-action="fav" data-id="${esc(r.id)}" aria-label="Favorit" style="color:${r.favorite ? "var(--kb-tomato)" : "inherit"}"><ha-icon icon="${r.favorite ? "mdi:heart" : "mdi:heart-outline"}"></ha-icon></button>
      <button class="icon-btn" data-action="export-recipe" data-id="${esc(r.id)}" aria-label="Rezept exportieren" title="Rezept exportieren"><ha-icon icon="mdi:export-variant"></ha-icon></button>
      <button class="icon-btn" data-action="print" aria-label="Drucken" title="Drucken"><ha-icon icon="mdi:printer-outline"></ha-icon></button>
      <button class="icon-btn" data-action="delete" data-id="${esc(r.id)}" aria-label="Löschen" title="Löschen"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
      <button class="btn" data-action="edit" data-id="${esc(r.id)}"><ha-icon icon="mdi:pencil-outline"></ha-icon><span class="lbl">Bearbeiten</span></button>
      ${allSteps(r).length ? `<button class="btn saffron" data-action="cook"><ha-icon icon="mdi:stove"></ha-icon><span class="lbl">Kochmodus</span></button>` : ""}`);

    let ingHtml = "";
    orderWithin((r.ingredients || []).map((i, idx) => ({ i, idx, heading: !i.name && !i.amount && !!i.group })), (e) => this.checked.has(e.idx)).forEach(({ i, idx }) => {
      if (!i.name && !i.amount && i.group) { ingHtml += `<li class="ing-group">${esc(i.group)}</li>`; return; }
      const amt = [scaleAmount(i.amount, factor), i.unit].filter(Boolean).join(" ");
      ingHtml += `<li class="ing ${this.checked.has(idx) ? "done" : ""}" data-action="check" data-idx="${idx}" role="checkbox" aria-checked="${this.checked.has(idx)}" tabindex="0">
        <span class="box">${this.checked.has(idx) ? `<ha-icon icon="mdi:check-bold"></ha-icon>` : ""}</span>
        <span class="amt">${esc(amt)}</span><span class="nm">${esc(i.name)}</span></li>`;
    });

    const pills = [
      r.prep_time ? `<div class="pill"><small>Vorbereitung</small><b>${fmtMinutes(r.prep_time)}</b></div>` : "",
      r.cook_time ? `<div class="pill"><small>Koch- / Backzeit</small><b>${fmtMinutes(r.cook_time)}</b></div>` : "",
      r.rest_time ? `<div class="pill"><small>Ruhezeit</small><b>${fmtMinutes(r.rest_time)}</b></div>` : "",
      `<div class="pill"><small>Schwierigkeit</small><b>${DIFFICULTY[r.difficulty] || "Einfach"}</b></div>`,
      `<div class="pill stars"><small>Bewertung</small><span class="stars-row">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= (r.rating || 0) ? "on" : ""}" data-action="rate" data-n="${n}" aria-label="${n} Sterne"><ha-icon icon="mdi:star"></ha-icon></button>`).join("")}</span></div>`,
    ].join("");

    const phases = PHASES.filter((ph) => (r[ph.key] || []).length).map((ph) => `
          <div class="phase ${ph.key === "prep_steps" ? "ph-prep" : "ph-cook"}">
            <div class="phase-head"><h2>${ph.name}</h2>${r[ph.time] ? `<span class="phase-time"><ha-icon icon="mdi:clock-outline"></ha-icon>${fmtMinutes(r[ph.time])}</span>` : ""}</div>
            <ol class="steps">${r[ph.key].map((t) => `<li class="step"><p>${this._stepHtml(t)}</p></li>`).join("")}</ol>
          </div>`).join("");
    const source = r.source && /^https?:\/\//i.test(r.source) ? `<a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(new URL(r.source).hostname.replace(/^www\./, ""))}</a>` : esc(r.source);

    return `${header}<div class="detail">
      <section class="hero" style="--c:${esc(color)}">
        <div class="pic">${this._pic(r, c)}</div><div class="shade"></div>
        <div class="title">
          ${c ? `<span class="cat"><ha-icon icon="${esc(c.icon)}"></ha-icon>${esc(c.name)}</span>` : ""}
          <h1>${esc(r.title)}</h1>
          ${r.author ? `<div class="by">von ${esc(r.author)}</div>` : ""}
        </div>
      </section>
      <div class="strip">${pills}</div>
      ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ""}
      ${(r.tags || []).length ? `<div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="cols">
        <section class="ingredients" aria-label="Zutaten">
          <div class="sec-head"><h2>Zutaten</h2>
            <div class="stepper" aria-label="Portionen">
              <button data-action="serv" data-d="-1" aria-label="Weniger"><ha-icon icon="mdi:minus"></ha-icon></button>
              <span>${servings} ${esc(r.servings_unit || "Portionen")}</span>
              <button data-action="serv" data-d="1" aria-label="Mehr"><ha-icon icon="mdi:plus"></ha-icon></button>
            </div></div>
          ${(r.ingredients || []).length ? `<ul class="ing-list">${ingHtml}</ul>
          <div class="ing-actions">
            ${this._bringReady() ? `<button class="btn bring" data-action="shop"><ha-icon icon="mdi:cart-plus"></ha-icon>Zu Bring! hinzufügen</button>`
              : `<button class="btn primary" data-action="shop"><ha-icon icon="mdi:cart-plus"></ha-icon>Auf die Einkaufsliste</button>`}
          </div>` : `<p class="muted">Noch keine Zutaten eingetragen.</p>`}
        </section>
        <section aria-label="Zubereitung">
          ${phases || `<div class="sec-head"><h2>Zubereitung</h2></div><p class="muted">Noch keine Arbeitsschritte eingetragen.</p>`}
          ${r.notes ? `<div class="notes"><h3>Tipps & Notizen</h3><p>${esc(r.notes)}</p></div>` : ""}
          <div class="meta-foot">
            ${r.source ? `<span>Quelle: ${source}</span>` : ""}
            ${cookedN ? `<span>${cookedN}× gekocht, zuletzt am ${new Date(r.cooked[cookedN - 1]).toLocaleDateString("de-DE")}</span>` : `<span>Noch nie gekocht</span>`}
            ${r.created_by ? `<span>Eingetragen von ${esc(r.created_by)}</span>` : ""}
          </div>
        </section>
      </div>
    </div>`;
  }

  _stepHtml(text) {
    return esc(text).replace(/(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?\s*(Minuten|Minute|Min\.?|Stunden|Stunde|Std\.?)/g, (m, a, b, unit) => {
      const val = parseFloat((b || a).replace(",", "."));
      const mins = /^(Std|Stunde)/.test(unit) ? val * 60 : val;
      if (!mins || mins > 24 * 60) return m;
      return `${m}<button class="timer-chip" data-action="timer" data-min="${mins}" data-label="${esc(m)}" aria-label="Timer ${esc(m)} starten"><ha-icon icon="mdi:timer-outline"></ha-icon>Timer</button>`;
    });
  }

  /* ---------------------------------------------------------- Kochmodus */
  _renderCook() {
    if (!this.cook) return "";
    const r = this._recipe(this.cook.id);
    if (!r) return "";
    const steps = allSteps(r);
    const i = this.cook.index;
    const cur = steps[i] || { phase: PHASES[1], text: "", n: 1, of: 1 };
    const factor = (this.servings || r.servings) / (r.servings || 1);
    let ing = "";
    orderWithin((r.ingredients || []).map((x, idx) => ({ x, idx, heading: !x.name && !x.amount && !!x.group })), (e) => this.checked.has(e.idx)).forEach(({ x, idx }) => {
      if (!x.name && !x.amount && x.group) { ing += `<li class="ing-group">${esc(x.group)}</li>`; return; }
      ing += `<li class="ing ${this.checked.has(idx) ? "done" : ""}" data-action="check" data-idx="${idx}"><span class="box">${this.checked.has(idx) ? `<ha-icon icon="mdi:check-bold"></ha-icon>` : ""}</span><span class="amt">${esc([scaleAmount(x.amount, factor), x.unit].filter(Boolean).join(" "))}</span><span class="nm">${esc(x.name)}</span></li>`;
    });
    const last = i >= steps.length - 1;
    return `<div class="cook" role="dialog" aria-label="Kochmodus">
      <aside><h3>Zutaten für ${this.servings || r.servings} ${esc(r.servings_unit || "Portionen")}</h3><ul class="ing-list">${ing}</ul></aside>
      <div class="stage">
        <div class="bar"><h2>${esc(r.title)}</h2><button class="icon-btn" data-action="cook-close" aria-label="Kochmodus beenden"><ha-icon icon="mdi:close"></ha-icon></button></div>
        <div class="progress">${steps.map((st, n) => `<i class="${n <= i ? "on" : ""} ${st.phase.key === "prep_steps" ? "pp" : ""}"></i>`).join("")}</div>
        <div class="now"><div class="phase-label ${cur.phase.key === "prep_steps" ? "pp" : ""}"><ha-icon icon="${cur.phase.icon}"></ha-icon>${cur.phase.name}</div>
          <div class="big-num">${cur.n}<small>von ${cur.of}</small></div><p>${this._stepHtml(cur.text)}</p></div>
        <div class="nav">
          <button class="btn" data-action="cook-prev" ${i === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-left"></ha-icon>Zurück</button>
          ${last ? `<button class="btn saffron" data-action="cook-done"><ha-icon icon="mdi:check"></ha-icon>Fertig gekocht</button>`
                 : `<button class="btn saffron" data-action="cook-next">Weiter<ha-icon icon="mdi:arrow-right"></ha-icon></button>`}
        </div>
      </div></div>`;
  }

  async _requestWake() {
    try { if ("wakeLock" in navigator) this._wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* egal */ }
  }
  _releaseWake() { try { this._wakeLock && this._wakeLock.release(); } catch (e) { /* egal */ } this._wakeLock = null; }

  /* ---------------------------------------------------------- Timer */
  _renderTimers() {
    if (!this.timers.length) return "";
    return `<div class="timers">${this.timers.map((t) => {
      const left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
      return `<div class="timer ${left === 0 ? "ring" : ""}" data-tid="${t.id}"><div><div style="font-size:12px;opacity:.8">${esc(t.label)}</div><div class="t">${this._fmtSec(left)}</div></div>
        <button data-action="timer-stop" data-tid="${t.id}" aria-label="Timer beenden"><ha-icon icon="mdi:close"></ha-icon></button></div>`;
    }).join("")}</div>`;
  }
  _fmtSec(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`; }
  _startTimer(min, label) {
    this.timers.push({ id: Date.now() + Math.random(), end: Date.now() + min * 60000, label, rung: false });
    this._ensureAudio();
    if (!this._timerTick) this._timerTick = setInterval(() => this._tick(), 1000);
    this.render();
  }
  _tick() {
    if (!this.timers.length) { clearInterval(this._timerTick); this._timerTick = null; return; }
    let rerender = false;
    for (const t of this.timers) {
      const left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
      const el = this.shadowRoot.querySelector(`.timer[data-tid="${t.id}"]`);
      if (el) { el.querySelector(".t").textContent = this._fmtSec(left); if (left === 0) el.classList.add("ring"); } else rerender = true;
      if (left === 0 && !(t.lastBeep > Date.now() - 2500)) { t.lastBeep = Date.now(); this._beep(); }
    }
    if (rerender) this.render();
  }
  _ensureAudio() { try { this._audio = this._audio || new (window.AudioContext || window.webkitAudioContext)(); this._audio.resume?.(); } catch (e) { /* egal */ } }
  _beep() {
    try {
      const ctx = this._audio; if (!ctx) return;
      [0, 0.25, 0.5].forEach((d) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.2);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.22);
      });
    } catch (e) { /* egal */ }
  }

  /* ---------------------------------------------------------- Editor */
  _renderEditor() {
    const d = this.draft;
    if (!d) return "";
    const cats = this.settings.categories || [];
    const isNew = !d.id;
    const ingRows = (d.ingredients || []).map((i, idx) => {
      const grip = `<div class="grip"><button data-action="ing-up" data-idx="${idx}" aria-label="Nach oben"><ha-icon icon="mdi:chevron-up"></ha-icon></button><button data-action="ing-down" data-idx="${idx}" aria-label="Nach unten"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>`;
      const del = `<button class="icon-btn" data-action="ing-del" data-idx="${idx}" aria-label="Zeile entfernen"><ha-icon icon="mdi:close"></ha-icon></button>`;
      if (i._head || (!i.name && !i.amount && i.group)) {
        return `<div class="irow head" data-row="${idx}">${grip}<input class="inp" data-ing="group" value="${esc(i.group)}" placeholder="Zwischenüberschrift, z. B. Für den Teig">${del}</div>`;
      }
      return `<div class="irow" data-row="${idx}">${grip}
        <input class="inp" data-ing="amount" value="${esc(i.amount)}" placeholder="Menge" inputmode="decimal" aria-label="Menge">
        <input class="inp" data-ing="unit" value="${esc(i.unit)}" placeholder="Einheit" list="kb-units" aria-label="Einheit">
        <input class="inp" data-ing="name" value="${esc(i.name)}" placeholder="Zutat" aria-label="Zutat">${del}</div>`;
    }).join("");
    const stepRows = (key) => (d[key] || []).map((s, idx) => `<div class="srow" data-srow="${key}-${idx}">
        <div class="grip"><button data-action="step-up" data-phase="${key}" data-idx="${idx}" aria-label="Nach oben"><ha-icon icon="mdi:chevron-up"></ha-icon></button><button data-action="step-down" data-phase="${key}" data-idx="${idx}" aria-label="Nach unten"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>
        <div class="num ${key === "prep_steps" ? "pp" : ""}">${idx + 1}</div>
        <textarea class="inp" data-step="${key}" placeholder="${key === "prep_steps" ? "z. B. Zwiebeln fein würfeln" : "z. B. Zwiebeln 5 Minuten glasig dünsten"}" aria-label="Schritt ${idx + 1}">${esc(s)}</textarea>
        <button class="icon-btn" data-action="step-del" data-phase="${key}" data-idx="${idx}" aria-label="Schritt entfernen"><ha-icon icon="mdi:close"></ha-icon></button></div>`).join("");
    const phasePanel = (ph, hint) => `<section class="panel">
        <h2><span class="ph-title"><ha-icon icon="${ph.icon}"></ha-icon>${ph.name}</span></h2>
        <p class="muted" style="margin:-6px 0 14px">${hint}</p>
        <div class="rows">${stepRows(ph.key)}</div>
        <div class="add-row"><button class="btn" data-action="step-add" data-phase="${ph.key}"><ha-icon icon="mdi:plus"></ha-icon>Schritt</button></div>
      </section>`;

    return `${this._top("", `<button class="icon-btn" data-action="cancel-edit" aria-label="Abbrechen"><ha-icon icon="mdi:close"></ha-icon></button><div class="brand"><h1>${isNew ? "Neues Rezept" : "Rezept bearbeiten"}</h1></div>`)}
    <div class="editor">
      <datalist id="kb-units">${UNITS.map((u) => `<option value="${esc(u)}">`).join("")}</datalist>
      <section class="panel">
        <div class="img-drop ${d.image ? "has" : ""}">
          ${d.image ? `<img src="${esc(d.image)}" alt="">` : `<div class="center"><ha-icon icon="mdi:camera-plus-outline" style="--mdc-icon-size:40px"></ha-icon><span>Ein Foto macht Appetit</span></div>`}
          <div class="img-actions">
            <label class="btn ${d.image ? "" : "primary"}" tabindex="0"><ha-icon icon="mdi:image-plus"></ha-icon>${this._uploading ? "Lädt …" : d.image ? "Foto ändern" : "Foto wählen"}<input type="file" accept="image/*" id="img-file" hidden></label>
            ${d.image ? `<button class="btn danger" data-action="img-remove"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>` : ""}
          </div>
        </div>
        <div class="fields" style="margin-top:18px">
          <div class="f"><label for="f-title">Name des Rezepts</label><input id="f-title" class="title-input" data-f="title" value="${esc(d.title)}" placeholder="z. B. Omas Apfelkuchen"></div>
          <div class="f"><label for="f-desc">Kurzbeschreibung</label><textarea id="f-desc" data-f="description" rows="2" placeholder="Worauf darf man sich freuen?">${esc(d.description)}</textarea></div>
          <div class="f s3"><label for="f-cat">Kategorie</label><select id="f-cat" data-f="category">${d.category && this._cat(d.category) ? "" : `<option value="" selected disabled>Bitte wählen</option>`}${this._topCats(cats).map((c) => {
            const subs = this._subs(c.id, cats);
            const opt = (x, label) => `<option value="${esc(x.id)}" ${d.category === x.id ? "selected" : ""}>${label}</option>`;
            return subs.length ? `<optgroup label="${esc(c.name)}">${opt(c, `${esc(c.name)} (allgemein)`)}${subs.map((x) => opt(x, esc(x.name))).join("")}</optgroup>` : opt(c, esc(c.name));
          }).join("")}</select></div>
          <div class="f s3"><label>Schwierigkeit</label><div class="diff">${[1, 2, 3].map((n) => `<button data-action="diff" data-n="${n}" class="${d.difficulty === n ? "on" : ""}">${DIFFICULTY[n]}</button>`).join("")}</div></div>
          <div class="f s2"><label for="f-prep">Vorbereitung (Min)</label><input id="f-prep" type="number" min="0" data-f="prep_time" value="${d.prep_time || ""}" placeholder="0"></div>
          <div class="f s2"><label for="f-cook">Koch-/Backzeit (Min)</label><input id="f-cook" type="number" min="0" data-f="cook_time" value="${d.cook_time || ""}" placeholder="0"></div>
          <div class="f s2"><label for="f-rest">Ruhezeit (Min)</label><input id="f-rest" type="number" min="0" data-f="rest_time" value="${d.rest_time || ""}" placeholder="0"></div>
          <div class="f s3"><label for="f-serv">Menge</label><input id="f-serv" type="number" min="1" data-f="servings" value="${d.servings || 4}"></div>
          <div class="f s3"><label for="f-unit">Einheit der Menge</label><input id="f-unit" data-f="servings_unit" value="${esc(d.servings_unit || "Portionen")}" list="kb-serv-units"><datalist id="kb-serv-units"><option value="Portionen"><option value="Personen"><option value="Stück"><option value="Gläser"><option value="Bleche"></datalist></div>
          <div class="f"><label>Schlagworte</label><div class="chip-input">${(d.tags || []).map((t, i) => `<span class="tag">${esc(t)}<button data-action="tag-del" data-idx="${i}" aria-label="${esc(t)} entfernen"><ha-icon icon="mdi:close"></ha-icon></button></span>`).join("")}<input id="tag-input" placeholder="z. B. vegetarisch, mit Enter hinzufügen" aria-label="Schlagwort hinzufügen"></div></div>
        </div>
      </section>
      <section class="panel">
        <h2>Zutaten <button class="btn" data-action="paste"><ha-icon icon="mdi:clipboard-text-outline"></ha-icon><span class="lbl">Liste einfügen</span></button></h2>
        <div class="rows">${ingRows}</div>
        <div class="add-row">
          <button class="btn" data-action="ing-add"><ha-icon icon="mdi:plus"></ha-icon>Zutat</button>
          <button class="btn" data-action="ing-head"><ha-icon icon="mdi:format-header-pound"></ha-icon>Zwischenüberschrift</button>
        </div>
      </section>
      ${phasePanel(PHASES[0], "Alles, was vor dem Kochen erledigt wird: schneiden, abwiegen, marinieren …")}
      ${phasePanel(PHASES[1], "Das eigentliche Kochen, Braten oder Backen. Zeitangaben wie „20 Minuten“ werden automatisch zum Timer.")}
      <section class="panel">
        <h2>Zusätzliches</h2>
        <div class="fields">
          <div class="f"><label for="f-notes">Tipps & Notizen</label><textarea id="f-notes" data-f="notes" rows="3" placeholder="Variationen, Beilagen, was beim letzten Mal besser ging …">${esc(d.notes)}</textarea></div>
          <div class="f s3"><label for="f-src">Quelle oder Link</label><input id="f-src" data-f="source" value="${esc(d.source)}" placeholder="https://…"></div>
          <div class="f s3"><label for="f-auth">Rezept von</label><input id="f-auth" data-f="author" value="${esc(d.author)}" placeholder="z. B. Oma Hilde"></div>
        </div>
      </section>
    </div>
    <div class="savebar">
      <button class="btn" data-action="cancel-edit">Abbrechen</button>
      <button class="btn primary" data-action="save" ${this._saving ? "disabled" : ""}><ha-icon icon="mdi:content-save-outline"></ha-icon><span class="lbl">${isNew ? "Rezept speichern" : "Änderungen speichern"}</span><span class="lbl-m">Speichern</span></button>
    </div>`;
  }

  _readDraft() {
    const d = this.draft;
    if (!d || this.view.name !== "edit") return;
    const root = this.shadowRoot;
    root.querySelectorAll("[data-f]").forEach((el) => {
      const k = el.dataset.f;
      d[k] = el.type === "number" ? (el.value === "" ? 0 : Number(el.value)) : el.value;
    });
    const ings = [];
    root.querySelectorAll("[data-row]").forEach((row) => {
      const get = (k) => (row.querySelector(`[data-ing="${k}"]`) || {}).value || "";
      if (row.classList.contains("head")) ings.push({ amount: "", unit: "", name: "", group: get("group"), _head: true });
      else ings.push({ amount: get("amount"), unit: get("unit"), name: get("name"), group: "" });
    });
    if (root.querySelector("[data-row]") || !d.ingredients.length) d.ingredients = ings;
    for (const ph of PHASES) {
      const list = [];
      root.querySelectorAll(`[data-step="${ph.key}"]`).forEach((el) => list.push(el.value));
      d[ph.key] = list;
    }
  }

  _move(arr, idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
  }

  async _save() {
    this._readDraft();
    const d = this.draft;
    if (!d.title.trim()) { this._showToast("Bitte gebt dem Rezept einen Namen.", true); this._focusSel = "#f-title"; this.render(); return; }
    if ((this.settings.categories || []).length && !this._cat(d.category)) { this._showToast("Bitte wählt eine Kategorie.", true); this._focusSel = "#f-cat"; this.render(); return; }
    const recipe = { ...d };
    delete recipe._key;
    recipe.ingredients = d.ingredients
      .filter((i) => (i._head ? i.group.trim() : i.name.trim() || i.amount.trim()))
      .map((i) => (i._head ? { amount: "", unit: "", name: "", group: i.group.trim() } : { amount: i.amount.trim(), unit: i.unit.trim(), name: i.name.trim(), group: "" }));
    for (const ph of PHASES) recipe[ph.key] = (d[ph.key] || []).map((s) => s.trim()).filter(Boolean);
    this._saving = true; this.render();
    try {
      const saved = await this._hass.callWS({ type: "kochbuch/save", recipe });
      const idx = this.recipes.findIndex((r) => r.id === saved.id);
      if (idx >= 0) this.recipes[idx] = saved; else this.recipes.push(saved);
      this._saving = false;
      this.draft = null;
      this._showToast("Rezept gespeichert");
      this._go(`rezept/${saved.id}`, true);
    } catch (err) {
      this._saving = false;
      this._showToast(`Speichern fehlgeschlagen: ${err.message || err}`, true);
      this.render();
    }
  }

  async _uploadImage(file) {
    this._readDraft();
    this._uploading = true; this.render();
    try {
      const data = await resizeImage(file);
      const res = await this._hass.callWS({ type: "kochbuch/upload_image", data, mime: "image/jpeg" });
      this.draft.image = res.url;
    } catch (err) {
      this._showToast(`Foto konnte nicht hochgeladen werden: ${err.message || err}`, true);
    }
    this._uploading = false;
    this.render();
  }

  /* ---------------------------------------------------------- Einstellungen */
  _todoEntities() {
    return Object.keys(this._hass.states).filter((e) => e.startsWith("todo.")).sort();
  }

  _renderSettings() {
    const s = this.settingsDraft || this.settings;
    const todos = this._todoEntities();
    const name = (e) => this._hass.states[e]?.attributes?.friendly_name || e;
    const total = (s.categories || []).length;
    const moved = (cat) => { let c = cat; for (let i = 0; i < 10 && s.moves && c in s.moves; i++) c = s.moves[c]; return c; };
    const used = (id) => this.recipes.filter((r) => moved(r.category) === id).length;
    const all = s.categories || [];
    const tops = this._topCats(all);
    const sib = (c) => all.map((x, j) => ({ x, j })).filter(({ x }) => (tops.includes(c) ? tops.includes(x) : x.parent === c.parent));
    const row = (c, i, isSub) => {
      const sibs = sib(c);
      const pos = sibs.findIndex((o) => o.j === i);
      const kids = this._subs(c.id, all).length;
      const parentSel = kids ? `<span class="muted small-note">Hauptkategorie mit ${kids} ${kids === 1 ? "Unterkategorie" : "Unterkategorien"}</span>`
        : `<select class="inp" data-c="parent" aria-label="Einordnung"><option value="">Hauptkategorie</option>${tops.filter((t) => t.id !== c.id).map((t) => `<option value="${esc(t.id)}" ${c.parent === t.id ? "selected" : ""}>Unterkategorie von ${esc(t.name || "…")}</option>`).join("")}</select>`;
      return `<div class="cat-row ${isSub ? "sub" : ""} ${this._flashCat === i ? "flash" : ""}" data-cat="${i}">
        <input type="color" data-c="color" value="${esc(c.color)}" aria-label="Farbe von ${esc(c.name)}">
        <span class="prev" style="background:${esc(c.color)}"><ha-icon icon="${esc(c.icon)}"></ha-icon></span>
        <span class="name-cell"><input class="inp" data-c="name" value="${esc(c.name)}" aria-label="Name der Kategorie" placeholder="${isSub ? "Name der Unterkategorie" : "Name"}"><small>${used(c.id) === 1 ? "1 Rezept" : `${used(c.id)} Rezepte`}</small></span>
        <span class="order">
          <button class="icon-btn" data-action="cat-up" data-idx="${i}" aria-label="Nach oben" ${pos <= 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="icon-btn" data-action="cat-down" data-idx="${i}" aria-label="Nach unten" ${pos >= sibs.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <button class="icon-btn del" data-action="cat-del" data-idx="${i}" aria-label="${esc(c.name)} löschen"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
        </span>
        <select class="inp icon-sel" data-c="icon" aria-label="Symbol">${[...new Set([c.icon, ...ICONS])].map((ic) => `<option value="${esc(ic)}" ${ic === c.icon ? "selected" : ""}>Symbol: ${esc(ic.replace("mdi:", ""))}</option>`).join("")}</select>
        <span class="parent-cell">${parentSel}</span>
      </div>`;
    };
    const cats = tops.map((c) => {
      const i = all.indexOf(c);
      const subs = this._subs(c.id, all);
      return `<div class="cat-group">${row(c, i, false)}${subs.map((x) => row(x, all.indexOf(x), true)).join("")}
        <button class="add-sub" data-action="cat-add-sub" data-id="${esc(c.id)}"><ha-icon icon="mdi:subdirectory-arrow-right"></ha-icon>Unterkategorie zu ${esc(c.name || "dieser Kategorie")}</button></div>`;
    }).join("");
    this._flashCat = null;
    return `${this._top("", `${this._crumbs(`<span class="sep"><ha-icon icon="mdi:chevron-right"></ha-icon></span><span class="here">Einstellungen</span>`)}`)}
    <div class="editor">
      ${this._fold("kategorien", "mdi:shape-outline", "Kategorien", `${tops.length} ${tops.length === 1 ? "Kategorie" : "Kategorien"}${all.length > tops.length ? `, ${all.length - tops.length} ${all.length - tops.length === 1 ? "Unterkategorie" : "Unterkategorien"}` : ""}`, `
        <p class="muted" style="margin:-6px 0 14px">So erscheinen die Kategorien auf der Startseite. Unterkategorien zeigt das Kochbuch innerhalb ihrer Hauptkategorie. Mit den Pfeilen ändert ihr die Reihenfolge.</p>
        <div class="rows">${cats || `<p class="muted">Noch keine Kategorien.</p>`}</div>
        <div class="add-row"><button class="btn" data-action="cat-add"><ha-icon icon="mdi:plus"></ha-icon>Hauptkategorie hinzufügen</button></div>
      `)}
      ${this._fold("einkaufen", "mdi:cart-outline", "Einkaufen & Bring!", this._bringReady() ? `Bring!: ${esc((s.bring || {}).list_name || "verbunden")}` : (s.shopping_list ? esc(name(s.shopping_list)) : "Nicht eingerichtet"), `
        ${this._renderBring()}
        <div class="fields" style="margin-top:18px">
          <div class="f s3"><label for="s-list">Einkaufsliste in Home Assistant${this._bringReady() ? " (zusätzlich)" : ""}</label>
            <select id="s-list" data-s="shopping_list"><option value="">Keine</option>${todos.map((e) => `<option value="${esc(e)}" ${s.shopping_list === e ? "selected" : ""}>${esc(name(e))}</option>`).join("")}</select></div>
          <div class="f s3"><label for="s-serv">Standard-Portionen für neue Rezepte</label><input id="s-serv" type="number" min="1" data-s="default_servings" value="${s.default_servings || 4}"></div>
        </div>`)}
      ${this._fold("austausch", "mdi:swap-horizontal", "Rezepte austauschen", "Exportieren und importieren", `
        <p class="muted" style="margin:-6px 0 14px">Gebt Rezepte als Datei weiter, z. B. an Freunde mit eigenem Kochbuch, oder übernehmt Rezepte aus so einer Datei. Fotos sind enthalten. Einzelne Rezepte oder ganze Kategorien exportiert ihr direkt dort über <ha-icon icon="mdi:export-variant" style="--mdc-icon-size:16px;vertical-align:-3px"></ha-icon>.</p>
        <div class="settings-actions">
          <button class="btn" data-action="export-all"><ha-icon icon="mdi:export-variant"></ha-icon>Alle Rezepte exportieren</button>
          <label class="btn" tabindex="0"><ha-icon icon="mdi:tray-arrow-down"></ha-icon>Rezepte importieren<input type="file" accept=".json,application/json" id="recipes-file" hidden></label>
        </div>
      `)}
      ${this._hass.user?.is_admin ? this._renderBackupPanels() : this._fold("sicherung", "mdi:folder-zip-outline", "Sicherung", "Nur für Administratoren", `<p class="muted" style="margin:0">Sicherungen und das automatische Backup können nur Administratoren verwalten.</p>`)}
      <p class="muted" style="text-align:center">Kochbuch ${KB_VERSION}</p>
    </div>
    <div class="savebar"><button class="btn" data-action="back">Abbrechen</button><button class="btn primary" data-action="settings-save"><ha-icon icon="mdi:content-save-outline"></ha-icon><span class="lbl">Einstellungen speichern</span><span class="lbl-m">Speichern</span></button></div>`;
  }

  _fold(id, icon, title, summary, body) {
    const open = this.folds.has(id);
    return `<section class="panel fold ${open ? "open" : ""}">
      <button class="fold-head" data-action="fold" data-id="${id}" aria-expanded="${open}">
        <span class="fold-icon"><ha-icon icon="${icon}"></ha-icon></span>
        <span class="fold-text"><b>${title}</b><small>${summary}</small></span>
        <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
      </button>
      ${open ? `<div class="fold-body">${body}</div>` : ""}
    </section>`;
  }

  _renderBring() {
    const b = (this.settingsDraft || this.settings).bring || {};
    if (b.email) {
      if (!this.bringLists && !this._bringLoading) {
        this._bringLoading = true;
        this._hass.callWS({ type: "kochbuch/bring_lists" })
          .then((res) => { this.bringLists = res.lists; })
          .catch((err) => { this.bringLists = []; this._bringError = err.message || String(err); })
          .finally(() => { this._bringLoading = false; if (this.view.name === "settings") { this._readSettings(); this.render(); } });
      }
      const lists = this.bringLists || (b.list_uuid ? [{ uuid: b.list_uuid, name: b.list_name }] : []);
      return `<div class="bring-box on">
        <div class="bring-badge">Bring!</div>
        <div class="bring-info"><b>Verbunden${b.name ? ` als ${esc(b.name)}` : ""}</b><small>${esc(b.email)}</small></div>
        <button class="btn small" data-action="bring-logout"><ha-icon icon="mdi:logout"></ha-icon>Abmelden</button>
      </div>
      ${this._bringError ? `<p class="hint" style="color:var(--kb-tomato)">${esc(this._bringError)}</p>` : ""}
      <div class="fields" style="margin-top:14px"><div class="f s3"><label for="bring-list">Zutaten landen auf der Bring!-Liste</label>
        <select id="bring-list">${lists.map((l) => `<option value="${esc(l.uuid)}" ${l.uuid === b.list_uuid ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></div></div>`;
    }
    return `<div class="bring-box">
        <div class="bring-badge">Bring!</div>
        <div class="bring-info"><b>Mit Bring! verbinden</b><small>Meldet euch mit eurem Bring!-Konto an. Danach landen Zutaten per Knopfdruck auf eurer gemeinsamen Einkaufsliste.</small></div>
      </div>
      <div class="fields" style="margin-top:14px">
        <div class="f s3 full-m"><label for="bring-email">E-Mail-Adresse</label><input id="bring-email" type="email" autocomplete="off" placeholder="name@beispiel.de"></div>
        <div class="f s3 full-m"><label for="bring-pass">Passwort</label><input id="bring-pass" type="password" autocomplete="new-password"></div>
      </div>
      <div class="settings-actions" style="margin-top:14px"><button class="btn bring" data-action="bring-login" ${this._bringBusy ? "disabled" : ""}>${this._bringBusy ? `<span class="spin" style="width:18px;height:18px"></span>Verbinde …` : `<ha-icon icon="mdi:login"></ha-icon>Bei Bring! anmelden`}</button></div>
      <p class="hint">Das Passwort wird nicht gespeichert, nur die Anmeldung. Ihr habt Bring! mit Google oder Apple eingerichtet? Dann legt in der Bring!-App unter Profil zuerst ein Passwort fest.</p>`;
  }

  _renderBackupPanels() {
    const cfg = this.backupCfg || { enabled: false, host: "", port: 21, user: "", path: "/", tls: false, verify: false, freq: "daily", time: "03:00", keep: 14, last: null, has_password: false };
    const b = { ...cfg, ...(this.backupDraft || {}) };
    const busy = this._bbusy;
    const last = cfg.last;
    let status = last
      ? (last.ok ? `<span class="bk-ok"><ha-icon icon="mdi:check-circle"></ha-icon>Letztes Backup am ${new Date(last.ts).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })} Uhr: ${esc(last.msg)}</span>`
                 : `<span class="bk-err"><ha-icon icon="mdi:alert-circle"></ha-icon>Letztes Backup am ${new Date(last.ts).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })} Uhr fehlgeschlagen: ${esc(last.msg)}</span>`)
      : `<span>Noch kein automatisches Backup durchgeführt.</span>`;
    if (cfg.enabled && cfg.host) status += `<span>Nächstes Backup: ${cfg.freq === "weekly" ? "montags" : "täglich"} um ${esc(cfg.time)} Uhr</span>`;
    const o = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${label}</option>`;
    const autoSum = cfg.enabled && cfg.host ? `Aktiv, ${cfg.freq === "weekly" ? "montags" : "täglich"} um ${esc(cfg.time)} Uhr${last && !last.ok ? " – letztes Backup fehlgeschlagen" : ""}` : "Aus";
    return `${this._fold("sicherung", "mdi:backup-restore", "Sicherung & automatisches Backup", `Automatisches Backup: ${autoSum}`, `
        <h3 class="fold-sub">Sicherung von Hand</h3>
        <p class="muted" style="margin:-6px 0 14px">Eine komplette Sicherung als ZIP-Datei: alle Rezepte, Fotos, Kategorien und Einstellungen. Damit stellt ihr das Kochbuch z. B. nach einer Neuinstallation wieder her.</p>
        <div class="settings-actions">
          <button class="btn" data-action="backup-download" ${busy ? "disabled" : ""}><ha-icon icon="mdi:folder-zip-outline"></ha-icon>${busy === "download" ? "Wird erstellt …" : "Sicherung herunterladen"}</button>
          <label class="btn" tabindex="0"><ha-icon icon="mdi:backup-restore"></ha-icon>Sicherung einspielen<input type="file" accept=".zip,.json,application/zip,application/json" id="backup-file" hidden></label>
        </div>
        <h3 class="fold-sub divided"><ha-icon icon="mdi:nas"></ha-icon>Automatisches Backup aufs Netzwerklaufwerk</h3>
        <p class="muted" style="margin:-6px 0 14px">Legt regelmäßig eine Sicherung per FTP auf eurem NAS ab (z. B. Synology, QNAP, Fritz!NAS). Ältere Sicherungen werden automatisch gelöscht.</p>
        <label class="switch"><input type="checkbox" id="b-enabled" ${b.enabled ? "checked" : ""}><span class="track"></span>Automatisches Backup aktiv</label>
        <div class="fields" style="margin-top:16px">
          <div class="f s3 full-m"><label for="b-host">Server (Name oder IP)</label><input id="b-host" value="${esc(b.host)}" placeholder="z. B. 192.168.178.20" autocomplete="off"></div>
          <div class="f s3"><label for="b-port">Port</label><input id="b-port" type="number" min="1" max="65535" value="${esc(b.port)}"></div>
          <div class="f s3 full-m"><label for="b-user">Benutzer</label><input id="b-user" value="${esc(b.user)}" autocomplete="off"></div>
          <div class="f s3 full-m"><label for="b-pass">Passwort</label><input id="b-pass" type="password" value="${esc(b.password || "")}" placeholder="${cfg.has_password ? "gespeichert – leer lassen, um es zu behalten" : ""}" autocomplete="new-password"></div>
          <div class="f s3 full-m"><label for="b-path">Zielordner auf dem Server</label><input id="b-path" value="${esc(b.path)}" placeholder="/Backups/Kochbuch" autocomplete="off"></div>
          <div class="f s3 full-m"><label for="b-tls">Verbindung</label><select id="b-tls">${o(0, b.tls ? 1 : 0, "FTP (unverschlüsselt)")}${o(1, b.tls ? 1 : 0, "FTPS (verschlüsselt)")}</select></div>
          ${b.tls ? `<div class="f"><label class="check"><input type="checkbox" id="b-verify" ${b.verify ? "checked" : ""}>Zertifikat prüfen (bei selbst signierten NAS-Zertifikaten aus lassen)</label></div>` : ""}
          <div class="f s2"><label for="b-freq">Häufigkeit</label><select id="b-freq">${o("daily", b.freq, "Täglich")}${o("weekly", b.freq, "Wöchentlich (montags)")}</select></div>
          <div class="f s2"><label for="b-time">Uhrzeit</label><input id="b-time" type="time" value="${esc(b.time)}"></div>
          <div class="f s2"><label for="b-keep">Sicherungen aufbewahren</label><input id="b-keep" type="number" min="1" max="365" value="${esc(b.keep)}"></div>
        </div>
        <div class="settings-actions" style="margin-top:18px">
          <button class="btn" data-action="bk-test" ${busy ? "disabled" : ""}><ha-icon icon="mdi:lan-connect"></ha-icon>${busy === "test" ? "Teste …" : "Verbindung testen"}</button>
          <button class="btn" data-action="bk-run" ${busy ? "disabled" : ""}><ha-icon icon="mdi:cloud-upload-outline"></ha-icon>${busy === "run" ? "Sichert …" : "Jetzt sichern"}</button>
        </div>
        <div class="bk-status">${status}</div>
        <p class="hint">Änderungen hier werden mit „Einstellungen speichern“ übernommen. Das Passwort bleibt in Home Assistant und landet nie in einer Sicherung. Reines FTP überträgt es unverschlüsselt im Heimnetz – nutzt FTPS, wenn euer NAS es kann.</p>
      `)}`;
  }

  _readBackup() {
    const r = this.shadowRoot;
    if (!r.querySelector("#b-host")) return;
    const v = (id) => r.querySelector(id)?.value ?? "";
    this.backupDraft = {
      enabled: !!r.querySelector("#b-enabled")?.checked,
      host: v("#b-host").trim(), port: parseInt(v("#b-port"), 10) || 21, user: v("#b-user").trim(),
      password: v("#b-pass"), path: v("#b-path") || "/", tls: v("#b-tls") === "1",
      verify: r.querySelector("#b-verify") ? r.querySelector("#b-verify").checked : !!(this.backupDraft || this.backupCfg || {}).verify,
      freq: v("#b-freq") || "daily", time: v("#b-time") || "03:00", keep: parseInt(v("#b-keep"), 10) || 14,
    };
  }

  async _backupAction(kind) {
    this._readSettings();
    this._readBackup();
    const cfg = { ...this.backupDraft };
    if (!cfg.password) delete cfg.password;
    this._bbusy = kind; this.render();
    try {
      let res;
      if (kind === "save") res = await this._hass.callWS({ type: "kochbuch/backup_save", config: cfg });
      else if (kind === "test") res = await this._hass.callWS({ type: "kochbuch/backup_test", config: cfg });
      else {
        const saved = await this._hass.callWS({ type: "kochbuch/backup_save", config: cfg });
        this.backupCfg = saved.backup; this.backupDraft = null;
        res = await this._hass.callWS({ type: "kochbuch/backup_run" });
      }
      if (res.backup) this.backupCfg = res.backup;
      if (kind !== "test") this.backupDraft = null;
      this._bbusy = null; this.render();
      this._showToast(res.message || "Fertig");
    } catch (err) {
      this._bbusy = null;
      if (kind === "run") { try { const d = await this._hass.callWS({ type: "kochbuch/data" }); if (d.backup) this.backupCfg = d.backup; } catch (e) { /* egal */ } }
      this.render();
      this._showToast(err.message || String(err), true);
    }
  }

  async _downloadFile(url, fallback) {
    const res = await this._hass.fetchWithAuth(url);
    if (!res.ok) {
      let msg = `Fehler ${res.status}`;
      try { msg = (await res.json()).message || msg; } catch (e) { /* egal */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    let name = fallback;
    const cd = res.headers.get("Content-Disposition") || "";
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    if (m) name = decodeURIComponent(m[1]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return name;
  }

  async _uploadFile(url, file) {
    const res = await this._hass.fetchWithAuth(url, { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    let data = {};
    try { data = await res.json(); } catch (e) { /* egal */ }
    if (!res.ok) throw new Error(data.message || `Fehler ${res.status}`);
    return data;
  }

  async _exportRecipes(query, label) {
    try {
      const name = await this._downloadFile(`/api/kochbuch/rezepte${query}`, "Rezepte.kochbuch.json");
      this._showToast(`${label} exportiert: ${name}`);
    } catch (err) { this._showToast(`Export fehlgeschlagen: ${err.message || err}`, true); }
  }

  async _importRecipeFile(file) {
    if (this.dialog?.type === "import") { this.dialog = { ...this.dialog, busy: true, error: null }; this.render(); }
    try {
      const res = await this._uploadFile("/api/kochbuch/rezepte", file);
      this._setData(await this._hass.callWS({ type: "kochbuch/data" }));
      if (this.view.name === "settings") this.settingsDraft = JSON.parse(JSON.stringify(this.settings));
      this.dialog = null;
      this.render();
      const parts = [`${res.imported} ${res.imported === 1 ? "Rezept" : "Rezepte"} importiert`];
      if (res.skipped) parts.push(`${res.skipped} schon vorhanden`);
      if (res.categories) parts.push(`${res.categories} neue ${res.categories === 1 ? "Kategorie" : "Kategorien"}`);
      this._showToast(parts.join(", "));
    } catch (err) {
      if (this.dialog?.type === "import") { this.dialog = { ...this.dialog, busy: false, error: err.message || String(err) }; this.render(); }
      else this._showToast(err.message || String(err), true);
    }
  }

  _readSettings() {
    const s = this.settingsDraft;
    if (!s) return;
    const root = this.shadowRoot;
    root.querySelectorAll("[data-s]").forEach((el) => { s[el.dataset.s] = el.type === "number" ? Number(el.value) || 4 : el.value; });
    root.querySelectorAll("[data-cat]").forEach((row) => {
      const c = s.categories[Number(row.dataset.cat)];
      row.querySelectorAll("[data-c]").forEach((el) => { c[el.dataset.c] = el.value; });
    });
    this._readBackup();
  }

  /* ---------------------------------------------------------- Dialoge */
  _renderDialog() {
    const d = this.dialog;
    if (!d) return "";
    let inner = "";
    if (d.type === "delete") {
      const r = this._recipe(d.id);
      inner = `<h2>Rezept löschen?</h2><p>„${esc(r?.title)}“ wird mit Foto endgültig aus dem Kochbuch entfernt.</p>
        <div class="row"><button class="btn" data-action="dlg-close">Behalten</button><button class="btn primary" style="background:var(--kb-tomato);border-color:var(--kb-tomato);color:#fff" data-action="delete-confirm">Löschen</button></div>`;
    } else if (d.type === "cat-del") {
      const all = this.settingsDraft.categories;
      const goneId = all[d.idx].id;
      const others = all.filter((x, i) => i !== d.idx && x.parent !== goneId && x.name.trim());
      inner = `<h2>„${esc(d.name)}“ löschen?</h2>
        ${d.kids ? `<p>${d.kids === 1 ? "Die Unterkategorie wird" : `Die ${d.kids} Unterkategorien werden`} danach zu ${d.kids === 1 ? "einer Hauptkategorie" : "Hauptkategorien"}.</p>` : ""}
        ${d.n ? `<p>${d.n === 1 ? "Ein Rezept gehört" : `${d.n} Rezepte gehören`} direkt zu dieser Kategorie. Wohin sollen ${d.n === 1 ? "es" : "sie"} verschoben werden?</p>
        <select class="inp" id="move-target">${others.map((c) => `<option value="${esc(c.id)}">${esc(((p) => (p ? `${p.name} › ` : ""))(all.find((x) => x.id === c.parent)) + c.name)}</option>`).join("")}<option value="">Ohne Kategorie lassen</option></select>` : ""}
        <p class="hint">Gelöscht wird erst beim Speichern der Einstellungen.</p>
        <div class="row"><button class="btn" data-action="dlg-close">Behalten</button><button class="btn primary" style="background:var(--kb-tomato);border-color:var(--kb-tomato);color:#fff" data-action="cat-del-confirm">Kategorie löschen</button></div>`;
    } else if (d.type === "import") {
      const mode = d.mode || "url";
      inner = `<h2>Rezepte importieren</h2>
        <div class="seg" role="tablist">
          <button role="tab" class="${mode === "url" ? "on" : ""}" data-action="import-mode" data-mode="url" aria-selected="${mode === "url"}"><ha-icon icon="mdi:link-variant"></ha-icon>Aus dem Internet</button>
          <button role="tab" class="${mode === "file" ? "on" : ""}" data-action="import-mode" data-mode="file" aria-selected="${mode === "file"}"><ha-icon icon="mdi:file-upload-outline"></ha-icon>Aus einer Datei</button>
        </div>
        ${mode === "url" ? `<p>Fügt die Adresse eines Rezepts ein, z. B. von Chefkoch, Lecker oder einem Foodblog. Ihr könnt alles vor dem Speichern noch anpassen.</p>
        <input class="inp" id="import-url" type="url" placeholder="https://www.chefkoch.de/rezepte/…" value="${esc(d.url || "")}" ${d.busy ? "disabled" : ""}>`
        : `<p>Wählt eine Rezept-Datei (<code>.kochbuch.json</code>), die mit „Exportieren“ erstellt wurde. Die Rezepte kommen samt Fotos dazu; fehlende Kategorien werden angelegt.</p>
        <label class="drop ${d.busy ? "busy" : ""}">${d.busy ? `<span class="spin"></span><span>Wird importiert …</span>` : `<ha-icon icon="mdi:tray-arrow-down"></ha-icon><span>Datei auswählen</span>`}<input type="file" accept=".json,application/json" id="import-file" hidden ${d.busy ? "disabled" : ""}></label>`}
        ${d.error ? `<p style="color:var(--kb-tomato);margin:10px 0 0">${esc(d.error)}</p>` : ""}
        <div class="row"><button class="btn" data-action="dlg-close">Abbrechen</button>${mode === "url" ? `<button class="btn primary" data-action="import-go" ${d.busy ? "disabled" : ""}>${d.busy ? `<span class="spin" style="width:18px;height:18px"></span>Wird geladen` : `<ha-icon icon="mdi:download"></ha-icon>Rezept holen`}</button>` : ""}</div>`;
    } else if (d.type === "paste") {
      inner = `<h2>Zutatenliste einfügen</h2><p>Eine Zutat pro Zeile. Zeilen mit Doppelpunkt am Ende werden zu Zwischenüberschriften.</p>
        <textarea class="inp" id="paste-text" placeholder="Für den Teig:\n250 g Mehl\n2 Eier\n1 Prise Salz"></textarea>
        <div class="row"><button class="btn" data-action="dlg-close">Abbrechen</button><button class="btn primary" data-action="paste-go"><ha-icon icon="mdi:check"></ha-icon>Übernehmen</button></div>`;
    } else if (d.type === "shop") {
      const r = this._recipe(d.recipeId);
      const word = this._servWord(r, d.servings);
      if (d.step === "servings") {
        const quick = [...new Set([1, 2, 3, 4, 6, 8, r.servings])].sort((a, b) => a - b);
        inner = `<h2>Für wie viele ${/^Person/.test(word) ? "Personen" : esc(word)} kocht ihr?</h2>
          <p>Die Mengen werden danach passend umgerechnet. Das Rezept ist für ${r.servings} ${esc(this._servWord(r, r.servings))} geschrieben.</p>
          <div class="serv-pick">
            <div class="serv-big">
              <button data-action="shop-serv" data-d="-1" aria-label="Weniger" ${d.servings <= 1 ? "disabled" : ""}><ha-icon icon="mdi:minus"></ha-icon></button>
              <div class="serv-num" aria-live="polite"><b>${d.servings}</b><small>${esc(word)}</small></div>
              <button data-action="shop-serv" data-d="1" aria-label="Mehr"><ha-icon icon="mdi:plus"></ha-icon></button>
            </div>
            <div class="serv-quick">${quick.map((n) => `<button class="${n === d.servings ? "on" : ""}" data-action="shop-serv-set" data-n="${n}">${n}</button>`).join("")}</div>
          </div>
          <div class="row"><button class="btn" data-action="dlg-close">Abbrechen</button><button class="btn primary" data-action="shop-next"><ha-icon icon="mdi:arrow-right"></ha-icon>Weiter zu den Zutaten</button></div>`;
      } else {
        const items = this._shopItems(d);
        const both = this._bringReady() && this._todoTarget();
        const n = items.filter((i) => i.name && i.on).length;
        const total = items.filter((i) => i.name).length;
        const label = d.target === "bring" ? "zu Bring! hinzufügen" : "auf die Einkaufsliste";
        inner = `<h2>Was fehlt noch?</h2>
          <p>Mengen <button class="linkish shop-for" data-action="shop-back"><ha-icon icon="mdi:account-group-outline" style="--mdc-icon-size:18px"></ha-icon>für ${d.servings} ${esc(word)} (ändern)</button>. Wählt ab, was ihr daheim habt. Der Rest kommt ${d.target === "bring" ? `auf eure Bring!-Liste${this.settings.bring?.list_name ? ` „${esc(this.settings.bring.list_name)}“` : ""}` : "auf die Einkaufsliste"}.</p>
          ${both ? `<div class="seg"><button class="${d.target === "bring" ? "on" : ""}" data-action="shop-target" data-t="bring">Bring!</button><button class="${d.target === "todo" ? "on" : ""}" data-action="shop-target" data-t="todo">Home Assistant</button></div>` : ""}
          <div class="shop-head"><span>${n} von ${total} ausgewählt</span><span><button class="linkish" data-action="shop-all" data-on="1">Alle</button><button class="linkish" data-action="shop-all" data-on="0">Keine</button></span></div>
          <ul class="shop-list">${orderWithin(items.map((it) => ({ ...it, heading: !!it.group })), (e) => !e.on).map((it) => it.group ? `<li class="shop-group">${esc(it.group)}</li>`
            : `<li class="shop-item ${it.on ? "on" : ""}" data-action="shop-toggle" data-i="${it.idx}" role="checkbox" aria-checked="${it.on}" tabindex="0"><span class="box">${it.on ? `<ha-icon icon="mdi:check-bold"></ha-icon>` : ""}</span><span class="nm">${esc(it.name)}</span><span class="sp">${esc(it.spec)}</span></li>`).join("")}</ul>
          ${d.error ? `<p style="color:var(--kb-tomato);margin:10px 0 0">${esc(d.error)}</p>` : ""}
          <div class="row"><button class="btn" data-action="shop-back"><ha-icon icon="mdi:arrow-left"></ha-icon>Zurück</button><button class="btn ${d.target === "bring" ? "bring" : "primary"}" data-action="shop-go" ${n && !d.busy ? "" : "disabled"}>${d.busy ? `<span class="spin" style="width:18px;height:18px"></span>Wird gesendet` : `<ha-icon icon="mdi:cart-plus"></ha-icon>${n} ${n === 1 ? "Zutat" : "Zutaten"} ${label}`}</button></div>`;
      }
    } else if (d.type === "restore") {
      inner = `<h2>Sicherung einspielen</h2><p>„${esc(d.file.name)}“ (${(d.file.size / 1048576).toFixed(1).replace(".", ",")} MB). Sollen die Rezepte zu den vorhandenen dazukommen oder das Kochbuch komplett ersetzen? Beim Ersetzen gehen alle Rezepte verloren, die nicht in der Sicherung sind.</p>
        ${d.busy ? `<p style="display:flex;align-items:center;gap:10px"><span class="spin"></span>Wird eingespielt …</p>` : ""}
        <div class="row"><button class="btn" data-action="dlg-close" ${d.busy ? "disabled" : ""}>Abbrechen</button><button class="btn danger" data-action="restore-go" data-replace="1" ${d.busy ? "disabled" : ""}>Alles ersetzen</button><button class="btn primary" data-action="restore-go" data-replace="0" ${d.busy ? "disabled" : ""}>Dazunehmen</button></div>`;
    }
    return `<div class="scrim" data-action="scrim"><div class="dialog" role="dialog" aria-modal="true">${inner}</div></div>`;
  }

  _showToast(text, err = false) {
    this._toast = { text, err };
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this._toast = null; const t = this.shadowRoot.querySelector(".toast"); if (t) t.remove(); }, err ? 5000 : 2600);
    const t = this.shadowRoot.querySelector(".toast");
    if (t) { t.textContent = text; t.classList.toggle("err", err); } else if (this.shadowRoot.innerHTML) {
      const el = document.createElement("div"); el.className = `toast ${err ? "err" : ""}`; el.setAttribute("role", "status"); el.textContent = text; this.shadowRoot.appendChild(el);
    }
  }

  /* ---------------------------------------------------------- Aktionen */
  async _patch(id, changes) {
    const r = this._recipe(id);
    if (r) Object.assign(r, changes.favorite !== undefined ? { favorite: changes.favorite } : {}, changes.rating !== undefined ? { rating: changes.rating } : {});
    this.render();
    try {
      const saved = await this._hass.callWS({ type: "kochbuch/patch", recipe_id: id, ...changes });
      const idx = this.recipes.findIndex((x) => x.id === id);
      if (idx >= 0) this.recipes[idx] = saved;
      this.render();
    } catch (err) { this._showToast(`Fehler: ${err.message || err}`, true); }
  }

  _bringReady() {
    const b = this.settings.bring || {};
    return !!(b.email && b.list_uuid);
  }

  _todoTarget() {
    let entity = this.settings.shopping_list;
    const todos = this._todoEntities();
    if (!entity || !this._hass.states[entity]) entity = todos.includes("todo.shopping_list") ? "todo.shopping_list" : todos.find((e) => /einkauf/i.test(e)) || todos[0];
    return entity || "";
  }

  _openShop() {
    const r = this._recipe(this.view.id);
    const target = this._bringReady() ? "bring" : "todo";
    if (target === "todo" && !this._todoTarget()) { this._showToast("Keine Einkaufsliste eingerichtet – meldet euch in den Einstellungen bei Bring! an.", true); return; }
    this.dialog = { type: "shop", step: "servings", recipeId: r.id, servings: this.servings || r.servings, off: new Set(this.checked), target };
    this.render();
  }

  _updateShopCount() {
    const d = this.dialog;
    const items = this._shopItems(d).filter((i) => i.name);
    const n = items.filter((i) => i.on).length;
    const head = this.shadowRoot.querySelector(".shop-head > span");
    if (head) head.textContent = `${n} von ${items.length} ausgewählt`;
    const go = this.shadowRoot.querySelector('[data-action="shop-go"]');
    if (go) {
      go.disabled = !n;
      go.innerHTML = `<ha-icon icon="mdi:cart-plus"></ha-icon>${n} ${n === 1 ? "Zutat" : "Zutaten"} ${d.target === "bring" ? "zu Bring! hinzufügen" : "auf die Einkaufsliste"}`;
    }
  }

  _shopItems(d) {
    const r = this._recipe(d.recipeId);
    if (!r) return [];
    const factor = d.servings / (r.servings || 1);
    const items = [];
    (r.ingredients || []).forEach((i, idx) => {
      if (!i.name) { if (i.group) items.push({ group: i.group }); return; }
      items.push({ idx, name: i.name, spec: [scaleAmount(i.amount, factor), i.unit].filter(Boolean).join(" "), on: !d.off.has(idx) });
    });
    return items;
  }

  _servWord(r, n) {
    const u = (r.servings_unit || "Portionen").trim();
    if (/^(portion|person)/i.test(u)) return n === 1 ? "Person" : "Personen";
    return u;
  }

  async _sendShop() {
    const d = this.dialog;
    const items = this._shopItems(d).filter((i) => i.name && i.on);
    if (!items.length) return;
    this.dialog = { ...d, busy: true }; this.render();
    try {
      let where;
      if (d.target === "bring") {
        const res = await this._hass.callWS({ type: "kochbuch/bring_add", items: items.map((i) => {
          // „Zwiebel, gewürfelt“ → Artikel „Zwiebel“, Beschreibung „1, gewürfelt“ (damit Bring! den Artikel erkennt)
          const [name, ...rest] = i.name.split(/,\s*/);
          return { name: name.trim() || i.name, spec: [i.spec, rest.join(", ")].filter(Boolean).join(", ") };
        }) });
        where = `Bring!${res.list_name ? ` („${res.list_name}“)` : ""}`;
      } else {
        const entity = this._todoTarget();
        for (const i of items) await this._hass.callService("todo", "add_item", { item: i.spec ? `${i.name} (${i.spec})` : i.name }, { entity_id: entity });
        where = `„${this._hass.states[entity]?.attributes?.friendly_name || entity}“`;
      }
      this.dialog = null; this.render();
      this._showToast(`${items.length} ${items.length === 1 ? "Zutat" : "Zutaten"} auf ${where}`);
    } catch (err) {
      this.dialog = { ...d, busy: false, error: err.message || String(err) }; this.render();
    }
  }

  _print() {
    const r = this._recipe(this.view.id);
    if (!r) return;
    const factor = (this.servings || r.servings) / (r.servings || 1);
    const ing = (r.ingredients || []).map((i) => (!i.name && i.group ? `<li class="g">${esc(i.group)}</li>` : `<li><b>${esc([scaleAmount(i.amount, factor), i.unit].filter(Boolean).join(" "))}</b> ${esc(i.name)}</li>`)).join("");
    const w = window.open("", "_blank");
    if (!w) { this._showToast("Pop-up wurde blockiert", true); return; }
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(r.title)}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
      <style>body{font-family:"Atkinson Hyperlegible",system-ui,sans-serif;color:#1E2B25;max-width:780px;margin:30px auto;padding:0 24px;line-height:1.5}
      h1{font-family:"Bricolage Grotesque",sans-serif;font-size:38px;margin:0 0 6px;line-height:1.05}.meta{color:#55635C;margin-bottom:18px}
      img{width:100%;max-height:300px;object-fit:cover;border-radius:14px;margin-bottom:18px}.cols{display:grid;grid-template-columns:240px 1fr;gap:32px}
      h2{font-family:"Bricolage Grotesque",sans-serif;font-size:20px;border-bottom:2px solid #1E2B25;padding-bottom:4px}ul{list-style:none;padding:0;margin:0}
      li{padding:4px 0;border-bottom:1px dashed #DCE3DC}li.g{font-weight:700;color:#2F5D50;border:0;padding-top:12px}ol{padding-left:20px;margin:0}ol li{border:0;padding:0 0 10px}
      .notes{margin-top:18px;padding:12px 16px;background:#E3ECE7;border-radius:10px;white-space:pre-wrap}@media print{body{margin:0}}</style></head><body>
      ${r.image ? `<img src="${esc(new URL(r.image, location.origin).href)}">` : ""}<h1>${esc(r.title)}</h1>
      <div class="meta">${[r.prep_time ? `Vorbereitung ${fmtMinutes(r.prep_time)}` : "", r.cook_time ? `Kochzeit ${fmtMinutes(r.cook_time)}` : "", `${this.servings || r.servings} ${esc(r.servings_unit || "Portionen")}`].filter(Boolean).join("&ensp;|&ensp;")}</div>
      ${r.description ? `<p>${esc(r.description)}</p>` : ""}
      <div class="cols"><div><h2>Zutaten</h2><ul>${ing}</ul></div><div>${PHASES.filter((ph) => (r[ph.key] || []).length).map((ph) => `<h2>${ph.name}</h2><ol>${r[ph.key].map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`).join("")}
      ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ""}</div></div>
      <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  }



  async _onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    const id = el.dataset.id;
    const idx = el.dataset.idx !== undefined ? Number(el.dataset.idx) : null;

    if (a === "scrim") { if (e.target === el && !this.dialog?.busy) { this.dialog = null; this.render(); } return; }
    if (a === "fav") { e.stopPropagation(); const r = this._recipe(id); if (r) this._patch(id, { favorite: !r.favorite }); return; }

    switch (a) {
      case "open": this._navigatedInside = true; this._go(`rezept/${id}`); break;
      case "home": this._go(""); break;
      case "new": this._navigatedInside = true; this._go("neu"); break;
      case "edit": this._navigatedInside = true; this._go(`bearbeiten/${id}`); break;
      case "settings": this._navigatedInside = true; this._go("einstellungen"); break;
      case "filter": this._go(`kategorie/${encodeURIComponent(id)}`, true); break;
      case "cat": this._navigatedInside = true; this._go(`kategorie/${encodeURIComponent(this._slug(id))}`); break;
      case "back": this._back(); break;
      case "cat-fav": this._navigatedInside = true; this._go(`kategorie/${encodeURIComponent(id)}/favoriten`); break;
      case "import": this.dialog = { type: "import", mode: "url" }; this._focusSel = "#import-url"; this.render(); break;
      case "import-mode": this.dialog = { type: "import", mode: el.dataset.mode }; if (el.dataset.mode === "url") this._focusSel = "#import-url"; this.render(); break;
      case "export-recipe": this._exportRecipes(`?ids=${encodeURIComponent(id)}`, "Rezept"); break;
      case "export-cat": this._exportRecipes(`?category=${encodeURIComponent(id)}`, "Kategorie"); break;
      case "export-all": this._exportRecipes("", "Alle Rezepte"); break;
      case "backup-download": {
        this._readSettings(); this._readBackup();
        this._bbusy = "download"; this.render();
        try { const name = await this._downloadFile("/api/kochbuch/backup", "kochbuch-backup.zip"); this._showToast(`Sicherung gespeichert: ${name}`); }
        catch (err) { this._showToast(`Sicherung fehlgeschlagen: ${err.message || err}`, true); }
        this._bbusy = null; this.render();
        break;
      }
      case "bk-save": this._backupAction("save"); break;
      case "bk-test": this._backupAction("test"); break;
      case "bk-run": this._backupAction("run"); break;
      case "dlg-close": this.dialog = null; this.render(); break;
      case "import-go": {
        const url = this.shadowRoot.querySelector("#import-url").value.trim();
        this.dialog = { type: "import", mode: "url", url, busy: true }; this.render();
        try {
          const recipe = await this._hass.callWS({ type: "kochbuch/import_url", url });
          this.dialog = null;
          this._pendingImport = recipe;
          this.draft = null;
          this._navigatedInside = true;
          this._go("neu");
          this._showToast("Rezept übernommen – prüft und speichert es.");
        } catch (err) {
          this.dialog = { type: "import", mode: "url", url, error: err.message || String(err) }; this.render();
        }
        break;
      }
      case "delete": this.dialog = { type: "delete", id }; this.render(); break;
      case "delete-confirm": {
        const delId = this.dialog.id;
        this.dialog = null;
        try {
          await this._hass.callWS({ type: "kochbuch/delete", recipe_id: delId });
          this.recipes = this.recipes.filter((r) => r.id !== delId);
          this._showToast("Rezept gelöscht");
          this._go("", true);
        } catch (err) { this._showToast(`Löschen fehlgeschlagen: ${err.message || err}`, true); this.render(); }
        break;
      }
      case "rate": { const r = this._recipe(this.view.id); const n = Number(el.dataset.n); this._patch(r.id, { rating: r.rating === n ? 0 : n }); break; }
      case "serv": { const r = this._recipe(this.view.id); this.servings = Math.max(1, (this.servings || r.servings) + Number(el.dataset.d)); this.render(); break; }
      case "check": {
        const done = !this.checked.has(idx);
        if (done) this.checked.add(idx); else this.checked.delete(idx);
        // alle Listen mit dieser Zutat (Rezept und Kochmodus) direkt anpassen, ohne Neuaufbau
        this.shadowRoot.querySelectorAll(`.ing[data-idx="${idx}"]`).forEach((li) => {
          li.classList.toggle("done", done);
          li.setAttribute("aria-checked", String(done));
          li.querySelector(".box").innerHTML = done ? `<ha-icon icon="mdi:check-bold"></ha-icon>` : "";
          reorderList(li.parentElement, ".ing", (x) => x.classList.contains("done"));
        });
        break;
      }
      case "shop": this._openShop(); break;
      case "shop-toggle": {
        const k = Number(el.dataset.i); const d = this.dialog; const off = d.off;
        const on = off.has(k);
        if (on) off.delete(k); else off.add(k);
        el.classList.toggle("on", on);
        el.setAttribute("aria-checked", String(on));
        el.querySelector(".box").innerHTML = on ? `<ha-icon icon="mdi:check-bold"></ha-icon>` : "";
        reorderList(el.parentElement, ".shop-item", (x) => !x.classList.contains("on"));
        this._updateShopCount();
        break;
      }
      case "shop-all": { const d = this.dialog; d.off = el.dataset.on === "1" ? new Set() : new Set(this._shopItems(d).filter((i) => i.name).map((i) => i.idx)); this.render(); break; }
      case "shop-serv": this.dialog.servings = Math.max(1, Math.min(100, this.dialog.servings + Number(el.dataset.d))); this.render(); break;
      case "shop-serv-set": this.dialog.servings = Number(el.dataset.n); this.render(); break;
      case "shop-next": this.dialog.step = "list"; this.servings = this.dialog.servings; this.render(); break;
      case "shop-back": this.dialog.step = "servings"; this.dialog.error = null; this.render(); break;
      case "shop-target": this.dialog.target = el.dataset.t; this.render(); break;
      case "shop-go": this._sendShop(); break;
      case "fold": this._readSettings(); if (this.folds.has(id)) this.folds.delete(id); else this.folds.add(id); try { localStorage.setItem("kochbuch-folds", JSON.stringify([...this.folds])); } catch (e) { /* egal */ } this.render(); break;
      case "bring-login": {
        this._readSettings();
        const email = this.shadowRoot.querySelector("#bring-email").value.trim();
        const password = this.shadowRoot.querySelector("#bring-pass").value;
        if (!email || !password) { this._showToast("Bitte E-Mail und Passwort eingeben", true); break; }
        this._bringBusy = true; this.render();
        try {
          const res = await this._hass.callWS({ type: "kochbuch/bring_login", email, password });
          this.settings.bring = res.bring; this.settingsDraft.bring = res.bring; this.bringLists = res.lists; this._bringError = null;
          this._showToast(`Mit Bring! verbunden${res.bring.list_name ? ` – Liste „${res.bring.list_name}“` : ""}`);
        } catch (err) { this._showToast(err.message || String(err), true); }
        this._bringBusy = false; this.render();
        break;
      }
      case "bring-logout": {
        this._readSettings();
        try { await this._hass.callWS({ type: "kochbuch/bring_logout" }); this.settings.bring = {}; this.settingsDraft.bring = {}; this.bringLists = null; this._showToast("Von Bring! abgemeldet"); }
        catch (err) { this._showToast(err.message || String(err), true); }
        this.render();
        break;
      }
      case "print": this._print(); break;
      case "cook": this.cook = { id: this.view.id, index: 0 }; this._requestWake(); this.render(); break;
      case "cook-close": this.cook = null; this._releaseWake(); this.render(); break;
      case "cook-prev": this.cook.index = Math.max(0, this.cook.index - 1); this.render(); break;
      case "cook-next": { const r = this._recipe(this.cook.id); this.cook.index = Math.min(allSteps(r).length - 1, this.cook.index + 1); this.render(); break; }
      case "cook-done": {
        const cid = this.cook.id; this.cook = null; this._releaseWake();
        this._showToast("Guten Appetit!");
        this._patch(cid, { cooked: true });
        break;
      }
      case "timer": e.stopPropagation(); this._startTimer(Number(el.dataset.min), el.dataset.label); break;
      case "timer-stop": this.timers = this.timers.filter((t) => String(t.id) !== el.dataset.tid); this.render(); break;

      // Editor
      case "cancel-edit": this.draft = null; this._back(); break;
      case "save": this._save(); break;
      case "diff": this._readDraft(); this.draft.difficulty = Number(el.dataset.n); this.render(); break;
      case "img-remove": this._readDraft(); this.draft.image = ""; this.render(); break;
      case "ing-add": this._readDraft(); this.draft.ingredients.push({ amount: "", unit: "", name: "", group: "" }); this._focusSel = `[data-row="${this.draft.ingredients.length - 1}"] [data-ing="amount"]`; this.render(); break;
      case "ing-head": this._readDraft(); this.draft.ingredients.push({ amount: "", unit: "", name: "", group: "", _head: true }); this._focusSel = `[data-row="${this.draft.ingredients.length - 1}"] [data-ing="group"]`; this.render(); break;
      case "ing-del": this._readDraft(); this.draft.ingredients.splice(idx, 1); this.render(); break;
      case "ing-up": this._readDraft(); this._move(this.draft.ingredients, idx, -1); this.render(); break;
      case "ing-down": this._readDraft(); this._move(this.draft.ingredients, idx, 1); this.render(); break;
      case "step-add": { this._readDraft(); const k = el.dataset.phase; this.draft[k] = this.draft[k] || []; this.draft[k].push(""); this._focusSel = `[data-srow="${k}-${this.draft[k].length - 1}"] textarea`; this.render(); break; }
      case "step-del": this._readDraft(); this.draft[el.dataset.phase].splice(idx, 1); this.render(); break;
      case "step-up": this._readDraft(); this._move(this.draft[el.dataset.phase], idx, -1); this.render(); break;
      case "step-down": this._readDraft(); this._move(this.draft[el.dataset.phase], idx, 1); this.render(); break;
      case "tag-del": this._readDraft(); this.draft.tags.splice(idx, 1); this._focusSel = "#tag-input"; this.render(); break;
      case "paste": this._readDraft(); this.dialog = { type: "paste" }; this._focusSel = "#paste-text"; this.render(); break;
      case "paste-go": {
        const lines = this.shadowRoot.querySelector("#paste-text").value.split(/\n/).map(parseIngredientLine).filter(Boolean)
          .map((i) => (i.group && !i.name ? { ...i, _head: true } : i));
        this.draft.ingredients = this.draft.ingredients.filter((i) => i.name || i.amount || i.group).concat(lines);
        this.dialog = null; this.render();
        break;
      }

      // Einstellungen
      case "cat-add": {
        this._readSettings();
        const palette = ["#D99A2B", "#C2452D", "#8A5A3B", "#B8738F", "#3F7F6E", "#5B7FA6", "#6A994E", "#9C6644", "#7D6BA8", "#D4703A"];
        const n = this.settingsDraft.categories.length;
        this.settingsDraft.categories.push({ id: Math.random().toString(36).slice(2, 10), name: "", icon: "mdi:food", color: palette[n % palette.length] });
        this._focusSel = `[data-cat="${n}"] [data-c="name"]`;
        this.render();
        break;
      }
      case "cat-up": case "cat-down": {
        this._readSettings();
        const all = this.settingsDraft.categories;
        const c = all[idx];
        const tops = this._topCats(all);
        const sibs = all.map((x, j) => ({ x, j })).filter(({ x }) => (tops.includes(c) ? tops.includes(x) : x.parent === c.parent));
        const pos = sibs.findIndex((o) => o.j === idx);
        const other = sibs[pos + (a === "cat-up" ? -1 : 1)];
        if (other) { [all[idx], all[other.j]] = [all[other.j], all[idx]]; this._flashCat = other.j; this._focusSel = `[data-cat="${other.j}"] [data-action="${a}"]:not([disabled])`; }
        this.render();
        break;
      }
      case "cat-add-sub": {
        this._readSettings();
        const all = this.settingsDraft.categories;
        const parent = all.find((x) => x.id === id);
        const lastIdx = Math.max(...all.map((x, j) => (x.id === id || x.parent === id ? j : -1)));
        all.splice(lastIdx + 1, 0, { id: Math.random().toString(36).slice(2, 10), name: "", icon: parent.icon, color: parent.color, parent: id });
        this._focusSel = `[data-cat="${lastIdx + 1}"] [data-c="name"]`;
        this.render();
        break;
      }
      case "cat-del": {
        this._readSettings();
        const c = this.settingsDraft.categories[idx];
        const sd = this.settingsDraft;
        const n = this.recipes.filter((r) => { let x = r.category; for (let i = 0; i < 10 && sd.moves && x in sd.moves; i++) x = sd.moves[x]; return x === c.id; }).length;
        const kids = sd.categories.filter((x) => x.parent === c.id).length;
        if (n || kids) { this.dialog = { type: "cat-del", idx, name: c.name, n, kids }; this.render(); }
        else { this.settingsDraft.categories.splice(idx, 1); this.render(); }
        break;
      }
      case "cat-del-confirm": {
        const sd = this.settingsDraft;
        const gone = sd.categories[this.dialog.idx].id;
        const target = this.shadowRoot.querySelector("#move-target")?.value || "";
        sd.moves = sd.moves || {};
        for (const k of Object.keys(sd.moves)) if (sd.moves[k] === gone) sd.moves[k] = target;
        sd.moves[gone] = target;
        sd.categories.forEach((x) => { if (x.parent === gone) x.parent = ""; });
        sd.categories.splice(this.dialog.idx, 1);
        this.dialog = null; this.render();
        break;
      }
      case "settings-save": {
        this._readSettings();
        this.settingsDraft.categories = this.settingsDraft.categories.filter((c) => c.name.trim());
        try {
          if (this.backupDraft && this._hass.user?.is_admin) {
            const cfg = { ...this.backupDraft };
            if (!cfg.password) delete cfg.password;
            const res = await this._hass.callWS({ type: "kochbuch/backup_save", config: cfg });
            this.backupCfg = res.backup; this.backupDraft = null;
          }
          this.settings = await this._hass.callWS({ type: "kochbuch/settings", settings: this.settingsDraft });
          if (this.settingsDraft.moves) this._setData(await this._hass.callWS({ type: "kochbuch/data" }));
          this._showToast("Einstellungen gespeichert");
          this._go("", true);
        } catch (err) { this._showToast(`Fehler: ${err.message || err}`, true); }
        break;
      }
      case "restore-go": {
        const file = this.dialog.file; const replace = el.dataset.replace === "1";
        this.dialog = { ...this.dialog, busy: true }; this.render();
        try {
          const res = await this._uploadFile(`/api/kochbuch/backup?mode=${replace ? "replace" : "merge"}`, file);
          this._setData(await this._hass.callWS({ type: "kochbuch/data" }));
          this.settingsDraft = JSON.parse(JSON.stringify(this.settings));
          this.dialog = null;
          this._showToast(`Sicherung eingespielt: ${res.recipes} ${res.recipes === 1 ? "Rezept" : "Rezepte"}, ${res.images} Fotos`);
        } catch (err) { this.dialog = null; this._showToast(`Einspielen fehlgeschlagen: ${err.message || err}`, true); }
        this.render();
        break;
      }
      default: break;
    }
  }

  _onInput(e) {
    if (e.target.id === "search") {
      const was = !!this.search.trim();
      this.search = e.target.value;
      const grid = this.shadowRoot.querySelector("#grid");
      if ((this.view.name === "home" || this.view.name === "list") && (was !== !!this.search.trim() || !grid)) { this._focusSel = "#search"; this.render(); return; }
      if (grid) grid.innerHTML = this._renderCards();
      const rc = this.shadowRoot.querySelector("#result-count");
      if (rc) rc.textContent = this._resultLabel();
    }
  }

  async _onChange(e) {
    const t = e.target;
    if (t.dataset && t.dataset.c === "parent") { this._readSettings(); this.render(); return; }
    if (t.dataset && (t.dataset.c === "color" || t.dataset.c === "icon")) {
      const row = t.closest(".cat-row"); const prev = row && row.querySelector(".prev");
      if (prev && t.dataset.c === "color") prev.style.background = t.value;
      if (prev && t.dataset.c === "icon") prev.querySelector("ha-icon").setAttribute("icon", t.value);
      return;
    }
    if (t.id === "bring-list") {
      const name = t.options[t.selectedIndex]?.textContent || "";
      try {
        const res = await this._hass.callWS({ type: "kochbuch/bring_select", list_uuid: t.value, list_name: name });
        this.settings.bring = res.bring; if (this.settingsDraft) this.settingsDraft.bring = res.bring;
        this._showToast(`Bring!-Liste „${name}“ gewählt`);
      } catch (err) { this._showToast(err.message || String(err), true); }
      return;
    }
    if (t.id === "sort") { this.sort = t.value; localStorage.setItem("kochbuch-sort", t.value); this.render(); }
    else if (t.id === "img-file" && t.files?.[0]) this._uploadImage(t.files[0]);
    else if (t.id === "backup-file" && t.files?.[0]) {
      this._readSettings(); this._readBackup();
      this.dialog = { type: "restore", file: t.files[0] }; this.render();
    } else if ((t.id === "recipes-file" || t.id === "import-file") && t.files?.[0]) {
      if (t.id === "recipes-file") { this._readSettings(); this._readBackup(); }
      this._importRecipeFile(t.files[0]);
    } else if (t.id === "b-tls") {
      this._readSettings(); this._readBackup(); this.render();
    }
  }

  _onKey(e) {
    const t = e.target;
    if (t.id === "tag-input" && (e.key === "Enter" || e.key === ",")) {
      e.preventDefault();
      const v = t.value.trim().replace(/,$/, "");
      if (v) { this._readDraft(); if (!this.draft.tags.includes(v)) this.draft.tags.push(v); this._focusSel = "#tag-input"; this.render(); }
      return;
    }
    if (t.id === "tag-input" && e.key === "Backspace" && !t.value && this.draft.tags.length) {
      this._readDraft(); this.draft.tags.pop(); this._focusSel = "#tag-input"; this.render(); return;
    }
    if (t.id === "import-url" && e.key === "Enter") { this.shadowRoot.querySelector('[data-action="import-go"]')?.click(); return; }
    if ((e.key === "Enter" || e.key === " ") && t.matches?.(".card, .ing, .shop-item")) { e.preventDefault(); t.click(); }
  }

  _onGlobalKey(e) {
    if (this.cook) {
      if (e.key === "ArrowRight" || e.key === "PageDown") { this.shadowRoot.querySelector('[data-action="cook-next"]')?.click(); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { this.shadowRoot.querySelector('[data-action="cook-prev"]')?.click(); e.preventDefault(); }
      else if (e.key === "Escape") { this.cook = null; this._releaseWake(); this.render(); }
    } else if (this.dialog && e.key === "Escape" && !this.dialog.busy) { this.dialog = null; this.render(); }
  }
}

if (!customElements.get("kochbuch-panel")) customElements.define("kochbuch-panel", KochbuchPanel);
