// ============================================================
// /api/games — All Games for a Season
// ============================================================
// Usage:
//   /api/games?season=2025&code=E
//
// This is the endpoint Marc confirmed works:
//   https://api-live.euroleague.net/v2/competitions/E/seasons/E2025/games
// ============================================================

import {
  handleCors,
  jsonResponse,
  errorResponse,
  euroFetch,
  cache,
  getParams,
  getSeasonCode,
} from "./utils.js";

const CACHE_TTL = 300;

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const params = getParams(req);
    const { code = "E" } = params;
    const seasonCode = getSeasonCode(params);
    const cacheKey = `games:${seasonCode}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    const data = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${seasonCode}/games`
    );

    const enriched = {
      ...data,
      _meta: {
        source: "bball-api",
        cachedAt: new Date().toISOString(),
        params: { code, seasonCode },
      },
    };

    cache.set(cacheKey, enriched, CACHE_TTL);
    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch games: ${err.message}`, 502);
  }
};
