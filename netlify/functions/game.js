// ============================================================
// /api/game — Game Data Endpoint
// ============================================================
// Usage:
//   /api/game?season=2025&code=E&gameNumber=1
//   /api/game?season=2025&code=U&gameNumber=15
//
// Params:
//   season     — Season year (default: 2025)
//   code       — Competition code: E (EuroLeague), U (EuroCup)
//   gameNumber — Game number (required)
// ============================================================

import {
  handleCors,
  jsonResponse,
  errorResponse,
  euroFetch,
  cache,
  getParams,
  buildSeasonCode,
} from "./utils.js";

const CACHE_TTL = 60;

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const { season = "2025", code = "E", gameNumber } = getParams(req);

    if (!gameNumber) {
      return errorResponse("Missing required param: gameNumber", 400);
    }

    const seasonCode = buildSeasonCode(code, season);
    const cacheKey = `game:${seasonCode}:${gameNumber}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    const data = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${seasonCode}/games/${gameNumber}`
    );

    const enriched = {
      ...data,
      _meta: {
        source: "bball-api",
        cachedAt: new Date().toISOString(),
        params: { season, code, seasonCode, gameNumber },
      },
    };

    cache.set(cacheKey, enriched, CACHE_TTL);
    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch game data: ${err.message}`, 502);
  }
};
