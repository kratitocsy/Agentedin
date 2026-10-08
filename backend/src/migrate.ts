import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pool } from "./db.js";

const dir = path.resolve(process.cwd(), "migrations");

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await pool.query(fs.readFileSync(path.join(dir, file), "utf8"));
  console.log(`applied ${file}`);
}
await pool.end();
