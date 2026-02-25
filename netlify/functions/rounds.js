// ============================================================
// /api/rounds — Round/Gameday Data
// ============================================================
// Usage:
//   /api/rounds?season=2024&code=E
//   /api/rounds?season=2024&code=E&round=15
//
// Params:
//   season — Season year (default: 2024)
//   code   — Competition code: E or U
//   round  — Specific round number (optional, returns all if omitted)
//
// Returns: Round(s) data with games, cached for 5 minutes
// ============================================================

import {
  handleCors,
  jsonResponse,
  errorResponse,
  euroFetch,
  cache,
  getParams,
} from "./utils.js";

const CACHE_TTL = 300;

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const { season = "2024", code = "E", round } = getParams(req);

    const roundPath = round ? `/${round}` : "";
    const cacheKey = `rounds:${season}:${code}:${round || "all"}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    const data = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${season}/rounds${roundPath}`
    );

    const enriched = {
      ...data,
      _meta: {
        source: "bball-api",
        cachedAt: new Date().toISOString(),
        params: { season, code, round: round || "all" },
      },
    };

    cache.set(cacheKey, enriched, CACHE_TTL);

    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch rounds: ${err.message}`, 502);
  }
};
