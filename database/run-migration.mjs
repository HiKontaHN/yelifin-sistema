import { readFile } from "node:fs/promises";
import { resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED no está configurada");
if (new URL(databaseUrl).hostname.includes("-pooler")) {
  throw new Error("Las migraciones requieren una conexión directa de Neon");
}

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const migrationsRoot = resolve(repoRoot, "database", "migrations");
const requestedPath = resolve(repoRoot, process.argv[2] ?? "");
const pathWithinMigrations = relative(migrationsRoot, requestedPath);
if (!process.argv[2] || pathWithinMigrations.startsWith("..") || pathWithinMigrations === "") {
  throw new Error("Indica un archivo dentro de database/migrations");
}

const migrationSql = await readFile(requestedPath, "utf8");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
let client;
try {
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query(migrationSql);
  await client.query("COMMIT");
  console.log(`Migración aplicada: ${basename(requestedPath)}`);
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client?.release();
  await pool.end();
}

