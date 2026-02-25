// ============================================================
// /api/sync — Sync games + boxscores to Supabase
// ============================================================
// Usage:
//   /api/sync?code=J&seasonCode=JTA25
//   /api/sync?code=E&season=2025
//   /api/sync?code=J&seasonCode=JTA25&games=1,2,3
//   /api/sync?code=J&seasonCode=JTA25&skipBoxscores=true
//
// Flow:
//   1. Fetch game list from EuroLeague
//   2. Upsert games into Supabase live_games table
//   3. For finished/live games, fetch boxscores
//   4. Upsert player stats into Supabase player_stats table
//   5. Supabase Realtime pushes all changes via WebSocket
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
  if (!key) throw new Error("SUPABASE_SERVICE_KEY env var not set. Add it in Netlify → Site config → Environment variables.");
  return key;
}

// Supabase upsert helper
async function supabaseUpsert(table, rows, serviceKey) {
  if (rows.length === 0) return { ok: true, count: 0 };
  
  const batchSize = 50;
  let total = 0;
  let errors = [];
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify(batch),
    });
    
    if (res.ok) {
      total += batch.length;
    } else {
      const errText = await res.text();
      errors.push(`${table} batch ${Math.floor(i/batchSize)+1}: ${res.status} — ${errText}`);
    }
  }
  
  return { ok: errors.length === 0, count: total, errors };
}

// ============================================================
// TRANSFORM: Game → live_games row
// ============================================================
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
    venue_name:      game.venue?.name || null,
    audience:        game.audience || null,
    raw_data:        game,
    synced_at:       new Date().toISOString(),
  };
}

// ============================================================
// TRANSFORM: Boxscore player → player_stats row
// ============================================================
function parseMinutes(minStr) {
  // "25:30" → 25.5
  if (!minStr || typeof minStr !== "string") return 0;
  const parts = minStr.split(":");
  if (parts.length === 2) {
    return parseFloat(parts[0]) + parseFloat(parts[1]) / 60;
  }
  return parseFloat(minStr) || 0;
}

function transformPlayerStats(player, gameInfo, teamInfo, isLocal) {
  return {
    game_code:              gameInfo.gameCode,
    season_code:            gameInfo.seasonCode,
    competition:            gameInfo.competition,
    round:                  gameInfo.round || null,
    game_date:              gameInfo.gameDate || null,
    
    team_code:              teamInfo.code || null,
    team_name:              teamInfo.name || null,
    team_tv_code:           teamInfo.tvCode || null,
    is_local:               isLocal,
    
    person_code:            player.personCode || player.code || null,
    player_name:            player.name || null,
    player_alias:           player.alias || null,
    dorsal:                 player.dorsal || null,
    position:               player.position || null,
    is_starter:             player.isStarter ?? false,
    
    minutes:                player.minutes || player.timePlayed || null,
    minutes_decimal:        parseMinutes(player.minutes || player.timePlayed),
    
    points:                 player.score ?? player.points ?? 0,
    field_goals_made:       player.fieldGoalsMade2 + player.fieldGoalsMade3 ?? player.fieldGoalsMade ?? 0,
    field_goals_attempted:  player.fieldGoalsAttempted2 + player.fieldGoalsAttempted3 ?? player.fieldGoalsAttempted ?? 0,
    two_points_made:        player.fieldGoalsMade2 ?? player.twoPointsMade ?? 0,
    two_points_attempted:   player.fieldGoalsAttempted2 ?? player.twoPointsAttempted ?? 0,
    three_points_made:      player.fieldGoalsMade3 ?? player.threePointsMade ?? 0,
    three_points_attempted: player.fieldGoalsAttempted3 ?? player.threePointsAttempted ?? 0,
    free_throws_made:       player.freeThrowsMade ?? 0,
    free_throws_attempted:  player.freeThrowsAttempted ?? 0,
    
    offensive_rebounds:     player.offensiveRebounds ?? 0,
    defensive_rebounds:     player.defensiveRebounds ?? 0,
    total_rebounds:         player.totalRebounds ?? (player.offensiveRebounds ?? 0) + (player.defensiveRebounds ?? 0),
    
    assists:                player.assists ?? player.assistances ?? 0,
    turnovers:              player.turnovers ?? 0,
    steals:                 player.steals ?? 0,
    
    blocks_favour:          player.blocksFavour ?? player.blocks ?? 0,
    blocks_against:         player.blocksAgainst ?? 0,
    
    fouls_committed:        player.foulsCommitted ?? 0,
    fouls_received:         player.foulsReceived ?? 0,
    
    pir:                    player.valuation ?? player.pir ?? 0,
    plus_minus:             player.plusMinus ?? 0,
    
    raw_data:               player,
    synced_at:              new Date().toISOString(),
  };
}

// ============================================================
// EXTRACT PLAYERS FROM BOXSCORE RESPONSE
// (Handles multiple possible response structures)
// ============================================================
function extractPlayers(boxscore, gameCode, seasonCode, competition, round, gameDate) {
  const players = [];
  const gameInfo = { gameCode, seasonCode, competition, round, gameDate };
  
  // Try different response structures
  // Structure 1: { local: { players: [...] }, road: { players: [...] } }
  // Structure 2: { stats: { local: { players: [...] }, road: { players: [...] } } }
  // Structure 3: { playersStats: [...] } with team info per player
  
  const data = boxscore?.stats || boxscore;
  
  // Extract local/home players
  const localPlayers = data?.local?.players || data?.local?.playersStats || [];
  const localTeam = {
    code: data?.local?.club?.code || data?.local?.team?.code,
    name: data?.local?.club?.editorialName || data?.local?.team?.name,
    tvCode: data?.local?.club?.tvCode || data?.local?.team?.tvCode,
  };
  
  for (const p of localPlayers) {
    if (p.personCode || p.code) {
      players.push(transformPlayerStats(p, gameInfo, localTeam, true));
    }
  }
  
  // Extract road/away players
  const roadPlayers = data?.road?.players || data?.road?.playersStats || [];
  const roadTeam = {
    code: data?.road?.club?.code || data?.road?.team?.code,
    name: data?.road?.club?.editorialName || data?.road?.team?.name,
    tvCode: data?.road?.club?.tvCode || data?.road?.team?.tvCode,
  };
  
  for (const p of roadPlayers) {
    if (p.personCode || p.code) {
      players.push(transformPlayerStats(p, gameInfo, roadTeam, false));
    }
  }
  
  return players;
}

// ============================================================
// MAIN HANDLER
// ============================================================
export default async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const startTime = Date.now();
  
  try {
    const params = getParams(req);
    const { code = "E", games: gamesFilter, skipBoxscores } = params;
    const seasonCode = getSeasonCode(params);
    const serviceKey = getSupabaseKey();
    const doBoxscores = skipBoxscores !== "true" && skipBoxscores !== "1";
    
    // ==========================================
    // STEP 1: Fetch all games
    // ==========================================
    const gamesData = await euroFetch(
      `/competitions/${code.toUpperCase()}/seasons/${seasonCode}/games`
    );
    
    let gamesList = Array.isArray(gamesData) ? gamesData : (gamesData.data || gamesData);
    if (!Array.isArray(gamesList)) {
      return errorResponse("Unexpected API response format", 500);
    }
    
    if (gamesFilter) {
      const filterSet = new Set(gamesFilter.split(",").map(g => parseInt(g.trim())));
      gamesList = gamesList.filter(g => filterSet.has(g.gameCode));
    }
    
    // ==========================================
    // STEP 2: Upsert games to Supabase
    // ==========================================
    const gameRows = gamesList.map(g => transformGame(g, seasonCode, code.toUpperCase()));
    const gamesResult = await supabaseUpsert("live_games", gameRows, serviceKey);
    
    // ==========================================
    // STEP 3: Fetch boxscores for live/finished games
    // ==========================================
    let boxscoreStats = { fetched: 0, players: 0, errors: [] };
    
    if (doBoxscores) {
      // Only fetch boxscores for games that are played or live
      const eligibleGames = gamesList.filter(g => 
        g.played === true || 
        g.gameStatus === "Played" || 
        g.gameStatus === "Live" || 
        g.gameStatus === "Playing"
      );
      
      // Fetch boxscores in parallel (max 5 at a time to be nice to the API)
      const concurrency = 5;
      let allPlayerRows = [];
      
      for (let i = 0; i < eligibleGames.length; i += concurrency) {
        const batch = eligibleGames.slice(i, i + concurrency);
        
        const boxscoreResults = await Promise.allSettled(
          batch.map(async (game) => {
            try {
              const bs = await euroFetch(
                `/competitions/${code.toUpperCase()}/seasons/${seasonCode}/games/${game.gameCode}/boxscore`
              );
              return { gameCode: game.gameCode, boxscore: bs, game };
            } catch (err) {
              return { gameCode: game.gameCode, error: err.message };
            }
          })
        );
        
        for (const result of boxscoreResults) {
          if (result.status === "fulfilled") {
            const { gameCode, boxscore, game, error } = result.value;
            if (error) {
              boxscoreStats.errors.push(`Game ${gameCode}: ${error}`);
              continue;
            }
            
            boxscoreStats.fetched++;
            const playerRows = extractPlayers(
              boxscore,
              gameCode,
              seasonCode,
              code.toUpperCase(),
              game.round,
              game.utcDate || game.date
            );
            allPlayerRows.push(...playerRows);
          }
        }
      }
      
      // ==========================================
      // STEP 4: Upsert player stats to Supabase
      // ==========================================
      if (allPlayerRows.length > 0) {
        const psResult = await supabaseUpsert("player_stats", allPlayerRows, serviceKey);
        boxscoreStats.players = psResult.count;
        if (psResult.errors.length > 0) {
          boxscoreStats.errors.push(...psResult.errors);
        }
      }
    }
    
    const elapsed = Date.now() - startTime;
    
    return jsonResponse({
      success: true,
      seasonCode,
      competition: code.toUpperCase(),
      games: {
        found: gamesList.length,
        upserted: gamesResult.count,
        errors: gamesResult.errors?.length > 0 ? gamesResult.errors : undefined,
      },
      boxscores: doBoxscores ? {
        eligible: gamesList.filter(g => g.played || g.gameStatus === "Live" || g.gameStatus === "Playing").length,
        fetched: boxscoreStats.fetched,
        playersUpserted: boxscoreStats.players,
        errors: boxscoreStats.errors.length > 0 ? boxscoreStats.errors : undefined,
      } : "skipped",
      elapsed: `${elapsed}ms`,
      timestamp: new Date().toISOString(),
    });
    
  } catch (err) {
    return errorResponse(`Sync failed: ${err.message}`, 500);
  }
};
