(() => {
  "use strict";

  const COLUMNS = [
    "New / Reviewing Teaser",
    "NDA Sent",
    "CIM Received",
    "Management Call Scheduled",
    "In Due Diligence",
    "LOI Submitted",
    "Under LOI",
    "Closed",
    "Dead / Passed",
    "Backlog",
    "Ping Later",
  ];

  const STORAGE_KEY = "solitaire-kanban-stages-v1";
  const MS_DAY = 86400000;

  /** @type {object[]} */
  let deals = [];
  /** @type {Record<string, string>} */
  let stageOverrides = {};

  const $ = (sel) => document.querySelector(sel);

  function loadOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      stageOverrides = raw ? JSON.parse(raw) : {};
    } catch {
      stageOverrides = {};
    }
  }

  function saveOverrides() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stageOverrides));
  }

  function getStage(deal) {
    const id = deal["Deal ID"];
    if (stageOverrides[id]) return stageOverrides[id];
    const stage = deal["Current Kanban Stage"] || "Backlog";
    return COLUMNS.includes(stage) ? stage : "Backlog";
  }

  function setStage(dealId, stage) {
    stageOverrides[dealId] = stage;
    saveOverrides();
  }

  function fmtMoney(n) {
    if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
    const v = Number(n);
    if (v >= 1_000_000) {
      const m = v / 1_000_000;
      return "$" + (m % 1 === 0 ? m.toFixed(0) : m.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")) + "M";
    }
    if (v >= 1_000) {
      return "$" + Math.round(v / 1000) + "K";
    }
    return "$" + v.toLocaleString("en-US");
  }

  function parseDate(val) {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fmtShortDate(val) {
    const d = parseDate(val);
    if (!d) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
  }

  function startOfToday() {
    const now = new Date();
    // Compare calendar days in America/New_York
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year").value;
    const m = parts.find((p) => p.type === "month").value;
    const d = parts.find((p) => p.type === "day").value;
    return new Date(`${y}-${m}-${d}T12:00:00`);
  }

  function daysBetween(dateVal) {
    const d = parseDate(dateVal);
    if (!d) return null;
    const today = startOfToday();
    const then = new Date(
      d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + "T12:00:00"
    );
    return Math.floor((today - then) / MS_DAY);
  }

  /** Days since last touch: prefer Days Since Last Touch, else Last Contact, else Last Action Date */
  function daysSinceTouch(deal) {
    const explicit = deal["Days Since Last Touch"];
    if (explicit != null && explicit !== "" && !Number.isNaN(Number(explicit))) {
      return Number(explicit);
    }
    const fromContact = daysBetween(deal["Last Contact Date"]);
    if (fromContact != null) return fromContact;
    return daysBetween(deal["Last Action Date"]);
  }

  function isOverdue(dueVal) {
    const due = parseDate(dueVal);
    if (!due) return false;
    const today = startOfToday();
    const dueDay = new Date(
      due.toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + "T12:00:00"
    );
    return dueDay < today;
  }

  function priorityClass(tier) {
    const t = (tier || "").toLowerCase();
    if (t === "hot") return "prio-hot";
    if (t === "interested") return "prio-interested";
    if (t === "borderline") return "prio-borderline";
    return "prio-backlog";
  }

  function docLink(deal) {
    const cim = deal["CIM Google Drive Link"];
    if (cim) return { href: cim, label: "CIM / Drive" };
    const drive = deal["Drive Folder Link"];
    if (drive) return { href: drive, label: "Drive folder" };
    const src = deal["Source Document Links"] || deal["Searcher OS Deal Link"];
    if (src) {
      const first = String(src).split(/[\s,]+/).find((s) => s.startsWith("http"));
      if (first) return { href: first, label: "Listing / broker" };
    }
    return null;
  }

  function brokerLine(deal) {
    const name = deal["Broker Name"] || "—";
    if (deal["Broker Phone"]) return `${name} · ${deal["Broker Phone"]}`;
    return name;
  }

  /** Priority pill label — never show Hot (product preference). */
  function priorityPill(tier) {
    const t = (tier || "").trim();
    const lower = t.toLowerCase();
    if (lower === "hot" || !t) return null;
    if (lower === "interested") return { label: "Interested", cls: "prio-interested" };
    if (lower === "borderline") return { label: "Borderline", cls: "prio-borderline" };
    if (lower === "backlog") return { label: "Backlog", cls: "prio-backlog" };
    // Unknown non-Hot tiers still show as backlog-styled text
    return { label: t, cls: "prio-backlog" };
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createCard(deal) {
    const el = document.createElement("article");
    const tier = deal["Priority Tier"] || "Backlog";
    const waiting = deal["Waiting On"] || "";
    const waitingClass = waiting.toLowerCase() === "me" ? "waiting-me" : "waiting-other";
    const link = docLink(deal);
    const due = deal["Next Action Due Date"];
    const overdue = isOverdue(due);
    const ebitda = deal["EBITDA"] ?? deal["Adjusted EBITDA"];
    const sde = deal["SDE"];
    const prio = priorityPill(tier);

    el.className = `card ${priorityClass(tier)}`;
    el.dataset.dealId = deal["Deal ID"];
    el.dataset.priority = tier;
    el.dataset.category = deal["Deal Category"] || "";
    el.dataset.state = deal["State"] || "";
    el.dataset.waiting = waiting;
    el.dataset.assigned = deal["Assigned To"] || "";
    el.setAttribute("role", "listitem");

    const linkHtml = link
      ? `<a class="card-link" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">↗ ${escapeHtml(link.label)}</a>`
      : `<span class="card-row"><span class="label">Docs</span><span class="value muted">None</span></span>`;

    // Always 2-col Revenue | SDE; EBITDA as 3rd column when present (never collapse SDE)
    const hasEbitda = ebitda != null && ebitda !== "";
    const metricsClass = hasEbitda ? "card-metrics metrics-3" : "card-metrics";
    const ebitdaMetric = hasEbitda
      ? `<div class="metric"><span class="label">EBITDA</span><span class="value">${fmtMoney(ebitda)}</span></div>`
      : "";

    const prioHtml = prio
      ? `<span class="pill ${prio.cls}">${escapeHtml(prio.label)}</span>`
      : "";

    el.innerHTML = `
      <h3 class="card-name">${escapeHtml(deal["Practice Name"] || "Untitled")}</h3>
      <div class="pill-row">
        ${prioHtml}
        <span class="pill category">${escapeHtml(deal["Deal Category"] || "—")}</span>
        <span class="pill ${waitingClass}" title="Waiting On">${waiting.toLowerCase() === "me" ? "Waiting · Me" : "Waiting · " + escapeHtml(waiting || "—")}</span>
      </div>
      <div class="card-row">
        <span class="label">State</span>
        <span class="value">${escapeHtml(deal["State"] || "—")}</span>
      </div>
      <div class="${metricsClass}">
        <div class="metric">
          <span class="label">Revenue</span>
          <span class="value">${fmtMoney(deal["Revenue"])}</span>
        </div>
        <div class="metric">
          <span class="label">SDE</span>
          <span class="value">${fmtMoney(sde)}</span>
        </div>
        ${ebitdaMetric}
      </div>
      <div class="card-row">
        <span class="label">Broker</span>
        <span class="value muted">${escapeHtml(brokerLine(deal))}</span>
      </div>
      <div class="card-row">
        <span class="label">Sub-label</span>
        <span class="value muted">${escapeHtml(deal["Sub-Stage Label"] || "—")}</span>
      </div>
      <div class="card-row">
        <span class="label">Last action</span>
        <span class="value muted">${escapeHtml(deal["Last Action"] || "—")} · ${fmtShortDate(deal["Last Action Date"])}</span>
      </div>
      ${linkHtml}
      <div class="card-row">
        <span class="label">Next</span>
        <span class="value ${overdue ? "overdue" : ""}">${escapeHtml(deal["Next Action"] || "—")}${due ? " · due " + fmtShortDate(due) : ""}${overdue ? " · Overdue" : ""}</span>
      </div>
      <div class="card-row">
        <span class="label">Assigned</span>
        <span class="value">${escapeHtml(deal["Assigned To"] || "—")}</span>
      </div>
      <div class="card-id">${escapeHtml(deal["Deal ID"])}</div>
    `;

    return el;
  }

  function uniqueValues(key) {
    const set = new Set();
    deals.forEach((d) => {
      const v = d[key];
      if (v != null && String(v).trim() !== "") set.add(String(v));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function populateFilters() {
    const fill = (id, values) => {
      const sel = $(id);
      const current = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      values.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
      });
      sel.value = current;
    };
    fill("#filter-priority", uniqueValues("Priority Tier"));
    fill("#filter-category", uniqueValues("Deal Category"));
    fill("#filter-state", uniqueValues("State"));
    fill("#filter-waiting", uniqueValues("Waiting On"));
    fill("#filter-assigned", uniqueValues("Assigned To"));
  }

  function matchesFilters(card) {
    const fp = $("#filter-priority").value;
    const fc = $("#filter-category").value;
    const fs = $("#filter-state").value;
    const fw = $("#filter-waiting").value;
    const fa = $("#filter-assigned").value;
    if (fp && card.dataset.priority !== fp) return false;
    if (fc && card.dataset.category !== fc) return false;
    if (fs && card.dataset.state !== fs) return false;
    if (fw && card.dataset.waiting !== fw) return false;
    if (fa && card.dataset.assigned !== fa) return false;
    return true;
  }

  function syncFilterActiveState() {
    ["#filter-priority", "#filter-category", "#filter-state", "#filter-waiting", "#filter-assigned"].forEach((id) => {
      const sel = $(id);
      sel.classList.toggle("is-active", Boolean(sel.value));
    });
  }

  function applyFilters() {
    document.querySelectorAll(".card").forEach((card) => {
      card.classList.toggle("hidden", !matchesFilters(card));
    });
    syncFilterActiveState();
    updateColumnCounts();
  }

  function updateColumnCounts() {
    document.querySelectorAll(".column").forEach((col) => {
      const visible = col.querySelectorAll(".card:not(.hidden)").length;
      col.querySelector(".column-count").textContent = String(visible);
      const empty = col.querySelector(".empty-column");
      if (empty) empty.style.display = visible === 0 ? "" : "none";
    });
  }

  function hottestSentence() {
    const active = deals.filter((d) => {
      const s = getStage(d);
      return s !== "Dead / Passed" && s !== "Closed";
    });
    const tierRank = { Hot: 0, Interested: 1, Borderline: 2, Backlog: 3 };
    active.sort((a, b) => {
      const ra = tierRank[a["Priority Tier"]] ?? 9;
      const rb = tierRank[b["Priority Tier"]] ?? 9;
      if (ra !== rb) return ra - rb;
      return (Number(b["Revenue"]) || 0) - (Number(a["Revenue"]) || 0);
    });
    const top = active[0];
    if (!top) return "No active deals on the board.";
    const name = top["Practice Name"];
    const rev = fmtMoney(top["Revenue"]);
    const stage = getStage(top);
    const next = top["Next Action"] || "no next action set";
    return `<span class="hottest-kicker">Hottest deal</span> <strong>${escapeHtml(name)}</strong> · ${rev} rev · ${escapeHtml(stage)} — ${escapeHtml(next)}`;
  }

  function updateBanner() {
    const today = new Date();
    const dateStr = today.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
    $("#banner-date").textContent = dateStr + " ET";

    const waitingMe = deals.filter((d) => (d["Waiting On"] || "").toLowerCase() === "me").length;
    $("#stat-waiting-me").textContent = String(waitingMe);

    const untouched = deals.filter((d) => {
      const days = daysSinceTouch(d);
      return days != null && days >= 7;
    }).length;
    $("#stat-untouched").textContent = String(untouched);

    $("#hottest-deal").innerHTML = hottestSentence();
  }

  function renderBoard() {
    const board = $("#board");
    board.innerHTML = "";

    COLUMNS.forEach((stage) => {
      const col = document.createElement("section");
      col.className = "column";
      col.dataset.stage = stage;
      col.innerHTML = `
        <header class="column-header">
          <h2 class="column-title">${escapeHtml(stage)}</h2>
          <span class="column-count">0</span>
        </header>
        <div class="column-cards" data-stage="${escapeHtml(stage)}"></div>
      `;
      const list = col.querySelector(".column-cards");
      const empty = document.createElement("div");
      empty.className = "empty-column";
      empty.textContent = "Drop here";
      list.appendChild(empty);

      deals
        .filter((d) => getStage(d) === stage)
        .forEach((d) => list.appendChild(createCard(d)));

      board.appendChild(col);
    });

    $("#deal-count").textContent = `${deals.length} deals`;
    applyFilters();
    initSortables();
  }

  function initSortables() {
    document.querySelectorAll(".column-cards").forEach((list) => {
      // eslint-disable-next-line no-undef
      Sortable.create(list, {
        group: "solitaire-deals",
        animation: 160,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        draggable: ".card",
        filter: "a,button,select",
        preventOnFilter: false,
        onAdd(evt) {
          const card = evt.item;
          const stage = evt.to.dataset.stage;
          const id = card.dataset.dealId;
          if (id && stage) {
            setStage(id, stage);
            updateBanner();
            updateColumnCounts();
          }
        },
        onUpdate() {
          updateColumnCounts();
        },
      });
    });
  }

  function wireFilters() {
    ["#filter-priority", "#filter-category", "#filter-state", "#filter-waiting", "#filter-assigned"].forEach(
      (id) => $(id).addEventListener("change", applyFilters)
    );
    $("#clear-filters").addEventListener("click", () => {
      ["#filter-priority", "#filter-category", "#filter-state", "#filter-waiting", "#filter-assigned"].forEach(
        (id) => {
          $(id).value = "";
        }
      );
      applyFilters();
    });
    $("#reset-stages").addEventListener("click", () => {
      stageOverrides = {};
      saveOverrides();
      renderBoard();
      updateBanner();
    });
  }

  async function boot() {
    loadOverrides();
    const res = await fetch("deals.json");
    if (!res.ok) throw new Error("Failed to load deals.json");
    deals = await res.json();
    populateFilters();
    wireFilters();
    renderBoard();
    updateBanner();
  }

  boot().catch((err) => {
    console.error(err);
    $("#hottest-deal").textContent =
      "Could not load deals.json. Serve this folder over HTTP (or open via GitHub Pages) — file:// fetch may be blocked.";
  });
})();
