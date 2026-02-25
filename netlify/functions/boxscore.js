// /api/boxscore — Game Box Score
// Usage: /api/boxscore?season=2025&code=E&gameNumber=1
//        /api/boxscore?code=J&seasonCode=JA25&gameNumber=1
import { handleCors, jsonResponse, errorResponse, euroFetch, cache, getParams, getSeasonCode } from "./utils.js";
const CACHE_TTL = 60;
export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  try {
    const params = getParams(req);
    const { code = "E", gameNumber } = params;
    if (!gameNumber) return errorResponse("Missing required param: gameNumber", 400);
    const seasonCode = getSeasonCode(params);
    const cacheKey = `boxscore:${seasonCode}:${gameNumber}`;
    const cached = cache.get(cacheKey);
    if (cached) return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    const data = await euroFetch(`/competitions/${code.toUpperCase()}/seasons/${seasonCode}/games/${gameNumber}/boxscore`);
    const enriched = { ...data, _meta: { source: "bball-api", cachedAt: new Date().toISOString(), params: { code, seasonCode, gameNumber } } };
    cache.set(cacheKey, enriched, CACHE_TTL);
    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch boxscore: ${err.message}`, 502);
  }
};
