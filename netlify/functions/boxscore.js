// ============================================================
// /api/boxscore — Game Box Score
// ============================================================
// Usage:
//   /api/boxscore?season=2024&code=E&gameNumber=1
//
// Params:
//   season     — Season year (default: 2024)
//   code       — Competition code: E or U
//   gameNumber — Game number (required)
//
// Returns: Box score with player stats, cached for 60s
// ============================================================

import {
  handleCors,
  jsonResponse,
  errorResponse,
  euroFetch,
  cache,
  getParams,
} from "./utils.js";

const CACHE_TTL = 60;

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const { season = "2024", code = "E", gameNumber } = getParams(req);

    if (!gameNumber) {
      return errorResponse("Missing required param: gameNumber", 400);
    }

    const cacheKey = `boxscore:${season}:${code}:${gameNumber}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    const data = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${season}/games/${gameNumber}/boxscore`
    );

    const enriched = {
      ...data,
      _meta: {
        source: "bball-api",
        cachedAt: new Date().toISOString(),
        params: { season, code, gameNumber },
      },
    };

    cache.set(cacheKey, enriched, CACHE_TTL);

    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch boxscore: ${err.message}`, 502);
  }
};
