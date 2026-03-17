const axios = require('axios');

// EU Funding & Tenders Portal — uses the SEDIA full-text search API (public, POST)
// The portal's data API is not publicly accessible without authentication.
const SEDIA_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

const PROGRAMMES = [
  'Erasmus+ EACEA centralised calls',
  'CERV Citizens Equality Rights Values',
  'ESF+ European Social Fund',
  'Creative Europe',
  'Interreg cross-border cooperation',
  'AMIF asylum migration integration',
  'LIFE environment climate',
  'EaSI employment social innovation',
];

const QUERIES = [
  'Erasmus+ call proposals 2026 NGO youth education',
  'CERV call proposals 2026 civil society',
  'ESF+ call proposals 2026 social inclusion Romania',
  'Creative Europe call proposals 2026',
  'Interreg call proposals 2026 Romania cross-border',
];

async function querySEDIA(text, pageSize = 20) {
  const res = await axios.post(
    `${SEDIA_URL}?apiKey=SEDIA&text=${encodeURIComponent(text)}&pageSize=${pageSize}&pageNumber=1&language=en`,
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
      results = await querySEDIA(query, 15);
    } catch (err) {
      console.error(`  [WARN] SEDIA query "${query.slice(0, 40)}": ${err.message}`);
      continue;
    }

    for (const r of results) {
      const url = r.url || '';
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // Extract topic ID from URL
      const topicMatch = url.match(/topic-details\/([^/.]+)/);
      const topicId = topicMatch ? topicMatch[1] : url.split('/').pop().replace('.json', '');
      const rawId = `sedia-${topicId}`;

      const title = r.summary || r.content || topicId;
      const content = [r.content || '', r.summary || ''].filter(Boolean).join('\n');

      calls.push({
        source: 'funding-tenders',
        raw_id: rawId,
        title,
        url,
        text_content: [
          `Title: ${title}`,
          `Source: EU Funding & Tenders Portal (SEDIA)`,
          `Topic ID: ${topicId}`,
          `URL: ${url}`,
          content ? `Description: ${content.slice(0, 1500)}` : '',
          `Search query matched: ${query}`,
        ].filter(Boolean).join('\n'),
        metadata: {
          deadline: null,
          programme: null,
          status: 'OPEN',
        },
      });
    }

    // Brief pause between queries
    await new Promise(r => setTimeout(r, 300));
  }

  return calls;
}

module.exports = { fetchCalls };
