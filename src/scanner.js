require('dotenv').config();
const { fetchCalls: fetchFT } = require('./portals/funding-tenders');
const { fetchCalls: fetchErasmus } = require('./portals/erasmus-plus');
const { fetchCalls: fetchInterreg } = require('./portals/interreg');
const { parseCall } = require('./parser');
const { scoreCall } = require('./scorer');
const { loadSeenIds, markSeen, upsertCall, loadCalls } = require('./storage');

function log(prefix, msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${prefix}] ${msg}`);
}

async function runPortal(name, fetchFn) {
  log(name, 'Fetching...');
  try {
    const calls = await fetchFn();
    log(name, `Fetched ${calls.length} calls`);
    return calls;
  } catch (err) {
    log(name, `ERROR: ${err.message}`);
    return [];
  }
}

async function scan({ forceReparse = false } = {}) {
  log('SCAN', 'Starting EU funding call scan...');

  const [ftCalls, erasmusCalls, interregCalls] = await Promise.all([
    runPortal('EU-FT', fetchFT),
    runPortal('ERASMUS+', fetchErasmus),
    runPortal('INTERREG', fetchInterreg),
  ]);

  // Deduplicate by URL across portals (SEDIA returns same calls from multiple queries)
  const urlSeen = new Set();
  const allRaw = [...ftCalls, ...erasmusCalls, ...interregCalls].filter(c => {
    const key = c.url || c.raw_id;
    if (urlSeen.has(key)) return false;
    urlSeen.add(key);
    return true;
  });
  log('SCAN', `Total: ${allRaw.length} unique calls fetched across all portals`);

  const seenIds = loadSeenIds();
  const toProcess = forceReparse
    ? allRaw
    : allRaw.filter(c => !seenIds.has(c.raw_id));

  log('SCAN', `${toProcess.length} new calls to process (${allRaw.length - toProcess.length} already seen)`);

  if (toProcess.length === 0) {
    log('SCAN', 'Nothing new. Use --force to reparse all calls.');
    return { new: 0, total: loadCalls().length };
  }

  const results = [];

  for (let i = 0; i < toProcess.length; i++) {
    const raw = toProcess[i];
    log('PARSE', `[${i + 1}/${toProcess.length}] ${raw.title.slice(0, 65)}`);

    try {
      const parsed = await parseCall(raw);
      const score = await scoreCall(parsed);

      upsertCall({ id: raw.raw_id, raw, parsed, score });
      markSeen(raw.raw_id);
      results.push({ raw, parsed, score });

      // Respect API rate limits
      if (i < toProcess.length - 1) await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      log('ERROR', `"${raw.title.slice(0, 50)}": ${err.message}`);
    }
  }

  const topMatches = results.filter(r => (r.score?.score || 0) >= 70).length;
  log('SCAN', `Done. ${results.length}/${toProcess.length} processed. ${topMatches} good matches (≥70).`);
  log('SCAN', 'Run `npm run briefing` to generate your weekly briefing.');

  return {
    new: results.length,
    total: loadCalls().length,
    top_matches: topMatches,
    results,
  };
}

module.exports = { scan };
