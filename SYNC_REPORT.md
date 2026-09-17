# Solitaire Sync Report — 2026-09-17 08:15 PM ET

## Searcher pipeline
- On-market remaining: **0**
- Interested: **71** (prior ~20 + ~50 revived from Dead after URL harvest + 1 newly saved NY practice)
- Dead reduced accordingly (~95 → ~47)
- Feed save of previously-killed listings failed with unique constraint; revived via dead→interested stage moves (agent-approved)

## Special keep rules
- **WA 6 offices:** Kept BizQuest `0900a81b…` in Interested. Broker John Meyers — jmeyers@synergybb.com / (847) 533-7115. Did **not** re-save BBS twin `85ee3873…`.
- **IA Turn-key Mental Health Clinic:** Kept. Broker Benchmark Business Group — bbg@benchmarkbusinessgroup.com / 515-288-6984. Preferred listing https://www.benchmarkbusinessgroup.com/business-for-sale/turn-key-mental-health-clinic (page currently 404 — deal kept). Solitaire deduped BBS twin onto BFS card.
- **Central Florida multi-location:** Kept. Andrea & Mounir Bousaid — bousaidteam@fcbb.com / (321) 304-7322.

## Enrichment (Interested)
- Count: **71**
- With listing URL: **71**
- With broker email: **25**
- With broker phone: **26**
- With URL+email+phone: **23**
- Still missing email: **46** (honest gaps — many DealStream / BizBuySell “N/A” listings; contacts not publicly findable without NDA)
- Still missing phone: **45**

File: `/workspace/solitaire/INTERESTED_ENRICHMENT.json`

## Solitaire board
- Total cards: **132**
- Stages: {"Ping Later": 1, "CIM Received": 10, "NDA Signed": 4, "New / Reviewing Teaser": 66, "Closed": 14, "Dead / Passed": 37}
- Cards with listing URL: **129**
- Cards with broker email: **52**
- Cards with broker phone: **68**
- New / Reviewing Teaser: **66** (interested mapped here unless already further along)
- app.js/CSS updated to show broker email on cards + drawer
- Cache-bust: `?v=20260917i`

## Live site
- https://patelshamamd-rgb.github.io/solitaire/?v=20260917i
- Repo: patelshamamd-rgb/solitaire

## Notes
- Gmail: not used for send (read/draft only rule respected; no drafts created this run).
- Dead listing ≠ dead deal: 404 Benchmark page kept with contacts on card.
