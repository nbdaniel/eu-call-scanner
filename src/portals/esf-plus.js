const axios = require('axios');

// ESF+ centralised calls via SEDIA search API.
// Covers EU-level ESF+ grants managed by DG EMPL — operating grants for social NGO
// networks, EaSI strand (Employment and Social Innovation), and social innovation calls.
// National ESF+ Operational Programmes (managed by member states) are not covered here.
const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

const QUERIES = [
  'ESF+ operating grants NGO networks social inclusion 2026',
  'ESF+ European Social Fund social innovation call 2026',
  'EaSI employment social innovation strand 2026 call proposals',
  'ESF+ transnational cooperation social inclusion youth 2026',
  'ESF+ EURES job mobility cross-border 2026 call',
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
      console.error(`  [WARN] ESF+ SEDIA query "${query.slice(0, 40)}...": ${err.message}`);
      continue;
    }

    for (const r of results) {
      const url = r.url || '';
      if (!url || seen.has(url)) continue;
      // Skip procurement/tender results from TED
      if (url.includes('etendering.ted.europa.eu')) continue;
      seen.add(url);

      const topicMatch = url.match(/topic-details\/([^/.]+)/);
      const topicId = topicMatch ? topicMatch[1] : url.split('/').pop().replace('.json', '');
      const title = r.summary || r.content || topicId;

      calls.push({
        source: 'esf-plus',
        raw_id: `esf-sedia-${topicId.slice(0, 40)}`,
        title,
        url,
        text_content: [
          `Title: ${title}`,
          `Source: ESF+ / DG EMPL (via SEDIA)`,
          `Topic ID: ${topicId}`,
          `URL: ${url}`,
          r.content ? `Description: ${r.content.slice(0, 1000)}` : '',
          `Matched query: ${query}`,
        ].filter(Boolean).join('\n'),
        metadata: { deadline: null, programme: 'ESF+', status: 'OPEN' },
      });
    }

    await new Promise(r => setTimeout(r, 250));
  }

  return calls;
}

module.exports = { fetchCalls };
