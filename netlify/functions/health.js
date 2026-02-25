// ============================================================
// /api/health — API Health Check
// ============================================================
// Usage:
//   /api/health
//
// Returns: API status, available endpoints, cache stats
// Useful for monitoring and as a quick reference
// ============================================================

import { handleCors, jsonResponse, cache } from "./utils.js";

const ENDPOINTS = [
  { path: "/api/health", description: "This endpoint — API status and info" },
  { path: "/api/game", description: "Game data", params: "season, code, gameNumber*" },
  { path: "/api/boxscore", description: "Game box score", params: "season, code, gameNumber*" },
  { path: "/api/pbp", description: "Play-by-play", params: "season, code, gameNumber*" },
  { path: "/api/standings", description: "Competition standings", params: "season, code" },
  { path: "/api/rounds", description: "Round/gameday data", params: "season, code, round" },
  { path: "/api/player", description: "Player profile & stats", params: "code, personCode*, season, stats" },
];

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  return jsonResponse({
    status: "ok",
    name: "bball-api",
    version: "1.0.0",
    description: "Marc's Basketball Data API",
    timestamp: new Date().toISOString(),
    endpoints: ENDPOINTS,
    cache: cache.stats(),
    notes: "Params marked with * are required. Default season=2024, code=E.",
  });
};
