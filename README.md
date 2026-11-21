# token-radar-makefun

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sandmrk/token-radar-makefun/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sandmrk/token-radar-makefun/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from a sealed DefiLlama snapshot of 758 protocols. It scores every protocol that records no token yet — 198 rows after excluding bridges, liquid staking and other wrappers — and ranks them by implied value: TVL times the median market-cap/TVL multiple of comparable tokened protocols in the same category, adjusted by a 7-day momentum factor and a seasoning factor for time live without a token. All 40 watchlist protocols (TVL at least $50M, no token on record) are covered. Each row carries a concrete farm plan with per-step dollar costs and time estimates. The dashboard is a self-contained page (no network requests) with sortable columns, category and chain filters, search, and a per-protocol detail drawer that rebuilds the implied value from its four factors and checks it against board.json.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=786zferb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
