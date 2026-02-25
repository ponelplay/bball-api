// ============================================================
// /api/game — Game Data Endpoint
// ============================================================
// Usage:
//   /api/game?season=2024&code=E&gameNumber=1
//   /api/game?season=2024&code=U&gameNumber=15
//
// Params:
//   season     — Season year (default: 2024)
//   code       — Competition code: E (EuroLeague), U (EuroCup)
//   gameNumber — Game number (required)
//
// Returns: Full game data from EuroLeague API, cached for 60s
// ============================================================

import {
  handleCors,
  jsonResponse,
  errorResponse,
  euroFetch,
  cache,
  getParams,
} from "./utils.js";

const CACHE_TTL = 60; // seconds

export default async (req) => {
  // Handle CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const { season = "2024", code = "E", gameNumber } = getParams(req);

    // Validate required params
    if (!gameNumber) {
      return errorResponse("Missing required param: gameNumber", 400);
    }

    // Validate competition code
    if (!["E", "U"].includes(code.toUpperCase())) {
      return errorResponse("Invalid code. Use E (EuroLeague) or U (EuroCup)", 400);
    }

    // Check cache
    const cacheKey = `game:${season}:${code}:${gameNumber}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    // Fetch from EuroLeague
    const data = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${season}/games/${gameNumber}`
    );

    // Enrich with metadata
    const enriched = {
      ...data,
      _meta: {
        source: "bball-api",
        cachedAt: new Date().toISOString(),
        params: { season, code, gameNumber },
      },
    };

    // Cache it
    cache.set(cacheKey, enriched, CACHE_TTL);

    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch game data: ${err.message}`, 502);
  }
};
