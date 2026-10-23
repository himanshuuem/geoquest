import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApp } from "../src/app.js";
import { createPool } from "../src/db.js";
import { createQuizRepo, flagEmoji, signState, verifyState, shuffle } from "../src/quiz.js";

test("flagEmoji builds regional indicators", () => {
  assert.equal(flagEmoji("in"), "🇮🇳");
});

test("signed state rejects tampering", () => {
  const token = signState({ streak: 3 }, "k");
  assert.deepEqual(verifyState(token, "k"), { streak: 3 });
  const [payload, sig] = token.split(".");
  const forged = `${Buffer.from(JSON.stringify({ streak: 99 })).toString("base64url")}.${sig}`;
  assert.equal(verifyState(forged, "k"), null);
  assert.equal(verifyState(`${payload}.${sig}`, "other"), null);
});

test("shuffle keeps every item", () => {
  assert.deepEqual(shuffle([1, 2, 3, 4]).sort(), [1, 2, 3, 4]);
});

// Database tests run when DATABASE_URL is set (CI provides a Postgres service).
describe("with PostgreSQL", { skip: !process.env.DATABASE_URL && "DATABASE_URL not set" }, () => {
  let pool;
  let server;
  let base;
  const secret = "test-secret";

  before(async () => {
    pool = createPool();
    await pool.query("DROP TABLE IF EXISTS scores, countries");
    for (const file of ["schema.sql", "seed.sql"]) await pool.query(await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"));
    server = createApp({ repo: createQuizRepo(pool), secret }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await pool?.end();
  });

  const answer = (body) => fetch(`${base}/answer`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  test("question has 4 unique options including the answer", async () => {
    const { answer: correct, options } = await createQuizRepo(pool).question();
    assert.equal(options.length, 4);
    assert.equal(new Set(options.map((o) => o.id)).size, 4);
    assert.ok(options.some((o) => o.id === correct.id));
  });

  test("a correct answer extends the streak; a wrong one ends the game", async () => {
    const page = await (await fetch(`${base}/play/capitals`)).text();
    const token = page.match(/name="token" value="([^"]+)"/)[1];
    const state = verifyState(token, secret);

    const right = await (await answer({ token, choice: state.questionId })).text();
    assert.match(right, /<strong>1<\/strong> in a row/);

    const nextToken = right.match(/name="token" value="([^"]+)"/)[1];
    const nextState = verifyState(nextToken, secret);
    const wrongId = nextState.questionId === 1 ? 2 : 1;
    const over = await (await answer({ token: nextToken, choice: wrongId })).text();
    assert.match(over, /Streak over at 1/);
  });

  test("forged tokens are rejected", async () => {
    const res = await answer({ token: "abc.def", choice: 1 });
    assert.equal(res.status, 400);
  });

  test("scores are saved and ranked", async () => {
    const token = signState({ final: true, mode: "flags", streak: 7 }, secret);
    const res = await fetch(`${base}/scores`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, nickname: "Himanshu" }),
    });
    assert.equal(res.status, 303);
    const board = await (await fetch(`${base}/leaderboard/flags`)).text();
    assert.match(board, /Himanshu/);
  });
});
