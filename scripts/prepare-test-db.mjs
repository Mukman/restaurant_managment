// Runs before `npm test`: makes sure the throwaway test database exists and has the latest tables.
// It refuses to touch anything except the database in TEST_DATABASE_URL.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const test = process.env.TEST_DATABASE_URL;
const real = process.env.DATABASE_URL;

if (!test) {
  console.error(
    "\nSet TEST_DATABASE_URL to a throwaway Postgres database before running tests.\n" +
      "Tests create shops and sales, so they never use DATABASE_URL (your real database).\n",
  );
  process.exit(1);
}
if (test === real) {
  console.error("\nTEST_DATABASE_URL must not be the same as DATABASE_URL (your real database).\n");
  process.exit(1);
}

const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: test },
});
process.exit(r.status ?? 1);
