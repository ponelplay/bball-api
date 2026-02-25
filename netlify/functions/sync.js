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

// ============================================================
// Supabase upsert helper
// KEY FIX: on_conflict parameter tells PostgREST which columns
// to use for the upsert merge (not just the primary key)
// ============================================================
async function supabaseUpsert(table, rows, serviceKey, onConflict) {
  if (rows.length === 0) return { ok: true, count: 0, errors: [] };
  
  const batchSize = 50;
  let total = 0;
  let errors = [];
  
  // Build URL with on_conflict parameter
  const conflictParam = onConflict ? `?on_conflict=${onConflict}` : "";
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${conflictParam}`, {
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
// TRANSFORM: Stats API player → player_stats row
// ============================================================
// The EuroLeague /stats endpoint returns:
//   local.players[]: { player: { person: {code,name,alias}, dorsal, position, club }, stats: { points, timePlayed, ... } }
// We flatten this into a single row for Supabase.
// ============================================================

function transformPlayerStats(entry, gameInfo, teamCode, teamName, teamTvCode, isLocal) {
  const p = entry.player || {};
  const s = entry.stats || {};
  const person = p.person || {};

  const fgm2 = s.fieldGoalsMade2 ?? 0;
  const fga2 = s.fieldGoalsAttempted2 ?? 0;
  const fgm3 = s.fieldGoalsMade3 ?? 0;
  const fga3 = s.fieldGoalsAttempted3 ?? 0;
  const timePlayed = s.timePlayed ?? 0;

  // timePlayed is decimal minutes (e.g. 25.5 = 25:30)
  const mins = Math.floor(timePlayed);
  const secs = Math.round((timePlayed - mins) * 60);
  const minutesStr = timePlayed > 0 ? (mins + ":" + (secs < 10 ? "0" : "") + secs) : "DNP";

  return {
    game_code:              gameInfo.gameCode,
    season_code:            gameInfo.seasonCode,
    competition:            gameInfo.competition,
    round:                  gameInfo.round || null,
    game_date:              gameInfo.gameDate || null,
    team_code:              teamCode,
    team_name:              teamName,
    team_tv_code:           teamTvCode,
    is_local:               isLocal,
    person_code:            person.code || null,
    player_name:            person.name || null,
    player_alias:           person.alias || null,
    dorsal:                 p.dorsal || s.dorsal?.toString() || null,
    position:               p.positionName || (p.position ? String(p.position) : null),
    is_starter:             s.startFive === true || s.startFive2 === true,
    minutes:                minutesStr,
    minutes_decimal:        timePlayed,
    points:                 s.points ?? 0,
    field_goals_made:       fgm2 + fgm3,
    field_goals_attempted:  fga2 + fga3,
    two_points_made:        fgm2,
    two_points_attempted:   fga2,
    three_points_made:      fgm3,
    three_points_attempted: fga3,
    free_throws_made:       s.freeThrowsMade ?? 0,
    free_throws_attempted:  s.freeThrowsAttempted ?? 0,
    offensive_rebounds:     s.offensiveRebounds ?? 0,
    defensive_rebounds:     s.defensiveRebounds ?? 0,
    total_rebounds:         s.totalRebounds ?? (s.offensiveRebounds ?? 0) + (s.defensiveRebounds ?? 0),
    assists:                s.assistances ?? 0,
    turnovers:              s.turnovers ?? 0,
    steals:                 s.steals ?? 0,
    blocks_favour:          s.blocksFavour ?? 0,
    blocks_against:         s.blocksAgainst ?? 0,
    fouls_committed:        s.foulsCommited ?? 0,  // typo in API: "Commited"
    fouls_received:         s.foulsReceived ?? 0,
    pir:                    s.valuation ?? 0,
    plus_minus:             s.plusMinus ?? 0,
    raw_data:               entry,
    synced_at:              new Date().toISOString(),
  };
}

// ============================================================
// EXTRACT PLAYERS FROM /stats RESPONSE
// Structure: { local: { players: [{player, stats}], team, coach }, road: { ... } }
// ============================================================
function extractPlayers(statsData, gameCode, seasonCode, competition, round, gameDate) {
  const players = [];
  const gameInfo = { gameCode, seasonCode, competition, round, gameDate };

  for (const side of ["local", "road"]) {
    const sideData = statsData?.[side];
    if (!sideData?.players) continue;

    const isLocal = side === "local";
    // Get team info from the first player's club, or from team obj
    const teamObj = sideData.team || {};
    const firstClub = sideData.players[0]?.player?.club || {};
    const teamCode = firstClub.code || teamObj.code || null;
    const teamName = firstClub.editorialName || firstClub.abbreviatedName || teamObj.name || null;
    const teamTvCode = firstClub.tvCode || teamObj.tvCode || null;

    for (const entry of sideData.players) {
      const personCode = entry.player?.person?.code;
      if (!personCode) continue; // skip entries without a player code
      // Skip coaches (type "C") — only include players (type "J")
      if (entry.player?.type && entry.player.type !== "J") continue;

      players.push(transformPlayerStats(entry, gameInfo, teamCode, teamName, teamTvCode, isLocal));
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
    
    // STEP 1: Fetch all games
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
    
    // STEP 2: Upsert games to Supabase
    // on_conflict tells PostgREST to merge on the unique constraint columns
    const gameRows = gamesList.map(g => transformGame(g, seasonCode, code.toUpperCase()));
    const gamesResult = await supabaseUpsert("live_games", gameRows, serviceKey, "season_code,game_code");
    
    // STEP 3: Fetch boxscores for live/finished games
    let boxscoreStats = { fetched: 0, players: 0, errors: [] };
    
    if (doBoxscores) {
      const eligibleGames = gamesList.filter(g => 
        g.played === true || 
        g.gameStatus === "Played" || 
        g.gameStatus === "Live" || 
        g.gameStatus === "Playing"
      );
      
      const concurrency = 5;
      let allPlayerRows = [];
      
      for (let i = 0; i < eligibleGames.length; i += concurrency) {
        const batch = eligibleGames.slice(i, i + concurrency);
        
        const boxscoreResults = await Promise.allSettled(
          batch.map(async (game) => {
            try {
              const bs = await euroFetch(
                `/competitions/${code.toUpperCase()}/seasons/${seasonCode}/games/${game.gameCode}/stats`
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
              boxscore, gameCode, seasonCode,
              code.toUpperCase(), game.round, game.utcDate || game.date
            );
            allPlayerRows.push(...playerRows);
          }
        }
      }
      
      // STEP 4: Upsert player stats
      if (allPlayerRows.length > 0) {
        const psResult = await supabaseUpsert("player_stats", allPlayerRows, serviceKey, "season_code,game_code,person_code");
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
      gamesFound: gamesList.length,
      gamesUpserted: gamesResult.count,
      boxscores: doBoxscores ? {
        eligible: gamesList.filter(g => g.played || g.gameStatus === "Live" || g.gameStatus === "Playing").length,
        fetched: boxscoreStats.fetched,
        playersUpserted: boxscoreStats.players,
        errors: boxscoreStats.errors.length > 0 ? boxscoreStats.errors.slice(0, 5) : undefined,
      } : "skipped",
      errors: gamesResult.errors?.length > 0 ? gamesResult.errors.slice(0, 5) : undefined,
      elapsed: `${elapsed}ms`,
      timestamp: new Date().toISOString(),
    });
    
  } catch (err) {
    return errorResponse(`Sync failed: ${err.message}`, 500);
  }
};
