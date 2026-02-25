// /api/health — API Health Check
import { handleCors, jsonResponse, cache } from "./utils.js";

const ENDPOINTS = [
  { path: "/api/health", description: "This endpoint — API status and info" },
  { path: "/api/games", description: "All games for a season", params: "season, code, seasonCode" },
  { path: "/api/game", description: "Single game data", params: "season, code, seasonCode, gameNumber*" },
  { path: "/api/boxscore", description: "Game box score", params: "season, code, seasonCode, gameNumber*" },
  { path: "/api/pbp", description: "Play-by-play", params: "season, code, seasonCode, gameNumber*" },
  { path: "/api/standings", description: "Competition standings", params: "season, code, seasonCode" },
  { path: "/api/rounds", description: "Round/gameday data", params: "season, code, seasonCode, round" },
  { path: "/api/player", description: "Player profile & stats", params: "code, personCode*, seasonCode, stats" },
];

const SEASON_EXAMPLES = {
  "EuroLeague":  "code=E → season auto-builds E2025",
  "EuroCup":     "code=U → season auto-builds U2025",
  "NextGen Abu Dhabi":  "code=J&seasonCode=JA25",
  "NextGen Qualifier":  "code=J&seasonCode=JU25",
  "NextGen Bologna":    "code=J&seasonCode=JBO25",
  "NextGen Belgrade":   "code=J&seasonCode=JB25",
};

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  return jsonResponse({
    status: "ok",
    name: "bball-api",
    version: "1.2.0",
    description: "Marc's Basketball Data API",
    apiBase: "https://api-live.euroleague.net/v2",
    timestamp: new Date().toISOString(),
    endpoints: ENDPOINTS,
    seasonCodeExamples: SEASON_EXAMPLES,
    cache: cache.stats(),
    notes: "Use seasonCode param to override auto-built season (required for NextGen). Params marked with * are required.",
  });
};
