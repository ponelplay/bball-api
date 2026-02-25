// ============================================================
// /api/standings — Competition Standings
// ============================================================
// Usage:
//   /api/standings?season=2024&code=E
//   /api/standings?season=2024&code=U
//
// Params:
//   season — Season year (default: 2024)
//   code   — Competition code: E (EuroLeague), U (EuroCup)
//
// Returns: Current standings, cached for 5 minutes
// ============================================================

import {
  handleCors,
  jsonResponse,
  errorResponse,
  euroFetch,
  cache,
  getParams,
} from "./utils.js";

const CACHE_TTL = 300; // 5 minutes — standings don't change mid-game

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const { season = "2024", code = "E" } = getParams(req);

    const cacheKey = `standings:${season}:${code}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    const data = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${season}/standings`
    );

    const enriched = {
      ...data,
      _meta: {
        source: "bball-api",
        cachedAt: new Date().toISOString(),
        params: { season, code },
      },
    };

    cache.set(cacheKey, enriched, CACHE_TTL);

    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch standings: ${err.message}`, 502);
  }
};
