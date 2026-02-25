// /api/player — Player Profile & Stats
// Usage: /api/player?code=E&personCode=ABC
//        /api/player?code=J&personCode=ABC&seasonCode=JA25&stats=true
import { handleCors, jsonResponse, errorResponse, euroFetch, cache, getParams, getSeasonCode } from "./utils.js";
const CACHE_TTL = 300;
export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  try {
    const params = getParams(req);
    const { code = "E", personCode, season, stats } = params;
    if (!personCode) return errorResponse("Missing required param: personCode", 400);
    const includeStats = stats === "true" || stats === "1";
    const cacheKey = `player:${code}:${personCode}:${season || "none"}:${includeStats}`;
    const cached = cache.get(cacheKey);
    if (cached) return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    const profile = await euroFetch(`/competitions/${code.toUpperCase()}/persons/${personCode}`);
    let result = { profile };
    if (includeStats && (season || params.seasonCode)) {
      const seasonCode = getSeasonCode(params);
      try {
        const seasonStats = await euroFetch(`/competitions/${code.toUpperCase()}/seasons/${seasonCode}/people/${personCode}/stats`);
        result.seasonStats = seasonStats;
      } catch {
        result.seasonStats = null;
        result._warnings = ["Season stats not available for this player/season"];
      }
    }
    result._meta = { source: "bball-api", cachedAt: new Date().toISOString(), params: { code, personCode, includeStats } };
    cache.set(cacheKey, result, CACHE_TTL);
    return jsonResponse(result, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch player data: ${err.message}`, 502);
  }
};
