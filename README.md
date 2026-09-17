# Solitaire — Deal Room Kanban

Calm Notion-like dark-mode kanban for Solitaire healthcare acquisition deals. Plain static files — no build step.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Shell + daily banner + filters + board |
| `styles.css` | Notion-calm dark UI |
| `app.js` | Load deals, filters, SortableJS drag-drop, localStorage |
| `deals.json` | Seed data (copied from Solitaire master) |
| `favicon.svg` | Small column/card mark |

## Open locally

`fetch('deals.json')` needs HTTP (browsers block it on `file://`).

```bash
# from this folder
python3 -m http.server 8080
# then open http://localhost:8080/
```

Or any static server (`npx serve`, VS Code Live Server, etc.).

## GitHub Pages

1. Push this folder to a GitHub repo (as the **repo root**, or under `/docs`).
2. Repo → **Settings** → **Pages**.
3. **Source**: Deploy from a branch.
4. **Branch**: `main` (or `master`).
5. **Folder**: `/ (root)` if these files are at the repo root, or `/docs` if you put them in a `docs/` directory.
6. Save. Site URL: `https://USER.github.io/REPO/`

Relative asset paths (`styles.css`, `app.js`, `deals.json`, `favicon.svg`) work at the repo root on Pages. If you publish from a project site subdirectory other than root, keep all files together in that published folder.

## Columns (11)

1. New / Reviewing Teaser  
2. NDA Sent  
3. CIM Received  
4. Management Call Scheduled  
5. In Due Diligence  
6. LOI Submitted  
7. Under LOI  
8. Closed  
9. Dead / Passed  
10. Backlog  
11. Ping Later  

**Ping Later** is separate from **Backlog**. Denver Psychiatric Practice (`SOL-0001`) seeds into **Ping Later**.

## Behavior

- **Daily banner**: today’s date (ET), count Waiting on Me, count untouched ≥7 days (uses `Days Since Last Touch`, else Last Contact Date, else Last Action Date), hottest-deal sentence.
- **Filters**: Priority / Category / State / Waiting On / Assigned To.
- **Drag-drop**: SortableJS (CDN). Stage changes persist in `localStorage` keyed by Deal ID (`solitaire-kanban-stages-v1`). Use **Reset stages** to clear overrides and re-seed from `deals.json`.
- **Priority**: No Hot/tier tag on cards — thin left-border tint only (filter still works).
- **Waiting On**: Quiet chip (not a loud badge).

## Stack

- HTML / CSS / vanilla JS  
- [SortableJS](https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js) via CDN  
- Google Fonts: Inter  

No npm, no bundler.
