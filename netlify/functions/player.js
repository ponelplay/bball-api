// ============================================================
// /api/player — Player Data
// ============================================================
// Usage:
//   /api/player?code=E&personCode=ABC
//   /api/player?code=E&personCode=ABC&season=2024&stats=true
//
// Params:
//   code       — Competition code: E or U
//   personCode — Player code (required)
//   season     — Season year (optional, for season-specific stats)
//   stats      — Include season stats (default: false)
//
// Returns: Player profile + optional stats, cached for 5 minutes
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
    const { code = "E", personCode, season, stats } = getParams(req);

    if (!personCode) {
      return errorResponse("Missing required param: personCode", 400);
    }

    const includeStats = stats === "true" || stats === "1";
    const cacheKey = `player:${code}:${personCode}:${season || "none"}:${includeStats}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    // Fetch player profile
    const profile = await euroFetch(
      `/competitions/${code.toUpperCase()}/persons/${personCode}`
    );

    let result = { profile };

    // Optionally fetch season stats
    if (includeStats && season) {
      try {
        const seasonStats = await euroFetch(
          `/competitions/${code.toUpperCase()}/seasons/${season}/people/${personCode}/stats`
        );
        result.seasonStats = seasonStats;
      } catch {
        result.seasonStats = null;
        result._warnings = ["Season stats not available for this player/season"];
      }
    }

    result._meta = {
      source: "bball-api",
      cachedAt: new Date().toISOString(),
      params: { code, personCode, season, includeStats },
    };

    cache.set(cacheKey, result, CACHE_TTL);

    return jsonResponse(result, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch player data: ${err.message}`, 502);
  }
};
