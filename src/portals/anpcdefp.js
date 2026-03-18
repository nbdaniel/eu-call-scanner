const axios = require('axios');

// ANPCDEFP — Romanian National Agency for Erasmus+ and European Solidarity Corps.
// Scrapes the current deadlines page and recent news for Erasmus+ call announcements.
const BASE = 'https://www.anpcdefp.ro';

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, c => String.fromCharCode(parseInt(c.slice(2, -1))))
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'AMPE-EU-Scanner/1.0' },
    timeout: 15000,
  });
  return res.data;
}

async function fetchCalls() {
  const calls = [];

  // 1. Scrape current deadlines
  let listingHtml;
  try {
    listingHtml = await fetchHtml(`${BASE}/termene-limita`);
  } catch (err) {
    console.error(`  [WARN] ANPCDEFP deadlines listing: ${err.message}`);
    return [];
  }

  // Extract entries: each has a link + title, followed by a date in context
  const entryPattern = /href="(https:\/\/www\.anpcdefp\.ro\/termen-limita\/vrs\/IDtlim\/\d+)">([^<]+)<\/a>([\s\S]{0,600})/g;
  const seen = new Set();
  let match;

  while ((match = entryPattern.exec(listingHtml)) !== null) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);

    const title = match[2].trim();
    // Extract date from surrounding context (format: "09 Aprilie 2026")
    const dateMatch = match[3].match(/(\d{1,2}\s+[A-Za-zăîâșțĂÎÂȘȚ]+\s+\d{4})/);
    const deadline = dateMatch ? dateMatch[1] : null;

    // Fetch individual page for any additional content
    let pageContent = '';
    try {
      const pageHtml = await fetchHtml(url);
      // Look for content between the title and the nav repetition
      const titleIdx = pageHtml.indexOf(title);
      if (titleIdx > -1) {
        pageContent = stripHtml(pageHtml.slice(titleIdx, titleIdx + 2000)).slice(0, 800);
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      // proceed without page content
    }

    const rawId = `anpcdefp-${url.split('/').pop()}`;

    calls.push({
      source: 'anpcdefp',
      raw_id: rawId,
      title: title.slice(0, 120),
      url,
      text_content: [
        `Title: ${title}`,
        `Source: ANPCDEFP (Romanian National Agency for Erasmus+ and European Solidarity Corps)`,
        `Programme: Erasmus+`,
        deadline ? `Deadline: ${deadline}` : '',
        `URL: ${url}`,
        pageContent ? `Description: ${pageContent}` : '',
      ].filter(Boolean).join('\n'),
      metadata: { deadline, programme: 'Erasmus+', status: 'OPEN' },
    });
  }

  // 2. Scrape recent news for call-related announcements
  let newsHtml;
  try {
    newsHtml = await fetchHtml(`${BASE}/stiri`);
  } catch (err) {
    return calls;
  }

  const newsPattern = /href="(https:\/\/www\.anpcdefp\.ro\/stire\/vrs\/IDstire\/\d+)">([^<]+)<\/a>([\s\S]{0,300})/g;
  const callNewsPattern = /apel|call|termen|deadline|lansare|deschis|eligibil|Erasmus|Solidaritate|finanțare/i;

  while ((match = newsPattern.exec(newsHtml)) !== null) {
    const url = match[1];
    if (seen.has(url)) continue;

    const title = match[2].trim();
    if (!callNewsPattern.test(title + match[3])) continue;
    seen.add(url);

    const rawId = `anpcdefp-news-${url.split('/').pop()}`;

    calls.push({
      source: 'anpcdefp',
      raw_id: rawId,
      title: title.slice(0, 120),
      url,
      text_content: [
        `Title: ${title}`,
        `Source: ANPCDEFP News (Romanian National Agency for Erasmus+)`,
        `Programme: Erasmus+`,
        `URL: ${url}`,
      ].filter(Boolean).join('\n'),
      metadata: { deadline: null, programme: 'Erasmus+', status: 'OPEN' },
    });
  }

  return calls;
}

module.exports = { fetchCalls };
