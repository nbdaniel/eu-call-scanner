const axios = require('axios');

// Erasmus+ calls sourced via EU SEDIA search API.
// The Erasmus+ web portal (erasmus-plus.ec.europa.eu) is a JS SPA and not directly scrapable.
// The EACEA website (eacea.ec.europa.eu) manages centralised calls and is queried here.
const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

const QUERIES = [
  // KA1 & KA2 standard (national agencies)
  'Erasmus+ KA1 learning mobility individuals 2026 call proposals',
  'Erasmus+ KA2 cooperation partnerships 2026 call proposals',
  'Erasmus+ KA2 small-scale partnerships 2026',
  // EACEA centralised calls
  'Erasmus+ EACEA 2026 call centralised youth capacity building',
  'Erasmus+ European Youth Together 2026 open call',
  'Erasmus+ Jean Monnet 2026 call proposals',
  // European Solidarity Corps
  'European Solidarity Corps 2026 call proposals NGO',
  // CERV
  'CERV Citizens Equality Rights Values 2026 call NGO civil society',
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
      console.error(`  [WARN] Erasmus SEDIA query "${query.slice(0, 40)}...": ${err.message}`);
      continue;
    }

    for (const r of results) {
      const url = r.url || '';
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const topicMatch = url.match(/topic-details\/([^/.]+)/);
      const topicId = topicMatch ? topicMatch[1] : url.split('/').pop().replace('.json', '');
      const title = r.summary || r.content || topicId;

      calls.push({
        source: 'erasmus-plus',
        raw_id: `ep-sedia-${topicId.slice(0, 40)}`,
        title,
        url,
        text_content: [
          `Title: ${title}`,
          `Source: Erasmus+ / EACEA (via SEDIA)`,
          `Topic ID: ${topicId}`,
          `URL: ${url}`,
          r.content ? `Description: ${r.content.slice(0, 1000)}` : '',
          `Matched query: ${query}`,
        ].filter(Boolean).join('\n'),
        metadata: { deadline: null, programme: 'Erasmus+', status: 'OPEN' },
      });
    }

    await new Promise(r => setTimeout(r, 250));
  }

  return calls;
}

module.exports = { fetchCalls };
