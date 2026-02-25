// ============================================================
// /api/pbp — Play-by-Play Data
// ============================================================
// Usage:
//   /api/pbp?season=2025&code=E&gameNumber=1
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
    const cacheKey = `pbp:${seasonCode}:${gameNumber}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    const data = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${seasonCode}/games/${gameNumber}/playbyplay`
    );

    const enriched = {
      ...data,
      _meta: {
        source: "bball-api",
        cachedAt: new Date().toISOString(),
        totalPlays: Array.isArray(data.data) ? data.data.length : null,
        params: { season, code, seasonCode, gameNumber },
      },
    };

    cache.set(cacheKey, enriched, CACHE_TTL);
    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch play-by-play: ${err.message}`, 502);
  }
};
