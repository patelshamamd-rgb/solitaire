(() => {
  "use strict";

  const COLUMNS = [
    "New / Reviewing Teaser",
    "NDA Signed",
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

  const STORAGE_KEY = "solitaire-workspace-v2";
  const LEGACY_STAGES_KEY = "solitaire-kanban-stages-v1";
  const MS_DAY = 86400000;
  const SAVE_DEBOUNCE_MS = 300;

  /** @type {object[]} */
  let deals = [];
  /** @type {{ stages: Record<string,string>, notes: Record<string,string>, nextAction: Record<string,string>, nextDue: Record<string,string>, listingUrl: Record<string,string> }} */
  let overrides = emptyOverrides();
  /** @type {string|null} */
  let openDealId = null;
  let saveTimer = null;

  const $ = (sel) => document.querySelector(sel);

  function emptyOverrides() {
    return { stages: {}, notes: {}, nextAction: {}, nextDue: {}, listingUrl: {} };
  }

  function hasAnyOverrides() {
    return (
      Object.keys(overrides.stages).length > 0 ||
      Object.keys(overrides.notes).length > 0 ||
      Object.keys(overrides.nextAction).length > 0 ||
      Object.keys(overrides.nextDue).length > 0 ||
      Object.keys(overrides.listingUrl).length > 0
    );
  }

  function migrateLegacyStages(into) {
    try {
      const raw = localStorage.getItem(LEGACY_STAGES_KEY);
      if (!raw) return;
      const legacy = JSON.parse(raw);
      if (!legacy || typeof legacy !== "object") return;
      Object.entries(legacy).forEach(([id, stage]) => {
        if (into.stages[id]) return;
        let s = stage;
        if (s === "NDA Sent") s = "NDA Signed";
        into.stages[id] = s;
      });
    } catch {
      /* ignore */
    }
  }

  function normalizeStage(stage) {
    if (stage === "NDA Sent") return "NDA Signed";
    return COLUMNS.includes(stage) ? stage : "Backlog";
  }

  function loadOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        overrides = {
          stages: parsed.stages || {},
          notes: parsed.notes || {},
          nextAction: parsed.nextAction || {},
          nextDue: parsed.nextDue || {},
          listingUrl: parsed.listingUrl || {},
        };
      } else {
        overrides = emptyOverrides();
      }
    } catch {
      overrides = emptyOverrides();
    }
    migrateLegacyStages(overrides);
    // Normalize any legacy NDA Sent in stages
    Object.keys(overrides.stages).forEach((id) => {
      if (overrides.stages[id] === "NDA Sent") overrides.stages[id] = "NDA Signed";
    });
    persistOverrides(false);
  }

  function persistOverrides(updateChip = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    if (updateChip) updateSavedChip();
  }

  function updateSavedChip() {
    const chip = $("#saved-chip");
    if (!chip) return;
    chip.hidden = !hasAnyOverrides();
  }

  function getStage(deal) {
    const id = deal["Deal ID"];
    const stage = overrides.stages[id] || deal["Current Kanban Stage"] || "Backlog";
    return normalizeStage(stage);
  }

  function setStage(dealId, stage) {
    overrides.stages[dealId] = normalizeStage(stage);
    persistOverrides();
  }

  function getNotes(deal) {
    const id = deal["Deal ID"];
    if (Object.prototype.hasOwnProperty.call(overrides.notes, id)) return overrides.notes[id];
    return deal["Most Recent Note"] || deal["Full Notes Log"] || "";
  }

  function getNextAction(deal) {
    const id = deal["Deal ID"];
    if (Object.prototype.hasOwnProperty.call(overrides.nextAction, id)) return overrides.nextAction[id];
    return deal["Next Action"] || "";
  }

  function getNextDue(deal) {
    const id = deal["Deal ID"];
    if (Object.prototype.hasOwnProperty.call(overrides.nextDue, id)) return overrides.nextDue[id];
    const raw = deal["Next Action Due Date"] || "";
    if (!raw) return "";
    // Normalize to YYYY-MM-DD for date inputs
    const d = parseDate(raw);
    if (!d) return "";
    return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  }

  function firstHttp(val) {
    if (!val) return null;
    const first = String(val)
      .split(/[\s,]+/)
      .find((s) => /^https?:\/\//i.test(s));
    return first || null;
  }

  /** Listing URL: override → Searcher OS Deal Link → first http in Source Document Links */
  function listingUrl(deal) {
    const id = deal["Deal ID"];
    const fromOverride = overrides.listingUrl[id];
    if (fromOverride) return firstHttp(fromOverride) || fromOverride;
    return (
      firstHttp(deal["Searcher OS Deal Link"]) ||
      firstHttp(deal["Source Document Links"]) ||
      null
    );
  }

  function driveUrl(deal) {
    return firstHttp(deal["CIM Google Drive Link"]) || firstHttp(deal["Drive Folder Link"]) || null;
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

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function findDeal(id) {
    return deals.find((d) => d["Deal ID"] === id) || null;
  }

  function moneyFacts(deal) {
    const ebitda = deal["EBITDA"] ?? deal["Adjusted EBITDA"];
    const sde = deal["SDE"];
    const hasEbitda = ebitda != null && ebitda !== "";
    return {
      moneyLabel: hasEbitda ? "EBITDA" : "SDE",
      moneyVal: hasEbitda ? fmtMoney(ebitda) : fmtMoney(sde),
    };
  }

  function copyText(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    }
    return Promise.resolve(false);
  }

  function createCard(deal) {
    const el = document.createElement("article");
    const tier = deal["Priority Tier"] || "Backlog";
    const waiting = deal["Waiting On"] || "";
    const listing = listingUrl(deal);
    const drive = driveUrl(deal);
    const nextAction = getNextAction(deal);
    const due = getNextDue(deal);
    const overdue = isOverdue(due);
    const { moneyLabel, moneyVal } = moneyFacts(deal);
    const brokerName = (deal["Broker Name"] || "").trim() || "—";
    const brokerPhone = (deal["Broker Phone"] || "").trim();
    const brokerEmail = (deal["Broker Email"] || "").trim();
    const state = (deal["State"] || "").trim() || "—";

    el.className = `card ${priorityClass(tier)}`;
    el.dataset.dealId = deal["Deal ID"];
    el.dataset.priority = tier;
    el.dataset.category = deal["Deal Category"] || "";
    el.dataset.state = deal["State"] || "";
    el.dataset.waiting = waiting;
    el.setAttribute("role", "listitem");
    el.tabIndex = 0;

    const driveHtml = drive
      ? `<a class="card-link drive" href="${escapeHtml(drive)}" target="_blank" rel="noopener noreferrer">↗ Drive folder</a>`
      : "";

    const titleHtml = `<h3 class="card-name">${escapeHtml(deal["Practice Name"] || "Untitled")}</h3>`;

    let listingBlock;
    if (listing) {
      listingBlock = `
        <div class="listing-row">
          <a class="btn-listing" href="${escapeHtml(listing)}" target="_blank" rel="noopener noreferrer">Open listing ↗</a>
          <button type="button" class="btn-copy-link" data-copy="${escapeHtml(listing)}" title="Copy listing link">Copy link</button>
        </div>`;
    } else {
      const phoneLine = brokerPhone ? `<div class="broker-phone-big">${escapeHtml(brokerPhone)}</div>` : "";
      const emailLine = brokerEmail ? `<div class="broker-email-big"><a href="mailto:${escapeHtml(brokerEmail)}">${escapeHtml(brokerEmail)}</a></div>` : "";
      listingBlock = `
        <div class="broker-missing">
          <div class="broker-missing-label">No listing link — call broker</div>
          <div class="broker-name-big">${escapeHtml(brokerName)}</div>
          ${phoneLine}
          ${emailLine}
        </div>`;
    }

    el.innerHTML = `
      <div class="card-top">
        <button type="button" class="card-drag" aria-label="Drag to move stage" title="Drag to move">⋮⋮</button>
        ${titleHtml}
      </div>
      ${listingBlock}
      <div class="fact-grid">
        <div class="fact-cell"><span class="fact-label">State</span><span class="fact-value">${escapeHtml(state)}</span></div>
        <div class="fact-cell"><span class="fact-label">Revenue</span><span class="fact-value">${fmtMoney(deal["Revenue"])}</span></div>
        <div class="fact-cell"><span class="fact-label">${escapeHtml(moneyLabel)}</span><span class="fact-value">${moneyVal}</span></div>
        <div class="fact-cell fact-broker"><span class="fact-label">Broker</span><span class="fact-value">${escapeHtml(brokerName)}${brokerPhone ? " · " + escapeHtml(brokerPhone) : ""}${brokerEmail ? `<br><a class="broker-email" href="mailto:${escapeHtml(brokerEmail)}">${escapeHtml(brokerEmail)}</a>` : ""}</span></div>
      </div>
      <div class="card-row">
        <span class="label">Sub-label</span>
        <span class="value muted">${escapeHtml(deal["Sub-Stage Label"] || "—")}</span>
      </div>
      <div class="card-row">
        <span class="label">Last action</span>
        <span class="value muted">${escapeHtml(deal["Last Action"] || "—")} · ${fmtShortDate(deal["Last Action Date"])}</span>
      </div>
      ${driveHtml}
      <div class="card-row">
        <span class="label">Next</span>
        <span class="value ${overdue ? "overdue" : ""}">${escapeHtml(nextAction || "—")}${due ? " · due " + fmtShortDate(due) : ""}${overdue ? " · Overdue" : ""}</span>
      </div>
      <div class="card-id">${escapeHtml(deal["Deal ID"])}</div>
    `;

    // Copy link — stop so card click doesn't open drawer
    el.querySelectorAll(".btn-copy-link").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = btn.getAttribute("data-copy");
        copyText(url).then((ok) => {
          const prev = btn.textContent;
          btn.textContent = ok ? "Copied" : "Copy failed";
          setTimeout(() => {
            btn.textContent = prev;
          }, 1200);
        });
      });
    });

    // Plain anchors must not be hijacked — stopPropagation only so drawer doesn't open
    el.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    });

    el.addEventListener("click", (e) => {
      if (e.target.closest(".card-drag")) return;
      if (e.target.closest("a")) return;
      if (e.target.closest(".btn-copy-link")) return;
      openDrawer(deal["Deal ID"]);
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (e.target.closest("a,button,input,textarea,select")) return;
        openDrawer(deal["Deal ID"]);
      }
    });

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
      if (!sel) return;
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
  }

  function matchesFilters(card) {
    const fp = $("#filter-priority").value;
    const fc = $("#filter-category").value;
    const fs = $("#filter-state").value;
    const fw = $("#filter-waiting").value;
    if (fp && card.dataset.priority !== fp) return false;
    if (fc && card.dataset.category !== fc) return false;
    if (fs && card.dataset.state !== fs) return false;
    if (fw && card.dataset.waiting !== fw) return false;
    return true;
  }

  function syncFilterActiveState() {
    ["#filter-priority", "#filter-category", "#filter-state", "#filter-waiting"].forEach((id) => {
      const sel = $(id);
      if (sel) sel.classList.toggle("is-active", Boolean(sel.value));
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
    const next = getNextAction(top) || "no next action set";
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
    updateSavedChip();
  }

  function initSortables() {
    if (typeof Sortable === "undefined") return;
    document.querySelectorAll(".column-cards").forEach((list) => {
      if (list._sortable) {
        list._sortable.destroy();
        list._sortable = null;
      }
      list._sortable = Sortable.create(list, {
        group: "solitaire-deals",
        animation: 150,
        handle: ".card-drag",
        draggable: ".card",
        filter: "a, .btn-copy-link, .btn-listing",
        preventOnFilter: false,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        onAdd(evt) {
          const card = evt.item;
          const dealId = card.dataset.dealId;
          const stage = evt.to.dataset.stage;
          if (dealId && stage) {
            setStage(dealId, stage);
            updateColumnCounts();
            updateBanner();
            if (openDealId === dealId) {
              const sel = $("#drawer-stage");
              if (sel) sel.value = stage;
            }
          }
        },
        onUpdate() {
          updateColumnCounts();
        },
      });
    });
  }

  /* —— Drawer —— */
  function openDrawer(dealId) {
    const deal = findDeal(dealId);
    if (!deal) return;
    openDealId = dealId;
    const drawer = $("#deal-drawer");
    const backdrop = $("#drawer-backdrop");

    $("#drawer-title").textContent = deal["Practice Name"] || "Untitled";
    $("#drawer-deal-id").textContent = dealId;

    const stageSel = $("#drawer-stage");
    stageSel.innerHTML = "";
    COLUMNS.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      stageSel.appendChild(opt);
    });
    stageSel.value = getStage(deal);

    const { moneyLabel, moneyVal } = moneyFacts(deal);
    const brokerName = (deal["Broker Name"] || "").trim() || "—";
    const brokerPhone = (deal["Broker Phone"] || "").trim();
    const brokerEmail = (deal["Broker Email"] || "").trim();
    $("#drawer-facts").innerHTML = `
      <div class="fact-cell"><span class="fact-label">State</span><span class="fact-value">${escapeHtml((deal["State"] || "").trim() || "—")}</span></div>
      <div class="fact-cell"><span class="fact-label">Revenue</span><span class="fact-value">${fmtMoney(deal["Revenue"])}</span></div>
      <div class="fact-cell"><span class="fact-label">${escapeHtml(moneyLabel)}</span><span class="fact-value">${moneyVal}</span></div>
      <div class="fact-cell fact-broker"><span class="fact-label">Broker</span><span class="fact-value">${escapeHtml(brokerName)}${brokerPhone ? " · " + escapeHtml(brokerPhone) : ""}${brokerEmail ? `<br><a class="broker-email" href="mailto:${escapeHtml(brokerEmail)}">${escapeHtml(brokerEmail)}</a>` : ""}</span></div>
    `;

    const listing = listingUrl(deal);
    const actions = $("#drawer-listing-actions");
    const brokerBig = $("#drawer-broker-big");
    if (listing) {
      actions.innerHTML = `
        <a class="btn-listing drawer-open-listing" href="${escapeHtml(listing)}" target="_blank" rel="noopener noreferrer">Open listing ↗</a>
        <button type="button" class="btn-copy-link" id="drawer-copy-link">Copy link</button>
      `;
      brokerBig.hidden = true;
      brokerBig.innerHTML = "";
      const copyBtn = $("#drawer-copy-link");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          copyText(listing).then((ok) => {
            copyBtn.textContent = ok ? "Copied" : "Copy failed";
            setTimeout(() => {
              copyBtn.textContent = "Copy link";
            }, 1200);
          });
        });
      }
    } else {
      actions.innerHTML = `<span class="btn-listing disabled">No listing link</span>`;
      brokerBig.hidden = false;
      brokerBig.innerHTML = `
        <div class="broker-missing-label">Call the broker</div>
        <div class="broker-name-big">${escapeHtml(brokerName)}</div>
        ${brokerPhone ? `<div class="broker-phone-big">${escapeHtml(brokerPhone)}</div>` : ""}
        ${brokerEmail ? `<div class="broker-email-big"><a href="mailto:${escapeHtml(brokerEmail)}">${escapeHtml(brokerEmail)}</a></div>` : ""}
      `;
    }

    $("#drawer-next-action").value = getNextAction(deal);
    $("#drawer-next-due").value = getNextDue(deal);
    $("#drawer-notes").value = getNotes(deal);

    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    document.body.classList.add("drawer-open");
  }

  function closeDrawer() {
    openDealId = null;
    const drawer = $("#deal-drawer");
    const backdrop = $("#drawer-backdrop");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
    document.body.classList.remove("drawer-open");
  }

  function scheduleFieldSave(fn) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fn();
      persistOverrides();
      // Refresh card content for open deal without full board rebuild when possible
      refreshOpenCard();
      updateBanner();
    }, SAVE_DEBOUNCE_MS);
  }

  function refreshOpenCard() {
    if (!openDealId) return;
    const deal = findDeal(openDealId);
    if (!deal) return;
    const existing = document.querySelector(`.card[data-deal-id="${CSS.escape(openDealId)}"]`);
    if (!existing) return;
    const parent = existing.parentElement;
    const next = createCard(deal);
    if (existing.classList.contains("hidden")) next.classList.add("hidden");
    parent.replaceChild(next, existing);
  }

  function wireDrawer() {
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-backdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && openDealId) closeDrawer();
    });

    $("#drawer-stage").addEventListener("change", () => {
      if (!openDealId) return;
      const stage = $("#drawer-stage").value;
      setStage(openDealId, stage);
      // Move card to new column
      renderBoard();
      updateBanner();
      // Keep drawer open on same deal
      openDrawer(openDealId);
    });

    $("#drawer-next-action").addEventListener("input", () => {
      if (!openDealId) return;
      const val = $("#drawer-next-action").value;
      scheduleFieldSave(() => {
        overrides.nextAction[openDealId] = val;
      });
    });

    $("#drawer-next-due").addEventListener("change", () => {
      if (!openDealId) return;
      const val = $("#drawer-next-due").value;
      scheduleFieldSave(() => {
        overrides.nextDue[openDealId] = val;
      });
    });
    $("#drawer-next-due").addEventListener("input", () => {
      if (!openDealId) return;
      const val = $("#drawer-next-due").value;
      scheduleFieldSave(() => {
        overrides.nextDue[openDealId] = val;
      });
    });

    $("#drawer-notes").addEventListener("input", () => {
      if (!openDealId) return;
      const val = $("#drawer-notes").value;
      scheduleFieldSave(() => {
        overrides.notes[openDealId] = val;
      });
    });
  }

  function downloadBackup() {
    const merged = deals.map((d) => {
      const id = d["Deal ID"];
      return {
        ...d,
        "Current Kanban Stage": getStage(d),
        "Next Action": getNextAction(d),
        "Next Action Due Date": getNextDue(d) || d["Next Action Due Date"] || "",
        "Most Recent Note": getNotes(d),
        _listingUrl: listingUrl(d),
        _overrides: {
          stage: overrides.stages[id] || null,
          notes: Object.prototype.hasOwnProperty.call(overrides.notes, id) ? overrides.notes[id] : null,
          nextAction: Object.prototype.hasOwnProperty.call(overrides.nextAction, id)
            ? overrides.nextAction[id]
            : null,
          nextDue: Object.prototype.hasOwnProperty.call(overrides.nextDue, id) ? overrides.nextDue[id] : null,
          listingUrl: overrides.listingUrl[id] || null,
        },
      };
    });
    const payload = {
      exportedAt: new Date().toISOString(),
      storageKey: STORAGE_KEY,
      overrides,
      deals: merged,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    a.href = url;
    a.download = `solitaire-workspace-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function wireFilters() {
    ["#filter-priority", "#filter-category", "#filter-state", "#filter-waiting"].forEach((id) =>
      $(id).addEventListener("change", applyFilters)
    );
    $("#clear-filters").addEventListener("click", () => {
      ["#filter-priority", "#filter-category", "#filter-state", "#filter-waiting"].forEach((id) => {
        $(id).value = "";
      });
      applyFilters();
    });
    $("#reset-stages").addEventListener("click", () => {
      if (!confirm("Clear all workspace overrides (stages, notes, next actions) on this device?")) return;
      overrides = emptyOverrides();
      persistOverrides();
      closeDrawer();
      renderBoard();
      updateBanner();
    });
    $("#download-backup").addEventListener("click", downloadBackup);
  }

  async function boot() {
    loadOverrides();
    const res = await fetch("deals.json?v=20260917j");
    if (!res.ok) throw new Error("Failed to load deals.json");
    deals = await res.json();
    populateFilters();
    wireFilters();
    wireDrawer();
    renderBoard();
    updateBanner();
  }

  boot().catch((err) => {
    console.error(err);
    $("#hottest-deal").textContent =
      "Could not load deals.json. Serve this folder over HTTP (or open via GitHub Pages) — file:// fetch may be blocked.";
  });
})();
