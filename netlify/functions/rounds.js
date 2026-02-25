// ============================================================
// /api/rounds — Round/Gameday Data
// ============================================================
// Usage:
//   /api/rounds?season=2025&code=E
//   /api/rounds?season=2025&code=E&round=15
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

const CACHE_TTL = 300;

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const { season = "2025", code = "E", round } = getParams(req);

    const seasonCode = buildSeasonCode(code, season);
    const roundPath = round ? `/${round}` : "";
    const cacheKey = `rounds:${seasonCode}:${round || "all"}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    }

    const data = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${seasonCode}/rounds${roundPath}`
    );

    const enriched = {
      ...data,
      _meta: {
        source: "bball-api",
        cachedAt: new Date().toISOString(),
        params: { season, code, seasonCode, round: round || "all" },
      },
    };

    cache.set(cacheKey, enriched, CACHE_TTL);
    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch rounds: ${err.message}`, 502);
  }
};
