require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.PARSE_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `You are an expert in EU funding programs. Extract structured information from funding call data and return valid JSON only — no markdown, no explanation, no code blocks. All double-quote characters inside string values must be escaped as \\". Never include unescaped double quotes within JSON string values.`;

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Replace typographic/curly quotes with unicode escapes so they're safe inside JSON strings
    const fixed = text
      .replace(/„/g, '\\u201e')
      .replace(/\u201c/g, '\\u201c')
      .replace(/\u201d/g, '\\u201d')
      .replace(/\u2018/g, '\\u2018')
      .replace(/\u2019/g, '\\u2019');
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      throw e;
    }
  }
}

function buildPrompt(rawCall) {
  return `Extract structured information from this EU funding call.

Return a JSON object with exactly these fields:
- title: string
- programme: string (e.g. "Erasmus+", "Interreg Romania-Bulgaria", "Horizon Europe", "LIFE", "CERV", "ESF+", "Creative Europe")
- action_type: string or null (e.g. "KA1", "KA2", "KA3", "Cross-border cooperation", "Standard project")
- deadline: string ISO date YYYY-MM-DD or null
- open_date: string ISO date YYYY-MM-DD or null
- budget: { "min_grant": number or null, "max_grant": number or null, "total_budget": number or null, "currency": "EUR" }
- description: string (2-3 sentences summarising what this call funds)
- eligible_countries: array of ISO-2 country codes, or ["ALL_EU"] if all member states, or ["ERASMUS_COUNTRIES"] for Erasmus+ programme countries
- eligible_org_types: array of strings (e.g. ["NGO", "Public body", "University", "SME", "Informal group"])
- thematic_areas: array of strings (main topics)
- partnership_required: boolean or null
- min_partners: number or null

Call data:
---
${rawCall.text_content.slice(0, 3500)}
---
Source portal: ${rawCall.source}
URL: ${rawCall.url}
Metadata already known: ${JSON.stringify(rawCall.metadata)}`;
}

async function parseCall(rawCall) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(rawCall) }],
  });

  const raw = response.content[0].text.trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');

  const parsed = safeJsonParse(raw);

  return {
    id: rawCall.raw_id,
    source: rawCall.source,
    url: rawCall.url,
    ...parsed,
    scraped_at: new Date().toISOString(),
  };
}

module.exports = { parseCall };
