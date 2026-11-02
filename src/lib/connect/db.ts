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
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      circle_id TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      scanned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_circle ON posts(circle_id);
    CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      strength INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
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

export type CirclePost = {
  id: number;
  circleId: string;
  author: string;
  text: string;
  createdAt: string;
};

export async function createPost(
  circleId: string,
  userId: number | null,
  author: string,
  text: string,
): Promise<CirclePost> {
  const database = await getDb();
  const createdAt = new Date().toISOString();
  const stmt = database.prepare(
    "INSERT INTO posts (circle_id, user_id, author, text, created_at) VALUES ($circle, $user, $author, $text, $at)",
  );
  try {
    stmt.run({ $circle: circleId, $user: userId, $author: author, $text: text, $at: createdAt });
  } finally {
    stmt.free();
  }
  persist();
  const id = Number(database.exec("SELECT last_insert_rowid() AS id")[0]?.values[0]?.[0] ?? 0);
  return { id, circleId, author, text, createdAt };
}

function rowsToPosts(database: Database, sql: string, params: Record<string, SqlValue>): CirclePost[] {
  const stmt = database.prepare(sql);
  const posts: CirclePost[] = [];
  try {
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      if (
        typeof row.id === "number" &&
        typeof row.circle_id === "string" &&
        typeof row.author === "string" &&
        typeof row.text === "string" &&
        typeof row.created_at === "string"
      ) {
        posts.push({ id: row.id, circleId: row.circle_id, author: row.author, text: row.text, createdAt: row.created_at });
      }
    }
    return posts;
  } finally {
    stmt.free();
  }
}

/** Recent visible posts for a circle feed. Flagged posts stay hidden. */
export async function listCirclePosts(circleId: string, limit: number): Promise<CirclePost[]> {
  const database = await getDb();
  return rowsToPosts(
    database,
    "SELECT id, circle_id, author, text, created_at FROM posts WHERE circle_id = $circle AND status = 'ok' ORDER BY id DESC LIMIT $limit",
    { $circle: circleId, $limit: limit },
  );
}

export type UnscannedPost = { id: number; text: string };

export async function unscannedPosts(limit: number): Promise<UnscannedPost[]> {
  const database = await getDb();
  const stmt = database.prepare("SELECT id, text FROM posts WHERE scanned = 0 ORDER BY id ASC LIMIT $limit");
  const posts: UnscannedPost[] = [];
  try {
    stmt.bind({ $limit: limit });
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      if (typeof row.id === "number" && typeof row.text === "string") posts.push({ id: row.id, text: row.text });
    }
    return posts;
  } finally {
    stmt.free();
  }
}

export async function markPostScanned(id: number, status: "ok" | "flagged"): Promise<void> {
  const database = await getDb();
  const stmt = database.prepare("UPDATE posts SET scanned = 1, status = $status WHERE id = $id");
  try {
    stmt.run({ $status: status, $id: id });
  } finally {
    stmt.free();
  }
  persist();
}

/** Texts the discovery agent may mine: verified-clean posts only. */
export async function verifiedPostTexts(limit: number): Promise<string[]> {
  const database = await getDb();
  const stmt = database.prepare(
    "SELECT text FROM posts WHERE scanned = 1 AND status = 'ok' ORDER BY id DESC LIMIT $limit",
  );
  const texts: string[] = [];
  try {
    stmt.bind({ $limit: limit });
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      if (typeof row.text === "string") texts.push(row.text);
    }
    return texts;
  } finally {
    stmt.free();
  }
}

export type Proposal = {
  id: number;
  theme: string;
  name: string;
  description: string;
  strength: number;
  status: string;
};

function rowsToProposals(database: Database, sql: string, params: Record<string, SqlValue>): Proposal[] {
  const stmt = database.prepare(sql);
  const proposals: Proposal[] = [];
  try {
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      if (
        typeof row.id === "number" &&
        typeof row.theme === "string" &&
        typeof row.name === "string" &&
        typeof row.description === "string" &&
        typeof row.strength === "number" &&
        typeof row.status === "string"
      ) {
        proposals.push({ id: row.id, theme: row.theme, name: row.name, description: row.description, strength: row.strength, status: row.status });
      }
    }
    return proposals;
  } finally {
    stmt.free();
  }
}

/** Insert or refresh a discovery proposal. Review status is never reset. */
export async function upsertProposal(
  theme: string,
  name: string,
  description: string,
  strength: number,
): Promise<void> {
  const database = await getDb();
  const stmt = database.prepare(
    `INSERT INTO proposals (theme, name, description, strength, created_at)
     VALUES ($theme, $name, $description, $strength, $at)
     ON CONFLICT(theme) DO UPDATE SET strength = $strength`,
  );
  try {
    stmt.run({ $theme: theme, $name: name, $description: description, $strength: strength, $at: new Date().toISOString() });
  } finally {
    stmt.free();
  }
  persist();
}

export async function pendingProposals(): Promise<Proposal[]> {
  const database = await getDb();
  return rowsToProposals(database, "SELECT id, theme, name, description, strength, status FROM proposals WHERE status = 'pending' ORDER BY strength DESC", {});
}

export async function approvedProposals(): Promise<Proposal[]> {
  const database = await getDb();
  return rowsToProposals(
    database,
    "SELECT id, theme, name, description, strength, status FROM proposals WHERE status = 'approved' ORDER BY strength DESC",
    {},
  );
}

export async function setProposalStatus(id: number, status: "approved" | "rejected"): Promise<void> {
  const database = await getDb();
  const stmt = database.prepare("UPDATE proposals SET status = $status WHERE id = $id");
  try {
    stmt.run({ $status: status, $id: id });
  } finally {
    stmt.free();
  }
  persist();
}

export async function refineProposal(id: number, name: string, description: string): Promise<void> {
  const database = await getDb();
  const stmt = database.prepare("UPDATE proposals SET name = $name, description = $description WHERE id = $id");
  try {
    stmt.run({ $name: name, $description: description, $id: id });
  } finally {
    stmt.free();
  }
  persist();
}
