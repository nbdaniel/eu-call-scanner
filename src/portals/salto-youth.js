const axios = require('axios');

// SALTO-YOUTH European Training Calendar
// Erasmus+ and ESC training courses open for applications.
const BASE = 'https://www.salto-youth.net';

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function buildBrowseUrl(offset) {
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const params = [
    `b_begin_date_after_day=${day}`,
    `b_begin_date_after_month=${month}`,
    `b_begin_date_after_year=${year}`,
    `b_application_deadline_after_day=${day}`,
    `b_application_deadline_after_month=${month}`,
    `b_application_deadline_after_year=${year}`,
    `b_limit=100`,
    `b_order=applicationDeadline`,
    `b_offset=${offset || 0}`,
  ].join('&');
  return `${BASE}/tools/european-training-calendar/browse/?${params}`;
}

async function fetchCalls() {
  let html;
  try {
    const res = await axios.get(buildBrowseUrl(0), {
      headers: { 'User-Agent': 'AMPE-EU-Scanner/1.0' },
      timeout: 20000,
    });
    html = res.data;
  } catch (err) {
    console.error(`  [WARN] SALTO: ${err.message}`);
    return [];
  }

  const calls = [];
  const seen = new Set();

  // Each training listing is wrapped in <li class="result-container clearfix">
  const blockPattern = /<li class="result-container clearfix">([\s\S]*?)<\/li>/g;
  let blockMatch;

  while ((blockMatch = blockPattern.exec(html)) !== null) {
    const block = blockMatch[1];

    // URL and title from the <a href> in tool-item-name
    const urlMatch = block.match(/href="(https:\/\/www\.salto-youth\.net\/tools\/european-training-calendar\/training\/[^"]+)"/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    if (seen.has(url)) continue;
    seen.add(url);

    const titleMatch = block.match(/<h2 class="tool-item-name"[^>]*>.*?>([\s\S]*?)<\/a>/);
    const title = titleMatch ? stripTags(titleMatch[1]).replace(/^[""]|[""]$/g, '').trim() : '';
    if (!title) continue;

    // Extract numeric ID from URL slug (e.g. .14499/)
    const idMatch = url.match(/\.(\d+)\/$/);
    const rawId = `salto-${idMatch ? idMatch[1] : url.replace(/[^a-z0-9]/gi, '-')}`;

    // Dates and location from h5 and microcopy paragraphs
    const h5Matches = [...block.matchAll(/<p class="h5">([\s\S]*?)<\/p>/g)].map(m => stripTags(m[1]));
    const dates = h5Matches[0] || '';
    const descShort = h5Matches[1] || '';

    const locationMatch = block.match(/<p class="microcopy mrgn-btm-17">([\s\S]*?)<\/p>/);
    const location = locationMatch ? stripTags(locationMatch[1]) : '';

    // Application deadline
    const deadlineMatch = block.match(/Application deadline[\s\S]*?<p class="h3 mrgn-btm-2">([\s\S]*?)<\/p>/);
    const deadlineRaw = deadlineMatch ? stripTags(deadlineMatch[1]).trim() : '';

    // Participating countries
    const countriesMatch = block.match(/activity is for participants from<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/);
    const countries = countriesMatch ? stripTags(countriesMatch[1]).trim() : '';

    // Activity type
    const typeMatch = block.match(/<span class="h3 tool-item-category">([\s\S]*?)<\/span>/);
    const activityType = typeMatch ? stripTags(typeMatch[1]).trim() : 'Training';

    const textContent = [
      `Title: ${title}`,
      `Activity type: ${activityType}`,
      `Dates: ${dates}`,
      `Location: ${location}`,
      activityType ? `Type: ${activityType}` : '',
      `Programme: Erasmus+ Youth / European Solidarity Corps`,
      deadlineRaw ? `Application deadline: ${deadlineRaw}` : '',
      `Eligible countries/participants from: ${countries}`,
      descShort ? `Description: ${descShort}` : '',
      `URL: ${url}`,
      `Note: This is a training course funded under Erasmus+. Participants' travel and accommodation costs are typically covered. Romanian youth workers and NGO staff are eligible if Romania appears in the participant countries list.`,
    ].filter(Boolean).join('\n');

    calls.push({
      source: 'salto-youth',
      raw_id: rawId,
      title: title.slice(0, 120),
      url,
      text_content: textContent,
      metadata: {
        deadline: deadlineRaw || null,
        programme: 'Erasmus+',
        activity_type: activityType,
        dates,
        location,
        countries,
        status: 'OPEN',
      },
    });
  }

  return calls;
}

module.exports = { fetchCalls };
