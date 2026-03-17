const axios = require('axios');

// Creative Europe calls via SEDIA search API.
// The culture.ec.europa.eu portal uses a JS SPA and is not directly scrapable.
const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

const QUERIES = [
  'Creative Europe CULTURE strand 2026 call proposals NGO',
  'Creative Europe CULTURE cooperation projects 2026',
  'Creative Europe CULTURE networks platforms 2026',
  'Creative Europe MEDIA 2026 call proposals',
  'Creative Europe cross-sectoral 2026 call proposals',
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
      console.error(`  [WARN] Creative Europe SEDIA query "${query.slice(0, 40)}...": ${err.message}`);
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
        source: 'creative-europe',
        raw_id: `ce-sedia-${topicId.slice(0, 40)}`,
        title,
        url,
        text_content: [
          `Title: ${title}`,
          `Source: Creative Europe (via SEDIA)`,
          `Topic ID: ${topicId}`,
          `URL: ${url}`,
          r.content ? `Description: ${r.content.slice(0, 1000)}` : '',
          `Matched query: ${query}`,
        ].filter(Boolean).join('\n'),
        metadata: { deadline: null, programme: 'Creative Europe', status: 'OPEN' },
      });
    }

    await new Promise(r => setTimeout(r, 250));
  }

  return calls;
}

module.exports = { fetchCalls };
