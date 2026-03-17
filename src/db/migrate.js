import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

const SCHEMA = `
-- EU funding calls discovered by scrapers
CREATE TABLE IF NOT EXISTS calls (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id       TEXT NOT NULL UNIQUE,
  source_portal     TEXT NOT NULL,
  title             TEXT NOT NULL,
  url               TEXT NOT NULL,
  programme         TEXT DEFAULT '',
  description       TEXT DEFAULT '',
  full_text         TEXT DEFAULT '',
  deadline_date     TEXT DEFAULT '',
  opening_date      TEXT DEFAULT '',
  budget            TEXT DEFAULT '',
  status            TEXT DEFAULT 'open',
  topics            TEXT DEFAULT '[]',  -- JSON array

  -- Scoring fields
  relevance_score   REAL DEFAULT 0,
  reasoning         TEXT DEFAULT '',
  matched_domains   TEXT DEFAULT '[]',  -- JSON array
  suggested_role    TEXT DEFAULT 'not_applicable',
  action_items      TEXT DEFAULT '',
  risk_flags        TEXT DEFAULT '',

  -- Tracking
  first_seen_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at      TEXT NOT NULL DEFAULT (datetime('now')),
  scored_at         TEXT DEFAULT NULL,
  included_in_briefing TEXT DEFAULT NULL,  -- date of briefing
  user_status       TEXT DEFAULT 'new',    -- new, bookmarked, applied, dismissed

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_calls_external_id ON calls(external_id);
CREATE INDEX IF NOT EXISTS idx_calls_relevance ON calls(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_calls_deadline ON calls(deadline_date);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_user_status ON calls(user_status);

-- Scan history
CREATE TABLE IF NOT EXISTS scan_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT DEFAULT NULL,
  calls_found     INTEGER DEFAULT 0,
  calls_new       INTEGER DEFAULT 0,
  calls_scored    INTEGER DEFAULT 0,
  errors          TEXT DEFAULT '[]',  -- JSON array of error messages
  status          TEXT DEFAULT 'running'  -- running, completed, failed
);

-- Briefing history
CREATE TABLE IF NOT EXISTS briefings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at         TEXT DEFAULT NULL,
  recipients      TEXT DEFAULT '[]',      -- JSON array
  calls_included  INTEGER DEFAULT 0,
  subject         TEXT DEFAULT '',
  body_html       TEXT DEFAULT '',
  body_text       TEXT DEFAULT '',
  status          TEXT DEFAULT 'draft'  -- draft, sent, failed
);
`;

/**
 * Initialize or migrate the database.
 * @param {string} dbPath
 * @returns {Database.Database}
 */
export function initDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// Allow running directly: node src/db/migrate.js
const isMain = process.argv[1]?.endsWith("migrate.js");
if (isMain) {
  const dbPath = process.argv[2] || "./data/scanner.db";
  const db = initDatabase(dbPath);
  console.log(`Database initialized at ${dbPath}`);
  db.close();
}
