/* Kochbuch – Panel für Home Assistant
 * https://github.com/domiundergroun/Kochrezepte
 */
const KB_VERSION = "1.1.0";

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

function fmtMinutes(min) {
  min = Number(min) || 0;
  if (!min) return "";
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h >= 24) { const d = Math.floor(h / 24), rh = h % 24; return rh ? `${d} Tg ${rh} Std` : `${d} Tg`; }
  return m ? `${h} Std ${m} Min` : `${h} Std`;
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
.card h3 { font-size: 20px; font-weight: 700; line-height: 1.15; }
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
  .top.list { flex-wrap: wrap; row-gap: 8px; }
  .top.list .search { order: 10; flex: 1 0 100%; margin-left: 8px; }
  .top.list .brand .count { display: none; }
  main, .detail, .editor { padding-left: 14px; padding-right: 14px; }
  .grid { grid-template-columns: 1fr 1fr; gap: 22px 12px; }
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
  .f { grid-column: span 2; }
  .irow { grid-template-columns: 24px 62px 74px 1fr 36px; gap: 6px; }
  .savebar { padding-left: 14px; padding-right: 14px; }
  .savebar .btn { flex: 1 1 0; min-width: 0; justify-content: center; padding: 0 10px; }
  .savebar .btn ha-icon { display: none; }
  .savebar .lbl-m { display: inline; }
  .cat-row { grid-template-columns: 44px 44px 1fr; }
  .cat-row select { grid-column: 1 / -1; }
  .cat-row .order { grid-column: 1 / -1; justify-content: flex-end; }
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
    if (parts[0] === "kategorie" && parts[1]) {
      view = { name: "list", id: parts[1] };
      const f = { alle: "all", favoriten: "fav", ohne: "none" }[parts[1]] || decodeURIComponent(parts[1]);
      if (f !== this.filter) this.search = "";
      this.filter = f;
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
    const cat = this.view.name === "list" && this._cat(this.filter) ? this.filter : "";
    return {
      title: "", description: "", category: cat, tags: [], image: "",
      servings: this.settings.default_servings || 4, servings_unit: "Portionen",
      prep_time: 0, cook_time: 0, rest_time: 0, difficulty: 1, rating: 0, favorite: false,
      ingredients: [{ amount: "", unit: "", name: "", group: "" }],
      steps: [""], notes: "", source: "", author: "",
      ...(base || {}),
    };
  }

  _recipe(id) { return this.recipes.find((r) => r.id === id); }
  _cat(id) { return (this.settings.categories || []).find((c) => c.id === id); }

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

    root.innerHTML = `<style>${STYLES}</style>${body}${this._renderCook()}${this._renderDialog()}${this._renderTimers()}${this._toast ? `<div class="toast ${this._toast.err ? "err" : ""}" role="status">${esc(this._toast.text)}</div>` : ""}`;
    const mb = root.querySelector("ha-menu-button");
    if (mb) { mb.hass = this._hass; mb.narrow = this._narrow; }
    if (this._focusSel) {
      const el = root.querySelector(this._focusSel);
      if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
      this._focusSel = null;
    }
  }

  _top(cls, inner) {
    return `<header class="top ${cls || ""}"><ha-menu-button></ha-menu-button>${inner}</header>`;
  }

  _renderError() {
    return `${this._top("", `<div class="brand"><h1>Kochbuch</h1></div>`)}
      <div class="empty"><div class="plate"><ha-icon icon="mdi:alert-circle-outline"></ha-icon></div>
      <h2>Das Kochbuch lässt sich nicht laden</h2><p>${esc(this._loadError)}. Starte Home Assistant neu, nachdem du die Integration installiert oder aktualisiert hast.</p></div>`;
  }

  _filtered(filter = this.filter) {
    const q = this.search.trim().toLowerCase();
    let list = this.recipes.filter((r) => {
      if (filter === "fav" && !r.favorite) return false;
      if (filter === "none" && r.category && this._cat(r.category)) return false;
      if (!["all", "fav", "none"].includes(filter) && r.category !== filter) return false;
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
    return list.sort(sorts[this.sort] || sorts.title);
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
      <button class="icon-btn" data-action="import" title="Aus dem Internet importieren" aria-label="Aus dem Internet importieren"><ha-icon icon="mdi:web-plus"></ha-icon></button>
      <button class="btn primary" data-action="new"><ha-icon icon="mdi:plus"></ha-icon><span class="lbl">Neues Rezept</span></button>
      <button class="icon-btn" data-action="settings" title="Einstellungen" aria-label="Einstellungen"><ha-icon icon="mdi:cog-outline"></ha-icon></button>`);
  }

  _toolbar() {
    return `<div class="toolbar"><span id="result-count">${this._resultLabel()}</span><div class="spacer"></div>
        <label>Sortieren: <select id="sort">
          ${[["title", "A–Z"], ["new", "Neueste"], ["time", "Schnellste"], ["rating", "Beste Bewertung"], ["cooked", "Oft gekocht"]].map(([v, l]) => `<option value="${v}" ${this.sort === v ? "selected" : ""}>${l}</option>`).join("")}
        </select></label></div>`;
  }

  _renderHome() {
    const n = this.recipes.length;
    const header = this._header("list", "", "Kochbuch", `${n} ${n === 1 ? "Rezept" : "Rezepte"}`);
    if (this.search.trim()) {
      return `${header}<main>${this._toolbar()}<section class="grid" id="grid">${this._renderCards()}</section></main>`;
    }
    const cats = this.settings.categories || [];
    const inCat = (id) => this.recipes.filter((r) => r.category === id);
    const tiles = cats.map((c) => {
      const list = inCat(c.id);
      const pics = list.filter((r) => r.image).slice(0, 3);
      return `<button class="cat-tile" style="--c:${esc(c.color)}" data-action="cat" data-id="${esc(c.id)}">
        <ha-icon class="bg" icon="${esc(c.icon)}"></ha-icon>
        ${pics.length ? `<span class="thumbs">${pics.map((r) => `<img src="${esc(r.image)}" alt="" loading="lazy">`).join("")}</span>` : ""}
        <span class="ct-name">${esc(c.name)}</span>
        <span class="ct-count">${list.length ? `${list.length} ${list.length === 1 ? "Rezept" : "Rezepte"}` : "Noch leer"}</span>
      </button>`;
    }).join("");
    const favs = this.recipes.filter((r) => r.favorite).length;
    const none = this.recipes.filter((r) => !r.category || !this._cat(r.category)).length;
    const mini = [
      `<button class="mini-tile" data-action="cat" data-id="all"><ha-icon icon="mdi:book-open-variant"></ha-icon><span><b>Alle Rezepte</b><small>${n}</small></span></button>`,
      `<button class="mini-tile mini-fav" data-action="cat" data-id="fav"><ha-icon icon="mdi:heart"></ha-icon><span><b>Favoriten</b><small>${favs}</small></span></button>`,
      none ? `<button class="mini-tile" data-action="cat" data-id="none"><ha-icon icon="mdi:tag-off-outline"></ha-icon><span><b>Ohne Kategorie</b><small>${none}</small></span></button>` : "",
    ].join("");
    const newest = this.recipes.slice().sort((a, b) => (b.created || "").localeCompare(a.created || "")).slice(0, 4);
    return `${header}<main class="home">
      ${n ? "" : `<div class="welcome"><div><h2>Willkommen im Kochbuch</h2><p>Wählt eine Kategorie und tragt das erste Rezept ein – oder holt eins per Link aus dem Internet.</p></div>
        <div class="row"><button class="btn primary" data-action="new"><ha-icon icon="mdi:pencil-plus"></ha-icon>Rezept schreiben</button><button class="btn" data-action="import"><ha-icon icon="mdi:web-plus"></ha-icon>Aus dem Internet holen</button></div></div>`}
      <section class="shelf" aria-label="Kategorien">${tiles}
        <button class="cat-tile add" data-action="settings"><ha-icon icon="mdi:plus"></ha-icon><span class="ct-name">Kategorie</span><span class="ct-count">in den Einstellungen anlegen</span></button>
      </section>
      <div class="minis">${mini}</div>
      ${newest.length ? `<h2 class="sec-title">Neu im Kochbuch</h2><section class="grid">${this._renderCards(newest)}</section>` : ""}
    </main>`;
  }

  _renderList() {
    const cats = this.settings.categories || [];
    const count = (id) => this.recipes.filter((r) => r.category === id).length;
    const favs = this.recipes.filter((r) => r.favorite).length;
    const none = this.recipes.filter((r) => !r.category || !this._cat(r.category)).length;
    const tab = (id, label, color, n, icon) =>
      `<button class="tab ${this.filter === id ? "on" : ""}" data-action="filter" data-id="${esc(this._slug(id))}" style="--c:${color}">${icon || `<span class="dot"></span>`}${label} <span class="n">${n}</span></button>`;
    const tabs = [
      tab("all", "Alle", "var(--kb-ink)", this.recipes.length, " "),
      tab("fav", "Favoriten", "var(--kb-tomato)", favs, `<ha-icon icon="mdi:heart" style="--mdc-icon-size:16px;color:var(--kb-tomato)"></ha-icon>`),
      ...cats.map((c) => tab(c.id, esc(c.name), esc(c.color), count(c.id))),
      none || this.filter === "none" ? tab("none", "Ohne Kategorie", "var(--kb-ink-soft)", none) : "",
    ].join("");
    const c = this._cat(this.filter);
    const lead = `<button class="icon-btn" data-action="home" aria-label="Zur Startseite"><ha-icon icon="mdi:arrow-left"></ha-icon></button>`;
    const title = c ? `<span class="title-dot" style="background:${esc(c.color)}"></span>${esc(c.name)}` : esc(this._filterName(this.filter));
    const header = this._header("list", lead, title, "");
    const empty = !this._filtered().length && !this.search.trim();
    return `${header}<main>
      <nav class="tabs" aria-label="Kategorien">${tabs}</nav>
      ${empty ? "" : this._toolbar()}
      <section class="grid" id="grid">${empty ? this._emptyCategory() : this._renderCards()}</section>
    </main>`;
  }

  _emptyCategory() {
    const c = this._cat(this.filter);
    const what = this.filter === "fav" ? "Noch keine Favoriten. Tippt bei einem Rezept auf das Herz." : `In „${esc(this._filterName(this.filter))}“ gibt es noch kein Rezept.`;
    return `<div class="empty" style="grid-column:1/-1"><div class="plate" ${c ? `style="color:${esc(c.color)}"` : ""}><ha-icon icon="${esc(c ? c.icon : this.filter === "fav" ? "mdi:heart-outline" : "mdi:chef-hat")}"></ha-icon></div>
      <h2>${what}</h2>${this.filter === "fav" ? "" : `<p>Das erste Rezept landet direkt in dieser Kategorie.</p><div class="row"><button class="btn primary" data-action="new"><ha-icon icon="mdi:pencil-plus"></ha-icon>Rezept schreiben</button></div>`}</div>`;
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
          ${r.description ? `<div class="desc">${esc(r.description)}</div>` : ""}
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
    const missing = (r.ingredients || []).filter((i, idx) => i.name && !this.checked.has(idx)).length;
    const anyChecked = this.checked.size > 0;
    const cookedN = (r.cooked || []).length;

    const header = this._top("", `
      <button class="icon-btn" data-action="back" aria-label="Zurück"><ha-icon icon="mdi:arrow-left"></ha-icon></button>
      <div class="spacer"></div>
      <button class="icon-btn" data-action="fav" data-id="${esc(r.id)}" aria-label="Favorit" style="color:${r.favorite ? "var(--kb-tomato)" : "inherit"}"><ha-icon icon="${r.favorite ? "mdi:heart" : "mdi:heart-outline"}"></ha-icon></button>
      <button class="icon-btn" data-action="print" aria-label="Drucken" title="Drucken"><ha-icon icon="mdi:printer-outline"></ha-icon></button>
      <button class="icon-btn" data-action="delete" data-id="${esc(r.id)}" aria-label="Löschen" title="Löschen"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
      <button class="btn" data-action="edit" data-id="${esc(r.id)}"><ha-icon icon="mdi:pencil-outline"></ha-icon><span class="lbl">Bearbeiten</span></button>
      ${(r.steps || []).length ? `<button class="btn saffron" data-action="cook"><ha-icon icon="mdi:stove"></ha-icon><span class="lbl">Kochmodus</span></button>` : ""}`);

    let ingHtml = "";
    (r.ingredients || []).forEach((i, idx) => {
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

    const steps = (r.steps || []).map((s) => `<li class="step"><p>${this._stepHtml(s)}</p></li>`).join("");
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
          <p class="hint">Tippt an, was schon im Haus ist – der Rest kommt auf die Einkaufsliste.</p>
          <div class="ing-actions">
            <button class="btn primary" data-action="shop" ${missing ? "" : "disabled"}><ha-icon icon="mdi:cart-plus"></ha-icon>${anyChecked ? `${missing} fehlende auf die Einkaufsliste` : "Alle auf die Einkaufsliste"}</button>
          </div>` : `<p class="muted">Noch keine Zutaten eingetragen.</p>`}
        </section>
        <section aria-label="Zubereitung">
          <div class="sec-head"><h2>Zubereitung</h2></div>
          ${steps ? `<ol class="steps">${steps}</ol>` : `<p class="muted">Noch keine Arbeitsschritte eingetragen.</p>`}
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
    const steps = r.steps || [];
    const i = this.cook.index;
    const factor = (this.servings || r.servings) / (r.servings || 1);
    let ing = "";
    (r.ingredients || []).forEach((x, idx) => {
      if (!x.name && !x.amount && x.group) { ing += `<li class="ing-group">${esc(x.group)}</li>`; return; }
      ing += `<li class="ing ${this.checked.has(idx) ? "done" : ""}" data-action="check" data-idx="${idx}"><span class="box">${this.checked.has(idx) ? `<ha-icon icon="mdi:check-bold"></ha-icon>` : ""}</span><span class="amt">${esc([scaleAmount(x.amount, factor), x.unit].filter(Boolean).join(" "))}</span><span class="nm">${esc(x.name)}</span></li>`;
    });
    const last = i >= steps.length - 1;
    return `<div class="cook" role="dialog" aria-label="Kochmodus">
      <aside><h3>Zutaten für ${this.servings || r.servings} ${esc(r.servings_unit || "Portionen")}</h3><ul class="ing-list">${ing}</ul></aside>
      <div class="stage">
        <div class="bar"><h2>${esc(r.title)}</h2><button class="icon-btn" data-action="cook-close" aria-label="Kochmodus beenden"><ha-icon icon="mdi:close"></ha-icon></button></div>
        <div class="progress">${steps.map((_, n) => `<i class="${n <= i ? "on" : ""}"></i>`).join("")}</div>
        <div class="now"><div class="big-num">${i + 1}<small>von ${steps.length}</small></div><p>${this._stepHtml(steps[i] || "")}</p></div>
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
    const stepRows = (d.steps || []).map((s, idx) => `<div class="srow" data-srow="${idx}">
        <div class="grip"><button data-action="step-up" data-idx="${idx}" aria-label="Nach oben"><ha-icon icon="mdi:chevron-up"></ha-icon></button><button data-action="step-down" data-idx="${idx}" aria-label="Nach unten"><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>
        <div class="num">${idx + 1}</div>
        <textarea class="inp" data-step placeholder="Was ist zu tun?" aria-label="Schritt ${idx + 1}">${esc(s)}</textarea>
        <button class="icon-btn" data-action="step-del" data-idx="${idx}" aria-label="Schritt entfernen"><ha-icon icon="mdi:close"></ha-icon></button></div>`).join("");

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
          <div class="f s3"><label for="f-cat">Kategorie</label><select id="f-cat" data-f="category"><option value="">Ohne Kategorie</option>${cats.map((c) => `<option value="${esc(c.id)}" ${d.category === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
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
      <section class="panel">
        <h2>Zubereitung</h2>
        <div class="rows">${stepRows}</div>
        <div class="add-row"><button class="btn" data-action="step-add"><ha-icon icon="mdi:plus"></ha-icon>Schritt</button></div>
        <p class="hint">Zeitangaben wie „20 Minuten“ werden in der Ansicht automatisch zum Timer.</p>
      </section>
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
    const steps = [];
    root.querySelectorAll("[data-step]").forEach((el) => steps.push(el.value));
    d.steps = steps;
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
    const recipe = { ...d };
    delete recipe._key;
    recipe.ingredients = d.ingredients
      .filter((i) => (i._head ? i.group.trim() : i.name.trim() || i.amount.trim()))
      .map((i) => (i._head ? { amount: "", unit: "", name: "", group: i.group.trim() } : { amount: i.amount.trim(), unit: i.unit.trim(), name: i.name.trim(), group: "" }));
    recipe.steps = d.steps.map((s) => s.trim()).filter(Boolean);
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
    const used = (id) => this.recipes.filter((r) => r.category === id).length;
    const cats = (s.categories || []).map((c, i) => `<div class="cat-row ${this._flashCat === i ? "flash" : ""}" data-cat="${i}">
        <input type="color" data-c="color" value="${esc(c.color)}" aria-label="Farbe von ${esc(c.name)}">
        <span class="prev" style="background:${esc(c.color)}"><ha-icon icon="${esc(c.icon)}"></ha-icon></span>
        <span class="name-cell"><input class="inp" data-c="name" value="${esc(c.name)}" aria-label="Name der Kategorie" placeholder="Name"><small>${used(c.id) === 1 ? "1 Rezept" : `${used(c.id)} Rezepte`}</small></span>
        <select class="inp" data-c="icon" aria-label="Symbol">${[...new Set([c.icon, ...ICONS])].map((ic) => `<option value="${esc(ic)}" ${ic === c.icon ? "selected" : ""}>${esc(ic.replace("mdi:", ""))}</option>`).join("")}</select>
        <span class="order">
          <button class="icon-btn" data-action="cat-up" data-idx="${i}" aria-label="Nach oben" ${i === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="icon-btn" data-action="cat-down" data-idx="${i}" aria-label="Nach unten" ${i === total - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <button class="icon-btn del" data-action="cat-del" data-idx="${i}" aria-label="${esc(c.name)} löschen"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>
        </span>
      </div>`).join("");
    this._flashCat = null;
    return `${this._top("", `<button class="icon-btn" data-action="back" aria-label="Zurück"><ha-icon icon="mdi:arrow-left"></ha-icon></button><div class="brand"><h1>Einstellungen</h1></div>`)}
    <div class="editor">
      <section class="panel"><h2>Kategorien</h2>
        <p class="muted" style="margin:-6px 0 14px">So erscheinen die Kategorien auf der Startseite. Mit den Pfeilen ändert ihr die Reihenfolge.</p>
        <div class="rows">${cats || `<p class="muted">Noch keine Kategorien.</p>`}</div>
        <div class="add-row"><button class="btn" data-action="cat-add"><ha-icon icon="mdi:plus"></ha-icon>Kategorie hinzufügen</button></div>
      </section>
      <section class="panel"><h2>Einkaufsliste</h2>
        <div class="fields">
          <div class="f s3"><label for="s-list">Zutaten landen in</label>
            <select id="s-list" data-s="shopping_list"><option value="">Bitte wählen</option>${todos.map((e) => `<option value="${esc(e)}" ${s.shopping_list === e ? "selected" : ""}>${esc(name(e))}</option>`).join("")}</select></div>
          <div class="f s3"><label for="s-serv">Standard-Portionen für neue Rezepte</label><input id="s-serv" type="number" min="1" data-s="default_servings" value="${s.default_servings || 4}"></div>
        </div>
        ${todos.length ? "" : `<p class="hint">Keine To-do-Liste gefunden. Richtet unter Einstellungen › Geräte & Dienste die Integration „Einkaufsliste“ ein.</p>`}
      </section>
      <section class="panel"><h2>Sicherung</h2>
        <p class="muted" style="margin-top:0">Speichert alle Rezepte als Datei oder spielt eine Sicherung wieder ein. Fotos bleiben im Ordner <code>kochbuch_bilder</code> eurer Home-Assistant-Konfiguration.</p>
        <div class="settings-actions">
          <button class="btn" data-action="export"><ha-icon icon="mdi:download"></ha-icon>Sicherung herunterladen</button>
          <label class="btn" tabindex="0"><ha-icon icon="mdi:upload"></ha-icon>Sicherung einspielen<input type="file" accept="application/json,.json" id="backup-file" hidden></label>
        </div>
      </section>
      <p class="muted" style="text-align:center">Kochbuch ${KB_VERSION}</p>
    </div>
    <div class="savebar"><button class="btn" data-action="back">Abbrechen</button><button class="btn primary" data-action="settings-save"><ha-icon icon="mdi:content-save-outline"></ha-icon><span class="lbl">Einstellungen speichern</span><span class="lbl-m">Speichern</span></button></div>`;
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
      inner = `<h2>„${esc(d.name)}“ löschen?</h2><p>${d.n === 1 ? "Ein Rezept gehört" : `${d.n} Rezepte gehören`} zu dieser Kategorie. Die Rezepte bleiben erhalten und erscheinen danach unter „Ohne Kategorie“. Gelöscht wird erst beim Speichern der Einstellungen.</p>
        <div class="row"><button class="btn" data-action="dlg-close">Behalten</button><button class="btn primary" style="background:var(--kb-tomato);border-color:var(--kb-tomato);color:#fff" data-action="cat-del-confirm">Kategorie löschen</button></div>`;
    } else if (d.type === "import") {
      inner = `<h2>Rezept aus dem Internet</h2><p>Fügt die Adresse eines Rezepts ein, z. B. von Chefkoch, Lecker oder einem Foodblog. Ihr könnt alles vor dem Speichern noch anpassen.</p>
        <input class="inp" id="import-url" type="url" placeholder="https://www.chefkoch.de/rezepte/…" value="${esc(d.url || "")}" ${d.busy ? "disabled" : ""}>
        ${d.error ? `<p style="color:var(--kb-tomato);margin:10px 0 0">${esc(d.error)}</p>` : ""}
        <div class="row"><button class="btn" data-action="dlg-close">Abbrechen</button><button class="btn primary" data-action="import-go" ${d.busy ? "disabled" : ""}>${d.busy ? `<span class="spin" style="width:18px;height:18px"></span>Wird geladen` : `<ha-icon icon="mdi:download"></ha-icon>Rezept holen`}</button></div>`;
    } else if (d.type === "paste") {
      inner = `<h2>Zutatenliste einfügen</h2><p>Eine Zutat pro Zeile. Zeilen mit Doppelpunkt am Ende werden zu Zwischenüberschriften.</p>
        <textarea class="inp" id="paste-text" placeholder="Für den Teig:\n250 g Mehl\n2 Eier\n1 Prise Salz"></textarea>
        <div class="row"><button class="btn" data-action="dlg-close">Abbrechen</button><button class="btn primary" data-action="paste-go"><ha-icon icon="mdi:check"></ha-icon>Übernehmen</button></div>`;
    } else if (d.type === "restore") {
      inner = `<h2>Sicherung einspielen</h2><p>Die Datei enthält ${d.data.recipes.length} Rezepte. Sollen sie zu den vorhandenen dazukommen oder das Kochbuch komplett ersetzen?</p>
        <div class="row"><button class="btn" data-action="dlg-close">Abbrechen</button><button class="btn" data-action="restore-go" data-replace="1">Alles ersetzen</button><button class="btn primary" data-action="restore-go" data-replace="0">Dazunehmen</button></div>`;
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

  async _addToShopping() {
    const r = this._recipe(this.view.id);
    let entity = this.settings.shopping_list;
    const todos = this._todoEntities();
    if (!entity || !this._hass.states[entity]) entity = todos.includes("todo.shopping_list") ? "todo.shopping_list" : todos.find((e) => /einkauf/i.test(e)) || todos[0];
    if (!entity) { this._showToast("Keine Einkaufsliste gefunden – bitte in den Einstellungen festlegen.", true); return; }
    const factor = (this.servings || r.servings) / (r.servings || 1);
    const items = (r.ingredients || []).map((i, idx) => ({ i, idx })).filter(({ i, idx }) => i.name && !this.checked.has(idx));
    try {
      for (const { i } of items) {
        const amt = [scaleAmount(i.amount, factor), i.unit].filter(Boolean).join(" ");
        await this._hass.callService("todo", "add_item", { item: amt ? `${i.name} (${amt})` : i.name }, { entity_id: entity });
      }
      const listName = this._hass.states[entity]?.attributes?.friendly_name || entity;
      this._showToast(`${items.length} ${items.length === 1 ? "Zutat" : "Zutaten"} auf „${listName}“`);
    } catch (err) {
      this._showToast(`Einkaufsliste: ${err.message || err}`, true);
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
      <div class="cols"><div><h2>Zutaten</h2><ul>${ing}</ul></div><div><h2>Zubereitung</h2><ol>${(r.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ""}</div></div>
      <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  }

  async _export() {
    try {
      const data = await this._hass.callWS({ type: "kochbuch/export" });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kochbuch-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) { this._showToast(`Sicherung fehlgeschlagen: ${err.message || err}`, true); }
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
      case "import": this.dialog = { type: "import" }; this._focusSel = "#import-url"; this.render(); break;
      case "dlg-close": this.dialog = null; this.render(); break;
      case "import-go": {
        const url = this.shadowRoot.querySelector("#import-url").value.trim();
        this.dialog = { type: "import", url, busy: true }; this.render();
        try {
          const recipe = await this._hass.callWS({ type: "kochbuch/import_url", url });
          this.dialog = null;
          this._pendingImport = recipe;
          this.draft = null;
          this._navigatedInside = true;
          this._go("neu");
          this._showToast("Rezept übernommen – prüft und speichert es.");
        } catch (err) {
          this.dialog = { type: "import", url, error: err.message || String(err) }; this.render();
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
      case "check": { if (this.checked.has(idx)) this.checked.delete(idx); else this.checked.add(idx); this.render(); break; }
      case "shop": this._addToShopping(); break;
      case "print": this._print(); break;
      case "cook": this.cook = { id: this.view.id, index: 0 }; this._requestWake(); this.render(); break;
      case "cook-close": this.cook = null; this._releaseWake(); this.render(); break;
      case "cook-prev": this.cook.index = Math.max(0, this.cook.index - 1); this.render(); break;
      case "cook-next": { const r = this._recipe(this.cook.id); this.cook.index = Math.min(r.steps.length - 1, this.cook.index + 1); this.render(); break; }
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
      case "step-add": this._readDraft(); this.draft.steps.push(""); this._focusSel = `[data-srow="${this.draft.steps.length - 1}"] textarea`; this.render(); break;
      case "step-del": this._readDraft(); this.draft.steps.splice(idx, 1); this.render(); break;
      case "step-up": this._readDraft(); this._move(this.draft.steps, idx, -1); this.render(); break;
      case "step-down": this._readDraft(); this._move(this.draft.steps, idx, 1); this.render(); break;
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
        const j = idx + (a === "cat-up" ? -1 : 1);
        this._move(this.settingsDraft.categories, idx, a === "cat-up" ? -1 : 1);
        this._flashCat = j;
        this._focusSel = `[data-cat="${j}"] [data-action="${a}"]:not([disabled])`;
        this.render();
        break;
      }
      case "cat-del": {
        this._readSettings();
        const c = this.settingsDraft.categories[idx];
        const n = this.recipes.filter((r) => r.category === c.id).length;
        if (n) { this.dialog = { type: "cat-del", idx, name: c.name, n }; this.render(); }
        else { this.settingsDraft.categories.splice(idx, 1); this.render(); }
        break;
      }
      case "cat-del-confirm": this.settingsDraft.categories.splice(this.dialog.idx, 1); this.dialog = null; this.render(); break;
      case "settings-save": {
        this._readSettings();
        this.settingsDraft.categories = this.settingsDraft.categories.filter((c) => c.name.trim());
        try {
          this.settings = await this._hass.callWS({ type: "kochbuch/settings", settings: this.settingsDraft });
          this._showToast("Einstellungen gespeichert");
          this._go("", true);
        } catch (err) { this._showToast(`Fehler: ${err.message || err}`, true); }
        break;
      }
      case "export": this._export(); break;
      case "restore-go": {
        const data = this.dialog.data; const replace = el.dataset.replace === "1";
        this.dialog = null;
        try {
          const res = await this._hass.callWS({ type: "kochbuch/import_backup", data, replace });
          const fresh = await this._hass.callWS({ type: "kochbuch/data" });
          this._setData(fresh);
          this.settingsDraft = JSON.parse(JSON.stringify(this.settings));
          this._showToast(`${res.imported} Rezepte eingespielt`);
        } catch (err) { this._showToast(`Einspielen fehlgeschlagen: ${err.message || err}`, true); }
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
      if (this.view.name === "home" && was !== !!this.search.trim()) { this._focusSel = "#search"; this.render(); return; }
      const grid = this.shadowRoot.querySelector("#grid");
      if (grid) grid.innerHTML = this._renderCards();
      const rc = this.shadowRoot.querySelector("#result-count");
      if (rc) rc.textContent = this._resultLabel();
    }
  }

  async _onChange(e) {
    const t = e.target;
    if (t.dataset && (t.dataset.c === "color" || t.dataset.c === "icon")) {
      const row = t.closest(".cat-row"); const prev = row && row.querySelector(".prev");
      if (prev && t.dataset.c === "color") prev.style.background = t.value;
      if (prev && t.dataset.c === "icon") prev.querySelector("ha-icon").setAttribute("icon", t.value);
      return;
    }
    if (t.id === "sort") { this.sort = t.value; localStorage.setItem("kochbuch-sort", t.value); this.render(); }
    else if (t.id === "img-file" && t.files?.[0]) this._uploadImage(t.files[0]);
    else if (t.id === "backup-file" && t.files?.[0]) {
      this._readSettings();
      try {
        const data = JSON.parse(await t.files[0].text());
        if (!Array.isArray(data.recipes)) throw new Error("Keine Kochbuch-Sicherung");
        this.dialog = { type: "restore", data }; this.render();
      } catch (err) { this._showToast(`Datei unlesbar: ${err.message || err}`, true); }
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
    if ((e.key === "Enter" || e.key === " ") && t.matches?.(".card, .ing")) { e.preventDefault(); t.click(); }
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
