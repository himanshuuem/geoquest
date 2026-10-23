import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { MODES, flagEmoji, signState, verifyState } from "./quiz.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_RECENT = 15;

export function createApp({ repo, secret }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  app.use(express.static(path.join(root, "public")));
  app.use(express.urlencoded({ extended: false, limit: "2kb" }));
  app.locals.flagEmoji = flagEmoji;

  const modeFrom = (value) => (MODES.includes(value) ? value : "capitals");

  async function renderQuestion(res, state, feedback = null) {
    const question = await repo.question(state.recent);
    state.questionId = question.answer.id;
    res.render("play", {
      mode: state.mode,
      streak: state.streak,
      feedback,
      question,
      token: signState(state, secret),
    });
  }

  app.get("/", async (req, res, next) => {
    try {
      const boards = Object.fromEntries(await Promise.all(MODES.map(async (m) => [m, await repo.leaderboard(m, 5)])));
      res.render("home", { boards });
    } catch (error) {
      next(error);
    }
  });

  app.get("/play/:mode", async (req, res, next) => {
    try {
      await renderQuestion(res, { mode: modeFrom(req.params.mode), streak: 0, recent: [] });
    } catch (error) {
      next(error);
    }
  });

  app.post("/answer", async (req, res, next) => {
    try {
      const state = verifyState(req.body.token, secret);
      if (!state) return res.status(400).render("error", { message: "That game session is invalid. Start a new round." });

      const correct = await repo.country(state.questionId);
      const guessId = Number(req.body.choice);
      if (guessId === correct.id) {
        state.streak += 1;
        state.recent = [...state.recent, correct.id].slice(-MAX_RECENT);
        return renderQuestion(res, state, { ok: true, text: `Correct! ${flagEmoji(correct.code)} ${correct.capital} is the capital of ${correct.name}.` });
      }
      const guess = Number.isInteger(guessId) ? await repo.country(guessId) : null;
      res.render("gameover", {
        mode: state.mode,
        streak: state.streak,
        correct,
        guess,
        token: signState({ final: true, mode: state.mode, streak: state.streak }, secret),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/scores", async (req, res, next) => {
    try {
      const state = verifyState(req.body.token, secret);
      const nickname = String(req.body.nickname ?? "").trim();
      if (!state?.final) return res.status(400).render("error", { message: "Couldn't verify that score." });
      if (nickname.length < 2 || nickname.length > 20) {
        return res.status(422).render("error", { message: "Nicknames need 2–20 characters." });
      }
      if (state.streak > 0) await repo.saveScore({ nickname, mode: state.mode, streak: state.streak });
      res.redirect(303, `/leaderboard/${state.mode}`);
    } catch (error) {
      next(error);
    }
  });

  app.get("/leaderboard/:mode", async (req, res, next) => {
    try {
      const mode = modeFrom(req.params.mode);
      res.render("leaderboard", { mode, rows: await repo.leaderboard(mode, 20) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use((req, res) => res.status(404).render("error", { message: "There's no such place on this map." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render("error", { message: "The database didn't answer. Is Postgres running and seeded? (npm run db:setup)" });
  });

  return app;
}
