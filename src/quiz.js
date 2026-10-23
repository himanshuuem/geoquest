import { createHmac, timingSafeEqual } from "node:crypto";

export const MODES = ["capitals", "flags"];

/** "IN" → 🇮🇳 (regional indicator symbols). */
export function flagEmoji(code) {
  return String(code).toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/**
 * Game state travels with the form as a signed token, so the server stays stateless
 * and players can't edit their streak or peek at / swap the question.
 */
export function signState(state, secret) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyState(token, secret) {
  const [payload, signature] = String(token ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createQuizRepo(pool) {
  return {
    /** One random country plus three distractors — preferring the same continent so it isn't too easy. */
    async question(excludeIds = []) {
      const { rows: [answer] } = await pool.query(
        "SELECT id, code, name, capital, continent FROM countries WHERE NOT (id = ANY($1::int[])) ORDER BY random() LIMIT 1",
        [excludeIds],
      );
      if (!answer) return null;
      const { rows: distractors } = await pool.query(
        `SELECT id, code, name, capital FROM countries
         WHERE id <> $1
         ORDER BY (continent = $2) DESC, random()
         LIMIT 3`,
        [answer.id, answer.continent],
      );
      return { answer, options: shuffle([answer, ...distractors]) };
    },

    async country(id) {
      const { rows } = await pool.query("SELECT id, code, name, capital FROM countries WHERE id = $1", [id]);
      return rows[0] ?? null;
    },

    async saveScore({ nickname, mode, streak }) {
      const { rows } = await pool.query(
        "INSERT INTO scores (nickname, mode, streak) VALUES ($1, $2, $3) RETURNING id",
        [nickname, mode, streak],
      );
      return rows[0].id;
    },

    async leaderboard(mode, limit = 10) {
      const { rows } = await pool.query(
        `SELECT id, nickname, streak, created_at FROM scores
         WHERE mode = $1 ORDER BY streak DESC, created_at ASC LIMIT $2`,
        [mode, limit],
      );
      return rows;
    },
  };
}
