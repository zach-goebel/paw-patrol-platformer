import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "60 s"),
  ephemeralCache: new Map(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function parseEntries(raw) {
  const entries = [];
  for (let i = 0; i < raw.length; i += 2) {
    try {
      const data = JSON.parse(raw[i]);
      data.sortScore = Number(raw[i + 1]);
      entries.push(data);
    } catch {
      // skip malformed entries
    }
  }
  return entries;
}

async function fetchBoards() {
  const pipe = redis.pipeline();
  // Time: ascending (lowest = best)
  pipe.zrange("lb:time", 0, 19, { withScores: true });
  // Treats: descending (highest = best)
  pipe.zrange("lb:treats", 0, 19, { rev: true, withScores: true });
  // Kitties: descending (highest = best)
  pipe.zrange("lb:kitties", 0, 19, { rev: true, withScores: true });

  const results = await pipe.exec();

  // Results come as flat arrays: [member, score, member, score, ...]
  // But @upstash/redis with withScores returns [{member, score}, ...]
  // Handle both formats
  const parseBoard = (raw) => {
    if (!raw || !Array.isArray(raw)) return [];
    // @upstash/redis returns array of {member, score} objects when withScores is true
    if (raw.length > 0 && typeof raw[0] === 'object' && 'score' in raw[0]) {
      return raw.map((entry, i) => {
        try {
          const data = typeof entry.member === 'string' ? JSON.parse(entry.member) : entry.member;
          return { ...data, rank: i + 1 };
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
    // Fallback: flat array format [member, score, member, score, ...]
    const entries = [];
    for (let i = 0; i < raw.length; i += 2) {
      try {
        const data = JSON.parse(raw[i]);
        data.rank = entries.length + 1;
        entries.push(data);
      } catch {
        // skip
      }
    }
    return entries;
  };

  return {
    time: parseBoard(results[0]),
    treats: parseBoard(results[1]),
    kitties: parseBoard(results[2]),
  };
}

function validate(body) {
  const { name, time, treats, kitties } = body;
  if (typeof name !== "string" || !/^[A-Z ]{1,6}$/.test(name) || name.trim().length === 0) return false;
  if (!Number.isInteger(time) || time < 30 || time > 3600) return false;
  if (!Number.isInteger(treats) || treats < 0 || treats > 38) return false;
  if (!Number.isInteger(kitties) || kitties < 0 || kitties > 14) return false;
  return true;
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function GET() {
  try {
    const boards = await fetchBoards();
    return jsonResponse(boards);
  } catch (err) {
    return jsonResponse({ error: "Failed to fetch leaderboard" }, 500);
  }
}

export async function POST(request) {
  // Body size check
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > 512) {
    return jsonResponse({ error: "Payload too large" }, 413);
  }

  // Rate limit
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  try {
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return jsonResponse({ error: "Too many requests" }, 429);
    }
  } catch {
    // If rate limiting fails, allow the request
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!validate(body)) {
    return jsonResponse({ error: "Invalid data" }, 400);
  }

  const { name, time, treats, kitties } = body;
  const member = JSON.stringify({
    name: name.trim(),
    time,
    treats,
    kitties,
    ts: Date.now(),
  });

  try {
    const pipe = redis.pipeline();
    // Add to all three sorted sets
    pipe.zadd("lb:time", { score: time, member });
    pipe.zremrangebyrank("lb:time", 100, -1);
    pipe.zadd("lb:treats", { score: treats, member });
    pipe.zremrangebyrank("lb:treats", 0, -101);
    pipe.zadd("lb:kitties", { score: kitties, member });
    pipe.zremrangebyrank("lb:kitties", 0, -101);
    await pipe.exec();

    // Return updated boards
    const boards = await fetchBoards();
    return jsonResponse(boards, 201);
  } catch (err) {
    return jsonResponse({ error: "Failed to save score" }, 500);
  }
}
