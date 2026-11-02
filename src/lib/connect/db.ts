/**
 * SQLite account store (sql.js, file-persisted). Server-only: imports sql.js
 * and node:fs, and is only ever imported by API routes.
 *
 * One sql.js Database per server process, written back to disk after every
 * mutation. If the disk write fails the server keeps running in memory and
 * logs a warning, so auth degrades to instance-local instead of crashing.
 */

import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import { DEMO_LOGIN_ID, DEMO_LOGIN_PASSWORD } from "@/components/connect/demo-credentials";
import { hashPassword } from "@/lib/connect/auth";

export type PublicUser = { id: number; name: string; email: string };

type StoredUser = PublicUser & { pass_salt: Uint8Array; pass_hash: Uint8Array };

let sqlReady: Promise<SqlJsStatic> | null = null;
let db: Database | null = null;

export function dbFilePath(): string {
  return process.env.HARMONISE_DB_PATH ?? path.join(process.cwd(), "data", "harmonise.db");
}

function loadSql(): Promise<SqlJsStatic> {
  if (!sqlReady) {
    sqlReady = initSqlJs({
      locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
    });
  }
  return sqlReady;
}

function persist(): void {
  if (!db) return;
  try {
    const file = dbFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(db.export()));
  } catch (error) {
    console.warn(`auth-db: persist failed, continuing in memory (${String(error)})`);
  }
}

async function getDb(): Promise<Database> {
  if (db) return db;
  const SQL = await loadSql();
  const file = dbFilePath();
  try {
    db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  } catch (error) {
    console.warn(`auth-db: could not load ${file}, starting fresh (${String(error)})`);
    db = new SQL.Database();
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pass_salt BLOB NOT NULL,
      pass_hash BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  // Seed the on-screen demo login on first run; INSERT OR IGNORE keeps
  // reruns and existing databases untouched.
  const seeded = await hashPassword(DEMO_LOGIN_PASSWORD);
  const seed = db.prepare(
    "INSERT OR IGNORE INTO users (email, name, pass_salt, pass_hash, created_at) VALUES ($email, $name, $salt, $hash, $at)",
  );
  seed.run({
    $email: DEMO_LOGIN_ID,
    $name: "Demo Member",
    $salt: seeded.salt,
    $hash: seeded.hash,
    $at: new Date().toISOString(),
  });
  seed.free();
  persist();
  return db;
}

function rowToUser(row: Record<string, unknown>): StoredUser | null {
  if (
    typeof row.id !== "number" ||
    typeof row.name !== "string" ||
    typeof row.email !== "string" ||
    !(row.pass_salt instanceof Uint8Array) ||
    !(row.pass_hash instanceof Uint8Array)
  ) {
    return null;
  }
  return { id: row.id, name: row.name, email: row.email, pass_salt: row.pass_salt, pass_hash: row.pass_hash };
}

function selectUser(sql: string, params: Record<string, SqlValue>): Promise<StoredUser | null> {
  return getDb().then((database) => {
    const stmt = database.prepare(sql);
    try {
      stmt.bind(params);
      if (!stmt.step()) return null;
      return rowToUser(stmt.getAsObject() as Record<string, unknown>);
    } finally {
      stmt.free();
    }
  });
}

export function findUserByEmail(email: string): Promise<StoredUser | null> {
  return selectUser("SELECT id, name, email, pass_salt, pass_hash FROM users WHERE email = $email", {
    $email: email,
  });
}

export async function findPublicUserById(id: number): Promise<PublicUser | null> {
  const database = await getDb();
  const stmt = database.prepare("SELECT id, name, email FROM users WHERE id = $id");
  try {
    stmt.bind({ $id: id });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as Record<string, unknown>;
    if (typeof row.id !== "number" || typeof row.name !== "string" || typeof row.email !== "string") {
      return null;
    }
    return { id: row.id, name: row.name, email: row.email };
  } finally {
    stmt.free();
  }
}

export async function createUser(
  name: string,
  email: string,
  salt: Uint8Array,
  hash: Uint8Array,
): Promise<PublicUser | null> {
  const database = await getDb();
  if (await findUserByEmail(email)) return null;
  const stmt = database.prepare(
    "INSERT INTO users (email, name, pass_salt, pass_hash, created_at) VALUES ($email, $name, $salt, $hash, $at)",
  );
  try {
    stmt.run({ $email: email, $name: name, $salt: salt, $hash: hash, $at: new Date().toISOString() });
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) return null;
    throw error;
  } finally {
    stmt.free();
  }
  persist();
  return findPublicUserById(Number((database.exec("SELECT last_insert_rowid() AS id")[0]?.values[0]?.[0] ?? 0)));
}

export async function createSession(userId: number, tokenHash: string, expiresAt: number): Promise<void> {
  const database = await getDb();
  const stmt = database.prepare(
    "INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES ($token, $user, $expires)",
  );
  try {
    stmt.run({ $token: tokenHash, $user: userId, $expires: expiresAt });
  } finally {
    stmt.free();
  }
  persist();
}

export async function findSession(tokenHash: string): Promise<{ userId: number; expiresAt: number } | null> {
  const database = await getDb();
  const stmt = database.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = $token");
  try {
    stmt.bind({ $token: tokenHash });
    if (!stmt.step()) return null;
    const row = stmt.getAsObject() as Record<string, unknown>;
    if (typeof row.user_id !== "number" || typeof row.expires_at !== "number") return null;
    return { userId: row.user_id, expiresAt: row.expires_at };
  } finally {
    stmt.free();
  }
}

export async function deleteSession(tokenHash: string): Promise<void> {
  const database = await getDb();
  const stmt = database.prepare("DELETE FROM sessions WHERE token_hash = $token");
  try {
    stmt.run({ $token: tokenHash });
  } finally {
    stmt.free();
  }
  persist();
}

export async function deleteExpiredSessions(now: number): Promise<void> {
  const database = await getDb();
  const stmt = database.prepare("DELETE FROM sessions WHERE expires_at <= $now");
  try {
    stmt.run({ $now: now });
  } finally {
    stmt.free();
  }
  persist();
}
