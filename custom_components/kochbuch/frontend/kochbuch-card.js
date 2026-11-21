/* Kochbuch – Dashboard-Karte
 * type: custom:kochbuch-card
 * mode: heute | favoriten | neu   (Standard: heute)
 * title: Überschrift (optional)
 * anzahl: Anzahl Einträge bei favoriten/neu (Standard: 4)
 */
(() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (m) => (!m ? "" : m < 60 ? `${m} Min` : m % 60 ? `${Math.floor(m / 60)} Std ${m % 60} Min` : `${m / 60} Std`);

  class KochbuchCard extends HTMLElement {
    static getStubConfig() { return { mode: "heute" }; }

    setConfig(config) {
      if (!document.getElementById("kochbuch-fonts")) {
        const l = document.createElement("link");
        l.id = "kochbuch-fonts"; l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap";
        document.head.appendChild(l);
      }
      this._config = { mode: "heute", anzahl: 4, ...config };
      if (!this.shadowRoot) {
        this.attachShadow({ mode: "open" });
        this.shadowRoot.addEventListener("click", (e) => {
          const el = e.target.closest("[data-id]");
          const path = el ? `/kochbuch/rezept/${el.dataset.id}` : e.target.closest("[data-home]") ? "/kochbuch" : null;
          if (!path) return;
          history.pushState(null, "", path);
          window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
        });
      }
      this._render();
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (first) this._load();
    }

    async _load() {
      try {
        const data = await this._hass.callWS({ type: "kochbuch/data" });
        this._data = data;
        this._render();
        this._unsub = this._hass.connection.subscribeMessage((d) => { this._data = d; this._render(); }, { type: "kochbuch/subscribe" });
      } catch (err) {
        this._error = "Kochbuch-Integration nicht gefunden";
        this._render();
      }
    }

    disconnectedCallback() {
      if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; this._hass = null; }
    }

    getCardSize() { return this._config?.mode === "heute" ? 5 : 4; }

    _cat(id) { return (this._data?.settings?.categories || []).find((c) => c.id === id); }

    _pic(r) {
      const c = this._cat(r.category);
      if (r.image) return `<img src="${esc(r.image)}" alt="" loading="lazy">`;
      return `<div class="ph" style="--c:${esc(c ? c.color : "#2F5D50")}"><ha-icon icon="${esc(c ? c.icon : "mdi:food")}"></ha-icon></div>`;
    }

    _render() {
      if (!this.shadowRoot || !this._config) return;
      const cfg = this._config;
      const recipes = (this._data?.recipes || []).slice();
      const style = `<style>
        ha-card { overflow: hidden; font-family: "Atkinson Hyperlegible", system-ui, sans-serif; }
        .head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; cursor: pointer; }
        .head h2 { margin: 0; font-family: "Bricolage Grotesque", system-ui, sans-serif; font-size: 20px; font-weight: 800; color: var(--primary-text-color); }
        .head ha-icon { color: var(--secondary-text-color); }
        .today { position: relative; cursor: pointer; aspect-ratio: 16 / 10; }
        .today img, .today .ph { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .today .shade { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(10,18,14,.85)); }
        .today .txt { position: absolute; left: 16px; right: 16px; bottom: 14px; color: #fff; }
        .today small { display: inline-block; background: #F2B134; color: #3A2A05; font-weight: 700; padding: 2px 10px; border-radius: 999px; font-size: 12px; margin-bottom: 6px; }
        .today h3 { margin: 0; font-family: "Bricolage Grotesque", system-ui, sans-serif; font-size: 26px; font-weight: 800; line-height: 1.05; }
        .today .meta { opacity: .85; font-size: 14px; margin-top: 4px; }
        .ph { display: flex; align-items: center; justify-content: center; background: var(--c); color: rgba(255,255,255,.85); }
        .ph ha-icon { --mdc-icon-size: 48px; }
        ul { list-style: none; margin: 0; padding: 0 8px 10px; }
        li { display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center; padding: 8px; border-radius: 12px; cursor: pointer; }
        li:hover { background: var(--secondary-background-color); }
        li .th { width: 56px; height: 56px; border-radius: 12px; overflow: hidden; position: relative; }
        li .th img, li .th .ph { width: 100%; height: 100%; object-fit: cover; }
        li .th .ph ha-icon { --mdc-icon-size: 26px; }
        li b { display: block; color: var(--primary-text-color); font-size: 15px; line-height: 1.2; }
        li span { color: var(--secondary-text-color); font-size: 13px; }
        li .heart { color: #E2553F; --mdc-icon-size: 18px; }
        .empty { padding: 8px 16px 18px; color: var(--secondary-text-color); }
      </style>`;

      let body = "";
      if (this._error) body = `<div class="empty">${esc(this._error)}</div>`;
      else if (!this._data) body = `<div class="empty">Lädt …</div>`;
      else if (!recipes.length) body = `<div class="empty">Noch keine Rezepte. Tippe hier, um das erste einzutragen.</div>`;
      else if (cfg.mode === "favoriten" || cfg.mode === "neu") {
        const list = cfg.mode === "favoriten"
          ? recipes.filter((r) => r.favorite).sort((a, b) => a.title.localeCompare(b.title, "de"))
          : recipes.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
        body = list.length
          ? `<ul>${list.slice(0, Number(cfg.anzahl) || 4).map((r) => {
              const c = this._cat(r.category);
              const t = (r.prep_time || 0) + (r.cook_time || 0);
              return `<li data-id="${esc(r.id)}"><div class="th">${this._pic(r)}</div><div><b>${esc(r.title)}</b><span>${[c ? esc(c.name) : "", fmt(t)].filter(Boolean).join(", ")}</span></div>${r.favorite ? `<ha-icon class="heart" icon="mdi:heart"></ha-icon>` : ""}</li>`;
            }).join("")}</ul>`
          : `<div class="empty">Noch keine Favoriten. Markiert Rezepte mit dem Herz.</div>`;
      } else {
        recipes.sort((a, b) => a.id.localeCompare(b.id));
        const d = new Date();
        const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
        const pool = recipes.filter((r) => r.favorite).length >= 5 ? recipes.filter((r) => r.favorite) : recipes;
        const r = pool[day % pool.length];
        const t = (r.prep_time || 0) + (r.cook_time || 0);
        body = `<div class="today" data-id="${esc(r.id)}">${this._pic(r)}<div class="shade"></div>
          <div class="txt"><small>Heute kochen</small><h3>${esc(r.title)}</h3>${t ? `<div class="meta">${fmt(t)}</div>` : ""}</div></div>`;
      }
      const title = cfg.title ?? (cfg.mode === "favoriten" ? "Lieblingsrezepte" : cfg.mode === "neu" ? "Neu im Kochbuch" : "Kochbuch");
      this.shadowRoot.innerHTML = `${style}<ha-card>
        <div class="head" data-home><h2>${esc(title)}</h2><ha-icon icon="mdi:chef-hat"></ha-icon></div>${body}</ha-card>`;
    }
  }

  if (!customElements.get("kochbuch-card")) customElements.define("kochbuch-card", KochbuchCard);
  window.customCards = window.customCards || [];
  if (!window.customCards.find((c) => c.type === "kochbuch-card")) {
    window.customCards.push({ type: "kochbuch-card", name: "Kochbuch", description: "Rezept des Tages, Favoriten oder neue Rezepte aus dem Kochbuch", preview: true });
  }
})();
