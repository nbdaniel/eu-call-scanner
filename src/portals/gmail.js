const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '../../credentials/gmail-credentials.json');
const TOKEN_PATH = path.join(__dirname, '../../credentials/gmail-token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Search queries to find EU funding opportunity emails.
// Tuned to actual inbox sources: fundsforNGOs, Devex, EACEA, Romanian Ministry, fonduri-structurale.ro
const GMAIL_QUERIES = [
  // Dedicated NGO funding newsletters
  'from:fundsforngos.org',
  'from:devex.com grant OR funding OR call',
  // EC and EACEA official sources
  'from:eacea.ec.europa.eu',
  'from:ec.europa.eu call proposals',
  // Romanian government EU funding portal
  'from:mipe.gov.ro OR subject:"Oportunități de finanțare"',
  'from:fonduri-structurale.ro',
  // Broad funding keywords in English and Romanian
  'subject:"call for proposals" (Erasmus OR CERV OR Interreg OR ESF OR AMIF)',
  'subject:"cerere de propuneri" OR subject:"apel de proiecte" OR subject:"finantare europeana"',
];

function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) {
    return null;
  }
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
  return oAuth2Client;
}

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

function decodeBody(part) {
  if (!part.body || !part.body.data) return '';
  return Buffer.from(part.body.data, 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body && payload.body.data) return decodeBody(payload);
  if (payload.parts) {
    // Prefer plain text, fall back to HTML
    const plain = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plain) return decodeBody(plain);
    const html = payload.parts.find(p => p.mimeType === 'text/html');
    if (html) return stripHtml(decodeBody(html));
    // Recurse into multipart
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return '';
}

async function fetchCalls() {
  const auth = getAuthClient();
  if (!auth) {
    console.error('  [WARN] Gmail: credentials not found. Run `npm run gmail-auth` to set up.');
    return [];
  }

  const gmail = google.gmail({ version: 'v1', auth });
  const seen = new Set();
  const calls = [];

  for (const query of GMAIL_QUERIES) {
    let messages;
    try {
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: `${query} newer_than:90d`,
        maxResults: 10,
      });
      messages = res.data.messages || [];
    } catch (err) {
      console.error(`  [WARN] Gmail query "${query.slice(0, 40)}": ${err.message}`);
      continue;
    }

    for (const msg of messages) {
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);

      let full;
      try {
        const res = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });
        full = res.data;
      } catch (err) {
        continue;
      }

      const headers = full.payload.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      const body = extractBody(full.payload).slice(0, 3000);
      if (!body && !subject) continue;

      // Skip obvious welcome/subscription/admin emails
      const skipPattern = /welcome|bine ai venit|contul (a fost|tău)|activează contul|confirm.*subscri|security alert|password|verification|performance report|please confirm|a fost aprobat/i;
      if (skipPattern.test(subject)) continue;

      const rawId = `gmail-${msg.id}`;
      const title = subject.slice(0, 120);

      calls.push({
        source: 'gmail',
        raw_id: rawId,
        title,
        url: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
        text_content: [
          `Title: ${title}`,
          `Source: Gmail inbox`,
          `From: ${from}`,
          `Date: ${date}`,
          `Subject: ${subject}`,
          body ? `Body:\n${body}` : '',
        ].filter(Boolean).join('\n'),
        metadata: { deadline: null, programme: null, status: 'OPEN' },
      });
    }

    await new Promise(r => setTimeout(r, 200));
  }

  return calls;
}

module.exports = { fetchCalls };
