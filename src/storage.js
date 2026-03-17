const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CALLS_FILE = path.join(DATA_DIR, 'calls.json');
const SEEN_FILE = path.join(DATA_DIR, 'seen_ids.json');
const BRIEFINGS_DIR = path.join(DATA_DIR, 'briefings');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCalls() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(CALLS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CALLS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveCalls(calls) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
}

function upsertCall(callData) {
  const calls = loadCalls();
  const idx = calls.findIndex(c => c.id === callData.id);
  if (idx >= 0) {
    calls[idx] = { ...calls[idx], ...callData, updated_at: new Date().toISOString() };
  } else {
    calls.push({ ...callData, created_at: new Date().toISOString() });
  }
  saveCalls(calls);
}

function loadSeenIds() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(SEEN_FILE)) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function markSeen(id) {
  const seen = loadSeenIds();
  seen.add(id);
  ensureDir(DATA_DIR);
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen], null, 2));
}

function saveBriefing(content, date) {
  ensureDir(BRIEFINGS_DIR);
  const filename = `${date || new Date().toISOString().slice(0, 10)}.md`;
  const filepath = path.join(BRIEFINGS_DIR, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

module.exports = { loadCalls, saveCalls, upsertCall, loadSeenIds, markSeen, saveBriefing };
