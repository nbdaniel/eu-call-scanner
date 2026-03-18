const axios = require('axios');

// Romanian Ministry of Investments and European Projects — EU opportunities portal.
// Aggregates all EU funding calls open to Romanian entities (ESF+, ERDF, Interreg RO-BG,
// Erasmus+, CERV, etc.) with structured metadata on each call page.
const BASE = 'https://oportunitati-ue.gov.ro';
const API = `${BASE}/wp-json/wp/v2/apel`;

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'AMPE-EU-Scanner/1.0' },
    timeout: 15000,
  });
  return stripHtml(res.data).slice(0, 3000);
}

async function fetchCalls() {
  const calls = [];

  let items;
  try {
    const res = await axios.get(API, {
      params: {
        per_page: 25,
        orderby: 'date',
        order: 'desc',
        status: 'publish',
        _fields: 'id,title,link,date',
      },
      headers: { 'User-Agent': 'AMPE-EU-Scanner/1.0' },
      timeout: 20000,
    });
    items = res.data;
  } catch (err) {
    console.error(`  [WARN] oportunitati-ue.gov.ro listing: ${err.message}`);
    return [];
  }

  for (const item of items) {
    const rawId = `oportunitati-ue-${item.id}`;
    const title = (item.title?.rendered || '(no title)').replace(/&#\d+;/g, c =>
      String.fromCharCode(parseInt(c.slice(2, -1)))
    );
    const url = item.link;

    let pageText = '';
    try {
      pageText = await fetchPage(url);
    } catch (err) {
      console.error(`  [WARN] oportunitati-ue page "${title.slice(0, 40)}": ${err.message}`);
    }

    calls.push({
      source: 'oportunitati-ue',
      raw_id: rawId,
      title: title.slice(0, 120),
      url,
      text_content: [
        `Title: ${title}`,
        `Source: Oportunitati-UE (Romanian Ministry of Investments and European Projects)`,
        `URL: ${url}`,
        `Published: ${item.date}`,
        pageText ? `Content:\n${pageText}` : '',
      ].filter(Boolean).join('\n'),
      metadata: { deadline: null, programme: null, status: 'OPEN' },
    });

    await new Promise(r => setTimeout(r, 400));
  }

  return calls;
}

module.exports = { fetchCalls };
