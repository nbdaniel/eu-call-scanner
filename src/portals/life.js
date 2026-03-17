const axios = require('axios');

// LIFE programme calls via SEDIA search API.
// Covers environment, nature & biodiversity, circular economy, climate action,
// clean energy transition, and climate governance strands.
const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

const QUERIES = [
  'LIFE nature biodiversity standard action project 2025 2026 call',
  'LIFE circular economy quality of life 2025 2026 call proposals',
  'LIFE climate action mitigation adaptation 2025 2026 call',
  'LIFE climate governance information 2025 2026 NGO civil society',
  'LIFE clean energy transition 2025 2026 call proposals',
];

async function querySEDIA(text) {
  const res = await axios.post(
    `${SEDIA_URL}?apiKey=SEDIA&text=${encodeURIComponent(text)}&pageSize=10&pageNumber=1&language=en`,
    {},
    {
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'AMPE-EU-Scanner/1.0' },
      timeout: 20000,
    }
  );
  return res.data.results || [];
}

async function fetchCalls() {
  const seen = new Set();
  const calls = [];

  for (const query of QUERIES) {
    let results;
    try {
      results = await querySEDIA(query);
    } catch (err) {
      console.error(`  [WARN] LIFE SEDIA query "${query.slice(0, 40)}...": ${err.message}`);
      continue;
    }

    for (const r of results) {
      const url = r.url || '';
      if (!url || seen.has(url)) continue;
      if (url.includes('etendering.ted.europa.eu')) continue;
      // Only keep LIFE-prefixed topic IDs to avoid noise from other programmes
      if (!url.includes('LIFE') && !url.includes('/life')) continue;
      seen.add(url);

      const topicMatch = url.match(/topic-details\/([^/.]+)/);
      const topicId = topicMatch ? topicMatch[1] : url.split('/').pop().replace('.json', '');
      const title = r.summary || r.content || topicId;

      calls.push({
        source: 'life',
        raw_id: `life-sedia-${topicId.slice(0, 40)}`,
        title,
        url,
        text_content: [
          `Title: ${title}`,
          `Source: LIFE Programme / DG ENV + DG CLIMA (via SEDIA)`,
          `Topic ID: ${topicId}`,
          `URL: ${url}`,
          r.content ? `Description: ${r.content.slice(0, 1000)}` : '',
          `Matched query: ${query}`,
        ].filter(Boolean).join('\n'),
        metadata: { deadline: null, programme: 'LIFE', status: 'OPEN' },
      });
    }

    await new Promise(r => setTimeout(r, 250));
  }

  return calls;
}

module.exports = { fetchCalls };
