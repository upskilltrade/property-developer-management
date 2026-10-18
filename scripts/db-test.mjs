// Runs supabase/tests/*.sql against DATABASE_URL. Each file runs after _fixtures.sql inside its
// own transaction, which is always rolled back, so the database is left untouched.
// A test passes when its file runs without error; assertions raise "FAIL: ...".
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set; skipping database tests.");
  process.exit(0);
}

const dir = join(import.meta.dirname, "..", "supabase", "tests");
const fixtures = readFileSync(join(dir, "_fixtures.sql"), "utf8");
const only = process.argv[2];
const files = readdirSync(dir)
  .filter((f) => /^\d+_.*\.sql$/.test(f) && (!only || f.includes(only)))
  .sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
let failed = 0;
for (const file of files) {
  try {
    await client.query("begin");
    await client.query(fixtures);
    await client.query(readFileSync(join(dir, file), "utf8"));
    console.log(`✓ ${file}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${file}\n    ${e.message}`);
  } finally {
    await client.query("rollback").catch(() => {});
  }
}
await client.end();
console.log(`\n${files.length - failed}/${files.length} passed`);
process.exit(failed ? 1 : 0);
