// ============================================================
// SHARED UTILITIES
// Used by all Netlify Functions for consistent behavior
// ============================================================

// EuroLeague API base — v2, not v3
export const EURO_API = "https://api-live.euroleague.net/v2";

// CORS headers — allows any of your tools to call this API
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// JSON response helper
export function jsonResponse(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...extra,
    },
  });
}

// Error response helper
export function errorResponse(message, status = 500) {
  return jsonResponse({ error: message, timestamp: new Date().toISOString() }, status);
}

// Handle CORS preflight
export function handleCors(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}

// ============================================================
// BUILD SEASON CODE
// EuroLeague uses format like "E2025" or "U2025"
// (competition code + year)
// ============================================================
export function buildSeasonCode(code = "E", season = "2025") {
  return `${code.toUpperCase()}${season}`;
}

// ============================================================
// SIMPLE IN-MEMORY CACHE
// Persists across warm function invocations (same container).
// Resets on cold start — that's fine for our purposes.
// ============================================================
const _cache = new Map();

export const cache = {
  get(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      _cache.delete(key);
      return null;
    }
    return entry.data;
  },

  set(key, data, ttlSeconds = 60) {
    _cache.set(key, {
      data,
      expires: Date.now() + ttlSeconds * 1000,
      storedAt: new Date().toISOString(),
    });
  },

  has(key) {
    return this.get(key) !== null;
  },

  stats() {
    return {
      entries: _cache.size,
      keys: [..._cache.keys()],
    };
  },
};

// ============================================================
// EUROLEAGUE FETCH WRAPPER
// Handles fetching from EuroLeague API with error handling
// ============================================================
export async function euroFetch(path) {
  const url = `${EURO_API}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`EuroLeague API returned ${res.status} for ${path}`);
  }

  return res.json();
}

// Parse query params from request
export function getParams(req) {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  return params;
}
