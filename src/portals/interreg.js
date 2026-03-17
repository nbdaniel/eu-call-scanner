const axios = require('axios');
const cheerio = require('cheerio');

const PORTALS = [
  {
    name: 'Interreg VI-A Romania-Bulgaria',
    url: 'https://interregviarobg.eu/en/calls-for-proposals',
    source: 'interreg-robg',
    base: 'https://interregviarobg.eu',
  },
  {
    name: 'Interreg Danube Region Programme',
    url: 'https://interreg-danube.eu/calls-for-proposals',
    source: 'interreg-danube',
    base: 'https://interreg-danube.eu',
  },
  {
    name: 'Interreg Europe',
    url: 'https://www.interreg.eu/calls-for-projects/',
    source: 'interreg-europe',
    base: 'https://www.interreg.eu',
  },
];

// Skip links that are clearly not calls
const SKIP_PATTERN = /news.archive|facebook|twitter|youtube|instagram|linkedin|privacy|cookie|sitemap|contact|search|language|select/i;
const CALL_PATTERN = /call|project|proposal|grant|fund|invitation|application/i;

async function scrapePage(portal) {
  const res = await axios.get(portal.url, {
    timeout: 20000,
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'AMPE-EU-Scanner/1.0 (contact@ampe.ro)',
    },
  });

  const $ = cheerio.load(res.data);
  // Remove noise
  $('header, nav, footer, .ecl-site-header, .ecl-site-footer').remove();

  const calls = [];
  const seen = new Set();

  // Interreg Danube uses Tailwind: call titles in <p class="font-bold text-3xl">
  // Interreg ROBG uses: .last_article-title-title > a, .last_article-title-date

  // Strategy 1: find explicit call-mention elements
  const $main = $('main, #main, #content, .container, body').first();

  // Look for headings and paragraphs that mention calls
  $main.find('h1, h2, h3, h4, p, a').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();

    if (!text || text.length < 10 || text.length > 300) return;
    if (SKIP_PATTERN.test(text)) return;
    if (!CALL_PATTERN.test(text)) return;

    const $link = $el.is('a') ? $el : $el.find('a').first();
    const href = $link.attr('href') || '';
    let url = portal.url;
    if (href && !href.startsWith('#')) {
      url = href.startsWith('http')
        ? href
        : `${portal.base}${href.startsWith('/') ? href : '/' + href}`;
    }

    if (seen.has(`${text}-${url}`)) return;
    seen.add(`${text}-${url}`);

    // Get date context from nearby elements
    const $parent = $el.parent();
    const dateText = $parent.find('[class*="date"], [class*="deadline"], time').text().trim()
      || $parent.prev().text().trim().slice(0, 60);

    calls.push({
      source: portal.source,
      raw_id: `${portal.source}-${Buffer.from(url + text).toString('base64').slice(0, 24)}`,
      title: text,
      url,
      text_content: [
        `Title: ${text}`,
        `Programme: ${portal.name}`,
        `Source URL: ${url}`,
        dateText ? `Date info: ${dateText}` : '',
      ].filter(Boolean).join('\n'),
      metadata: { deadline: null, programme: portal.name, status: 'OPEN' },
    });
  });

  // Fallback: pass page text to Claude if nothing found
  if (calls.length === 0) {
    const bodyText = $main.text().replace(/\s+/g, ' ').trim().slice(0, 4000);
    calls.push({
      source: portal.source,
      raw_id: `${portal.source}-index`,
      title: `${portal.name} — Calls Page`,
      url: portal.url,
      text_content: `${portal.name} open calls page. Extract any open calls with deadlines:\n\n${bodyText}`,
      metadata: { programme: portal.name, status: 'OPEN' },
    });
  }

  return calls;
}

async function fetchCalls() {
  const allCalls = [];
  for (const portal of PORTALS) {
    try {
      const calls = await scrapePage(portal);
      allCalls.push(...calls);
    } catch (err) {
      console.error(`  [WARN] ${portal.name}: ${err.message}`);
    }
  }
  return allCalls;
}

module.exports = { fetchCalls };
