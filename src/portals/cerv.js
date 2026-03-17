const axios = require('axios');

// CERV (Citizens, Equality, Rights and Values) calls via SEDIA search API.
// Covers all four CERV strands: Citizens, Daphne (gender-based violence),
// Gender Equality, and Rights and Equality (REC/CHAR).
const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

const QUERIES = [
  'CERV citizens civic engagement democracy participation 2025 2026 call',
  'CERV union values civil society organisations 2025 2026 call proposals',
  'CERV remembrance European integration citizens 2025 2026 call',
  'CERV Daphne gender-based violence prevention 2025 2026 call NGO',
  'CERV rights equality non-discrimination fundamental rights 2025 2026',
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
      console.error(`  [WARN] CERV SEDIA query "${query.slice(0, 40)}...": ${err.message}`);
      continue;
    }

    for (const r of results) {
      const url = r.url || '';
      if (!url || seen.has(url)) continue;
      if (url.includes('etendering.ted.europa.eu')) continue;
      // Only keep CERV-prefixed topic IDs
      if (!url.includes('CERV') && !url.includes('/cerv')) continue;
      seen.add(url);

      const topicMatch = url.match(/topic-details\/([^/.]+)/);
      const topicId = topicMatch ? topicMatch[1] : url.split('/').pop().replace('.json', '');
      const title = r.summary || r.content || topicId;

      calls.push({
        source: 'cerv',
        raw_id: `cerv-sedia-${topicId.slice(0, 40)}`,
        title,
        url,
        text_content: [
          `Title: ${title}`,
          `Source: CERV / DG JUST (via SEDIA)`,
          `Topic ID: ${topicId}`,
          `URL: ${url}`,
          r.content ? `Description: ${r.content.slice(0, 1000)}` : '',
          `Matched query: ${query}`,
        ].filter(Boolean).join('\n'),
        metadata: { deadline: null, programme: 'CERV', status: 'OPEN' },
      });
    }

    await new Promise(r => setTimeout(r, 250));
  }

  return calls;
}

module.exports = { fetchCalls };
