import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "60 s"),
  ephemeralCache: new Map(),
});

function validate(body) {
  const { name, time, treats, kitties } = body;
  if (typeof name !== "string" || !/^[A-Z ]{1,6}$/.test(name) || name.trim().length === 0) return false;
  if (!Number.isInteger(time) || time < 30 || time > 3600) return false;
  if (!Number.isInteger(treats) || treats < 0 || treats > 38) return false;
  if (!Number.isInteger(kitties) || kitties < 0 || kitties > 14) return false;
  return true;
}

async function fetchBoards() {
  const pipe = redis.pipeline();
  pipe.zrange("lb:time", 0, 19, { withScores: true });
  pipe.zrange("lb:treats", 0, 19, { rev: true, withScores: true });
  pipe.zrange("lb:kitties", 0, 19, { rev: true, withScores: true });

  const results = await pipe.exec();

  const parseBoard = (raw) => {
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map((entry, i) => {
      try {
        // @upstash/redis returns strings or objects depending on version
        let data;
        if (typeof entry === 'string') {
          data = JSON.parse(entry);
        } else if (entry && typeof entry === 'object' && 'member' in entry) {
          data = typeof entry.member === 'string' ? JSON.parse(entry.member) : entry.member;
        } else if (entry && typeof entry === 'object') {
          data = entry;
        } else {
          return null;
        }
        return { ...data, rank: i + 1 };
      } catch {
        return null;
      }
    }).filter(Boolean);
  };

  return {
    time: parseBoard(results[0]),
    treats: parseBoard(results[1]),
    kitties: parseBoard(results[2]),
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    try {
      const boards = await fetchBoards();
      return res.status(200).json(boards);
    } catch (err) {
      console.error("GET error:", err);
      return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  }

  if (req.method === "POST") {
    // Rate limit
    const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
    try {
      const { success } = await ratelimit.limit(ip);
      if (!success) {
        return res.status(429).json({ error: "Too many requests" });
      }
    } catch {
      // If rate limiting fails, allow the request
    }

    const body = req.body;
    if (!body || !validate(body)) {
      return res.status(400).json({ error: "Invalid data" });
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
      pipe.zadd("lb:time", { score: time, member });
      pipe.zremrangebyrank("lb:time", 100, -1);
      pipe.zadd("lb:treats", { score: treats, member });
      pipe.zremrangebyrank("lb:treats", 0, -101);
      pipe.zadd("lb:kitties", { score: kitties, member });
      pipe.zremrangebyrank("lb:kitties", 0, -101);
      await pipe.exec();

      // Return updated boards
      const boards = await fetchBoards();
      return res.status(201).json(boards);
    } catch (err) {
      console.error("POST error:", err);
      return res.status(500).json({ error: "Failed to save score" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
