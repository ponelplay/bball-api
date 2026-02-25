// ============================================================
// /api/sync — Sync games from EuroLeague API to Supabase
// ============================================================
// Usage:
//   /api/sync?code=J&seasonCode=JTA25
//   /api/sync?code=E&season=2025
//   /api/sync?code=J&seasonCode=JTA25&games=1,2,3  (specific games only)
//
// This function:
//   1. Fetches game list from EuroLeague API
//   2. Upserts each game into Supabase live_games table
//   3. Supabase Realtime pushes changes to all connected browsers
//
// Requires env var: SUPABASE_SERVICE_KEY
// ============================================================

import {
  handleCors, jsonResponse, errorResponse,
  euroFetch, getParams, getSeasonCode,
} from "./utils.js";

const SUPABASE_URL = "https://knthptmdwgzkpfopceku.supabase.co";

function getSupabaseKey() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_KEY env var not set");
  return key;
}

// Transform EuroLeague game data into our Supabase row format
function transformGame(game, seasonCode, competition) {
  return {
    game_code:       game.gameCode,
    season_code:     seasonCode,
    competition:     competition,
    identifier:      game.identifier || `${seasonCode}_${game.gameCode}`,
    round:           game.round || null,
    round_alias:     game.roundAlias || null,
    game_status:     game.gameStatus || (game.played ? "Played" : "Scheduled"),
    played:          game.played || false,
    game_date:       game.utcDate || game.date || null,
    
    // Local (home) team
    local_code:      game.local?.club?.code || null,
    local_name:      game.local?.club?.editorialName || game.local?.club?.abbreviatedName || null,
    local_full_name: game.local?.club?.name || null,
    local_tv_code:   game.local?.club?.tvCode || null,
    local_logo:      game.local?.club?.images?.crest || null,
    local_score:     game.local?.score ?? 0,
    local_q1:        game.local?.partials?.partials1 ?? null,
    local_q2:        game.local?.partials?.partials2 ?? null,
    local_q3:        game.local?.partials?.partials3 ?? null,
    local_q4:        game.local?.partials?.partials4 ?? null,
    local_ot:        game.local?.partials?.extraPeriods || {},
    
    // Road (away) team
    road_code:       game.road?.club?.code || null,
    road_name:       game.road?.club?.editorialName || game.road?.club?.abbreviatedName || null,
    road_full_name:  game.road?.club?.name || null,
    road_tv_code:    game.road?.club?.tvCode || null,
    road_logo:       game.road?.club?.images?.crest || null,
    road_score:      game.road?.score ?? 0,
    road_q1:         game.road?.partials?.partials1 ?? null,
    road_q2:         game.road?.partials?.partials2 ?? null,
    road_q3:         game.road?.partials?.partials3 ?? null,
    road_q4:         game.road?.partials?.partials4 ?? null,
    road_ot:         game.road?.partials?.extraPeriods || {},
    
    // Venue
    venue_name:      game.venue?.name || null,
    audience:        game.audience || null,
    
    // Raw data for reference
    raw_data:        game,
    synced_at:       new Date().toISOString(),
  };
}

export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const startTime = Date.now();
  
  try {
    const params = getParams(req);
    const { code = "E", games: gamesFilter } = params;
    const seasonCode = getSeasonCode(params);
    const serviceKey = getSupabaseKey();
    
    // 1. Fetch all games for the season from EuroLeague
    const gamesData = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${seasonCode}/games`
    );
    
    // Extract games array (API might return {data: [...]} or [...])
    let gamesList = Array.isArray(gamesData) ? gamesData : (gamesData.data || gamesData);
    if (!Array.isArray(gamesList)) {
      return errorResponse("Unexpected API response format", 500);
    }
    
    // Filter specific games if requested
    if (gamesFilter) {
      const filterSet = new Set(gamesFilter.split(",").map(g => parseInt(g.trim())));
      gamesList = gamesList.filter(g => filterSet.has(g.gameCode));
    }
    
    // 2. Transform all games
    const rows = gamesList.map(g => transformGame(g, seasonCode, code.toUpperCase()));
    
    // 3. Upsert to Supabase in batches of 50
    const batchSize = 50;
    let totalUpserted = 0;
    let errors = [];
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      const res = await fetch(`${SUPABASE_URL}/rest/v1/live_games`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          "Prefer": "resolution=merge-duplicates",  // UPSERT on unique constraint
        },
        body: JSON.stringify(batch),
      });
      
      if (res.ok) {
        totalUpserted += batch.length;
      } else {
        const errText = await res.text();
        errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${res.status} — ${errText}`);
      }
    }
    
    const elapsed = Date.now() - startTime;
    
    return jsonResponse({
      success: true,
      seasonCode,
      competition: code.toUpperCase(),
      gamesFound: gamesList.length,
      gamesUpserted: totalUpserted,
      errors: errors.length > 0 ? errors : undefined,
      elapsed: `${elapsed}ms`,
      timestamp: new Date().toISOString(),
    });
    
  } catch (err) {
    return errorResponse(`Sync failed: ${err.message}`, 500);
  }
};
