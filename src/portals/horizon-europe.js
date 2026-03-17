const axios = require('axios');

// Horizon Europe calls via SEDIA search API.
// Focuses on Cluster 2 (Culture, Creativity and Inclusive Society) and
// adjacent calls relevant to AMPE's profile: democracy, European identity,
// social innovation, cultural heritage, and New European Bauhaus.
// Horizon Europe research infrastructure and deep-science clusters are excluded.
const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

const QUERIES = [
  'Horizon Europe Cluster 2 democracy governance European society 2026 2027 call',
  'Horizon Europe Cluster 2 cultural heritage creativity inclusion 2026 2027',
  'Horizon Europe Cluster 2 European identity values transformations 2026 2027',
  'Horizon Europe New European Bauhaus participation communities 2026 2027',
  'Horizon Europe social innovation civil society youth 2026 2027 call',
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
      console.error(`  [WARN] Horizon SEDIA query "${query.slice(0, 40)}...": ${err.message}`);
      continue;
    }

    for (const r of results) {
      const url = r.url || '';
      if (!url || seen.has(url)) continue;
      if (url.includes('etendering.ted.europa.eu')) continue;
      // Only keep HORIZON-prefixed topic IDs
      if (!url.includes('HORIZON') && !url.includes('/horizon')) continue;
      seen.add(url);

      const topicMatch = url.match(/topic-details\/([^/.]+)/);
      const topicId = topicMatch ? topicMatch[1] : url.split('/').pop().replace('.json', '');
      const title = r.summary || r.content || topicId;

      calls.push({
        source: 'horizon-europe',
        raw_id: `horizon-sedia-${topicId.slice(0, 40)}`,
        title,
        url,
        text_content: [
          `Title: ${title}`,
          `Source: Horizon Europe (via SEDIA)`,
          `Topic ID: ${topicId}`,
          `URL: ${url}`,
          r.content ? `Description: ${r.content.slice(0, 1000)}` : '',
          `Matched query: ${query}`,
        ].filter(Boolean).join('\n'),
        metadata: { deadline: null, programme: 'Horizon Europe', status: 'OPEN' },
      });
    }

    await new Promise(r => setTimeout(r, 250));
  }

  return calls;
}

module.exports = { fetchCalls };
