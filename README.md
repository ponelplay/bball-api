# bball-api

Basketball Data API — a serverless proxy layer for EuroLeague data built on Netlify Functions.

Caches responses, enriches data with metadata, and provides a consistent API for all your basketball analytics tools.

## Quick Start

```bash
# 1. Clone / copy this folder into a new repo
git init && git add . && git commit -m "init bball-api"

# 2. Push to GitHub
gh repo create bball-api --public --push

# 3. Connect to Netlify
#    Go to netlify.com → Add new site → Import from GitHub → Select bball-api
#    Build settings are auto-detected from netlify.toml

# 4. Done. Your API is live at:
#    https://your-site-name.netlify.app/api/health
```

## Local Development

```bash
# Install Netlify CLI
npm install

# Run locally (serves functions + frontend)
npx netlify dev

# Your API is now at http://localhost:8888/api/health
```

## Endpoints

| Endpoint | Description | Required Params |
|---|---|---|
| `/api/health` | API status & info | — |
| `/api/game` | Game data | `gameNumber` |
| `/api/boxscore` | Game box score | `gameNumber` |
| `/api/pbp` | Play-by-play | `gameNumber` |
| `/api/standings` | Competition standings | — |
| `/api/rounds` | Round/gameday data | — |
| `/api/player` | Player profile & stats | `personCode` |

### Common Parameters

- `season` — Season year (default: `2024`)
- `code` — Competition code: `E` (EuroLeague) or `U` (EuroCup)

### Examples

```bash
# Get game data
curl https://your-site.netlify.app/api/game?season=2024&code=E&gameNumber=1

# Get standings
curl https://your-site.netlify.app/api/standings?season=2024&code=E

# Get play-by-play
curl https://your-site.netlify.app/api/pbp?season=2024&code=E&gameNumber=15

# Get player with stats
curl https://your-site.netlify.app/api/player?code=E&personCode=ABC&season=2024&stats=true
```

## Using in Your Tools

Replace direct EuroLeague API calls with your own API:

```javascript
// Before
const res = await fetch("https://api-live.euroleague.net/v3/competitions/E/seasons/2024/games/1");

// After
const res = await fetch("https://your-site.netlify.app/api/game?season=2024&code=E&gameNumber=1");
```

## Project Structure

```
bball-api/
├── netlify/
│   └── functions/
│       ├── utils.js        Shared utilities (cache, CORS, fetch wrapper)
│       ├── health.js       /api/health
│       ├── game.js         /api/game
│       ├── boxscore.js     /api/boxscore
│       ├── pbp.js          /api/pbp
│       ├── standings.js    /api/standings
│       ├── rounds.js       /api/rounds
│       └── player.js       /api/player
├── public/
│   └── index.html          API dashboard & tester
├── netlify.toml             Netlify config + URL rewrites
├── package.json
└── README.md
```

## Cache Behavior

- Game/PbP/Boxscore: 60 seconds (live data changes frequently)
- Standings/Rounds/Player: 5 minutes (less volatile)
- Cache is in-memory per function container (resets on cold start)
- Check `X-Cache: HIT/MISS` response header

## Environment Variables

If you need to add API keys later (e.g., for Supabase in Phase 3):

1. Go to Netlify Dashboard → Site → Site Configuration → Environment Variables
2. Add your variables
3. Access in functions via `process.env.YOUR_KEY`

## Next Steps

- **Phase 2**: Add more endpoints, move API keys to env vars
- **Phase 3**: Add Supabase for persistent storage (6781 historical data)
- **Phase 4**: Supabase Realtime for live game WebSocket updates
- **Phase 5**: API key auth for external users

---

Built for the 6781 ecosystem.
