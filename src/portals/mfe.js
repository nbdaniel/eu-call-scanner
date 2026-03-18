const axios = require('axios');

// mfe.gov.ro — Romanian Ministry of Investments and European Projects.
// Reads the site's Atom feed and keeps only call-relevant announcements:
// new applicant guides, public consultations on upcoming calls, call launches.
// Filters out payment lists, debt notices, procurement invitations, and other noise.
const FEED_URL = 'https://mfe.gov.ro/feed/';

// Keywords that suggest a call-relevant announcement (Romanian + English)
const INCLUDE_PATTERN = /apel|ghidul solicitantului|ghid.*solicitant|lansare|consultare public|schema de granturi|schema de ajutor|finantare nerambursabila|proiecte pilot|apeluri de proiecte/i;

// Keywords that indicate noise to discard
const EXCLUDE_PATTERN = /lista pl[aă][tț]ilor|procesul verbal|crean[tț]|invita[tț]ie de participare|lista proiectelor|evaluare.*proiect|contracte.*semnate|MySMIS|bilete.*sociale|acord.*cadru|servicii.*achizi[tț]/i;

function extractCdata(str) {
  const m = str.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : str.replace(/<[^>]+>/g, '').trim();
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchCalls() {
  let xml;
  try {
    const res = await axios.get(FEED_URL, {
      headers: { 'User-Agent': 'AMPE-EU-Scanner/1.0' },
      timeout: 20000,
    });
    xml = res.data;
  } catch (err) {
    console.error(`  [WARN] mfe.gov.ro feed: ${err.message}`);
    return [];
  }

  // Extract <entry> blocks
  const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const calls = [];

  for (const block of entryBlocks) {
    // Title
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const title = titleMatch ? extractCdata(titleMatch[1]) : '';
    if (!title) continue;

    // URL
    const linkMatch = block.match(/<link rel="alternate"[^>]*href="([^"]+)"/);
    const url = linkMatch ? linkMatch[1] : '';
    if (!url) continue;

    // Date
    const dateMatch = block.match(/<published>([\s\S]*?)<\/published>/);
    const date = dateMatch ? dateMatch[1].trim() : '';

    // Content/summary
    const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/) ||
                         block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    const content = contentMatch
      ? stripHtml(extractCdata(contentMatch[1])).slice(0, 1000)
      : '';

    // Filter: must match include, must not match exclude
    const combined = title + ' ' + content;
    if (!INCLUDE_PATTERN.test(combined)) continue;
    if (EXCLUDE_PATTERN.test(title)) continue;

    const rawId = `mfe-${url.replace(/[^a-z0-9]/gi, '-').slice(-60)}`;

    calls.push({
      source: 'mfe',
      raw_id: rawId,
      title: title.slice(0, 120),
      url,
      text_content: [
        `Title: ${title}`,
        `Source: MFE (Romanian Ministry of Investments and European Projects)`,
        `Published: ${date}`,
        `URL: ${url}`,
        content ? `Content: ${content}` : '',
      ].filter(Boolean).join('\n'),
      metadata: { deadline: null, programme: null, status: 'OPEN' },
    });
  }

  return calls;
}

module.exports = { fetchCalls };
