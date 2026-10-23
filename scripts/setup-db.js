import { readFile } from "node:fs/promises";
import { createPool } from "../src/db.js";

const pool = createPool();
try {
  for (const file of ["schema.sql", "seed.sql"]) {
    await pool.query(await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"));
    console.log(`✔ ran db/${file}`);
  }
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM countries");
  console.log(`✔ ${rows[0].n} countries ready`);
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
