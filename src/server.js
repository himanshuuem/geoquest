import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createQuizRepo } from "./quiz.js";

const pool = createPool();
const secret = process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");
const port = Number(process.env.PORT ?? 3000);

const server = createApp({ repo: createQuizRepo(pool), secret }).listen(port, () => {
  console.log(`🌍 GeoQuest running at http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
}
