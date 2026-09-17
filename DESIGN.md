# Design notes — Quiet luxury editorial

- **Aesthetic**: Warm paper editorial board — stone `#f3f1ec` with a soft peach/blush + sage mist radial wash so the page isn’t dead flat. White cards, linen columns, terracotta accent `#c45c26` used sparingly. Not black chrome, not casino neon.
- **Wordmark**: **Fraunces** serif for “Solitaire” only — confident size, tight tracking, thin terracotta underline. Tagline tiny, uppercase, refined letter-spacing. Inter for UI.
- **Accent**: One intentional clay/terracotta — wordmark underline, banner rail, hottest-deal kicker, CIM links, focus rings, active filter edge. Soft ink blue-green reserved for “Waiting · other.”
- **Banner**: Morning brief — Fraunces date + elegant big serif numerals for stats; hottest line led by uppercase terracotta kicker. Layered soft shadow.
- **Cards (larger)**: Columns ~332px; more padding; title ~1.2rem; metrics ~1rem; row text ~0.85rem; always Revenue|SDE (EBITDA as 3rd when present); priority pills Interested/Borderline/Backlog only (never Hot); broker shows name+phone.
- **Cards**: Clearer elevation (layered soft shadow), 12px radius, more padding; **practice name** is the hero (larger, weight 700). Financial metrics sit in a soft inset “property” row (Notion callout). Thin richer priority left edge (sage / gold / rose / stone) — **no Hot/tier pills**. Hover lifts 2px.
- **Columns**: Soft weighted headers with pill counts; empty state is a quiet dashed drop zone with a small illustration-ish mark — not sad gray text alone.
- **Micro**: Borders `#ddd9d0` / `#e5e1d8`; premium terracotta focus rings; Waiting chips quiet but carefully tinted; meta chip as soft pill.
- **Unchanged**: 11 columns including Ping Later ≠ Backlog; SortableJS DnD; filters; localStorage; `deals.json`. No Hot tags on cards.
