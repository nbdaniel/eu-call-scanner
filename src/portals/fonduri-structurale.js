const axios = require('axios');

// fonduri-structurale.ro — Romanian EU funds aggregator.
// Lists active and upcoming EU funding calls for Romanian beneficiaries.
// Data is embedded in __NEXT_DATA__ JSON on each page (Next.js SSR).
const BASE = 'https://www.fonduri-structurale.ro';

async function fetchPageData(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'AMPE-EU-Scanner/1.0', Accept: 'text/html' },
    timeout: 20000,
  });
  const match = res.data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

async function fetchCalls() {
  const calls = [];
  const seen = new Set();

  // Fetch active calls (up to 3 pages = 30 calls) and scheduled calls
  const sources = [
    { url: `${BASE}/finantari`, label: 'active' },
    { url: `${BASE}/finantari/programate`, label: 'scheduled' },
  ];

  for (const src of sources) {
    for (let page = 1; page <= 3; page++) {
      const pageUrl = page === 1 ? src.url : `${src.url}?paged=${page}`;
      let data;
      try {
        data = await fetchPageData(pageUrl);
      } catch (err) {
        console.error(`  [WARN] fonduri-structurale ${src.label} p${page}: ${err.message}`);
        break;
      }

      if (!data) break;

      const fundings = data.props?.pageProps?.fundings?.data || [];
      if (fundings.length === 0) break;

      for (const item of fundings) {
        const id = item.id;
        if (seen.has(id)) continue;
        seen.add(id);

        const a = item.attributes || {};
        const title = a.title || '(no title)';
        const slug = a.slug || String(id);
        const url = `${BASE}/finantari/${id}/${slug}`;
        const programme = a.programme?.data?.attributes?.title || null;
        const deadline = a.endDate || null;
        const startDate = a.startDate || null;
        const status = a.callStatus || 'Unknown';
        const description = a.shortDescription || '';

        calls.push({
          source: 'fonduri-structurale',
          raw_id: `fonduri-structurale-${id}`,
          title: title.slice(0, 120),
          url,
          text_content: [
            `Title: ${title}`,
            `Source: Fonduri-Structurale.ro (Romanian EU funds aggregator)`,
            programme ? `Programme: ${programme}` : '',
            `Status: ${status}`,
            startDate ? `Opening: ${startDate}` : '',
            deadline ? `Deadline: ${deadline}` : '',
            `URL: ${url}`,
            description ? `Description: ${description}` : '',
          ].filter(Boolean).join('\n'),
          metadata: { deadline, programme, status: status === 'Activ' ? 'OPEN' : status },
        });
      }

      const pagination = data.props?.pageProps?.fundings?.meta?.pagination || {};
      if (page >= (pagination.pageCount || 1)) break;

      await new Promise(r => setTimeout(r, 400));
    }

    await new Promise(r => setTimeout(r, 400));
  }

  return calls;
}

module.exports = { fetchCalls };
