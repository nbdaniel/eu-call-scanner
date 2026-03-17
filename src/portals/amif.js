const axios = require('axios');

// AMIF (Asylum, Migration and Integration Fund) centralised calls via SEDIA.
// Covers transnational actions managed by DG HOME — integration, reception,
// asylum procedures, and return. National AMIF programmes are not covered here.
const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

const QUERIES = [
  'AMIF transnational actions migration integration 2025 2026 call',
  'AMIF asylum migration integration fund NGO civil society 2026',
  'AMIF integration migrant women children education 2025 2026',
  'AMIF reception asylum seekers protection 2026 call proposals',
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
      console.error(`  [WARN] AMIF SEDIA query "${query.slice(0, 40)}...": ${err.message}`);
      continue;
    }

    for (const r of results) {
      const url = r.url || '';
      if (!url || seen.has(url)) continue;
      if (url.includes('etendering.ted.europa.eu')) continue;
      // Only keep AMIF-prefixed topic IDs to avoid noise from other programmes
      if (!url.includes('AMIF') && !url.includes('amif')) continue;
      seen.add(url);

      const topicMatch = url.match(/topic-details\/([^/.]+)/);
      const topicId = topicMatch ? topicMatch[1] : url.split('/').pop().replace('.json', '');
      const title = r.summary || r.content || topicId;

      calls.push({
        source: 'amif',
        raw_id: `amif-sedia-${topicId.slice(0, 40)}`,
        title,
        url,
        text_content: [
          `Title: ${title}`,
          `Source: AMIF / DG HOME (via SEDIA)`,
          `Topic ID: ${topicId}`,
          `URL: ${url}`,
          r.content ? `Description: ${r.content.slice(0, 1000)}` : '',
          `Matched query: ${query}`,
        ].filter(Boolean).join('\n'),
        metadata: { deadline: null, programme: 'AMIF', status: 'OPEN' },
      });
    }

    await new Promise(r => setTimeout(r, 250));
  }

  return calls;
}

module.exports = { fetchCalls };
