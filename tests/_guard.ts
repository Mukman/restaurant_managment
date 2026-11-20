// Import this first in every test file. Tests create shops, users and sales, so they must never run
// against the real database. They only run against the database named in TEST_DATABASE_URL.
import "dotenv/config";

const test = process.env.TEST_DATABASE_URL;
const real = process.env.DATABASE_URL;

if (!test) {
  throw new Error(
    "Set TEST_DATABASE_URL to a throwaway Postgres database before running tests " +
      "(for example a local one). Tests never use DATABASE_URL, to protect your real data.",
  );
}
if (test === real) {
  throw new Error("TEST_DATABASE_URL must not be the same as DATABASE_URL (your real database).");
}
process.env.DATABASE_URL = test;
