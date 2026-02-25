// /api/standings — Competition Standings
// Usage: /api/standings?season=2025&code=E
//        /api/standings?code=J&seasonCode=JA25
import { handleCors, jsonResponse, errorResponse, euroFetch, cache, getParams, getSeasonCode } from "./utils.js";
const CACHE_TTL = 300;
export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  try {
    const params = getParams(req);
    const { code = "E" } = params;
    const seasonCode = getSeasonCode(params);
    const cacheKey = `standings:${seasonCode}`;
    const cached = cache.get(cacheKey);
    if (cached) return jsonResponse(cached, 200, { "X-Cache": "HIT" });
    const data = await euroFetch(`/competitions/${code.toUpperCase()}/seasons/${seasonCode}/standings`);
    const enriched = { ...data, _meta: { source: "bball-api", cachedAt: new Date().toISOString(), params: { code, seasonCode } } };
    cache.set(cacheKey, enriched, CACHE_TTL);
    return jsonResponse(enriched, 200, { "X-Cache": "MISS" });
  } catch (err) {
    return errorResponse(`Failed to fetch standings: ${err.message}`, 502);
  }
};
