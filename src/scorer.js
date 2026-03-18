require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const profile = require('./profile');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.SCORE_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `You are a senior EU grant consultant. Score funding calls for NGO eligibility and strategic fit. Return valid JSON only — no markdown, no explanation, no code blocks. All double-quote characters inside string values must be escaped as \\". Never include unescaped double quotes within JSON string values.`;

function repairJson(text) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { result += ch; escaped = false; continue; }
    if (ch === '\\') { result += ch; escaped = true; continue; }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
      } else {
        let j = i + 1;
        while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r' || text[j] === '\n')) j++;
        const next = text[j];
        if (next === ':' || next === ',' || next === '}' || next === ']' || j >= text.length) {
          inString = false;
          result += ch;
        } else {
          result += '\\"';
        }
      }
    } else {
      result += ch;
    }
  }
  return result;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const fixed = text
      .replace(/„/g, '\\u201e')
      .replace(/\u201c/g, '\\u201c')
      .replace(/\u201d/g, '\\u201d')
      .replace(/\u2018/g, '\\u2018')
      .replace(/\u2019/g, '\\u2019');
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      try {
        return JSON.parse(repairJson(text));
      } catch (e3) {
        throw e;
      }
    }
  }
}

function buildPrompt(call) {
  const today = new Date().toISOString().slice(0, 10);

  return `Score this EU funding call for the organization below.

ORGANIZATION: ${profile.name}
Type: ${profile.type}
Location: ${profile.location.city}, ${profile.location.region}, ${profile.location.country}
Focus areas: ${profile.focus_areas.join('; ')}
Programme experience: ${profile.programs_experience.join('; ')}
Budget range: €${profile.budget_range.min.toLocaleString()}–€${profile.budget_range.max.toLocaleString()} (preferred: €${profile.budget_range.preferred_range})
Strengths: ${profile.strengths.join('; ')}

CALL:
Title: ${call.title}
Programme: ${call.programme}
Action type: ${call.action_type || 'N/A'}
Deadline: ${call.deadline || 'Unknown'}
Budget: ${JSON.stringify(call.budget)}
Description: ${call.description}
Eligible countries: ${(call.eligible_countries || []).join(', ') || 'Unknown'}
Eligible org types: ${(call.eligible_org_types || []).join(', ') || 'Unknown'}
Thematic areas: ${(call.thematic_areas || []).join(', ') || 'Unknown'}
Partnership required: ${call.partnership_required != null ? call.partnership_required : 'Unknown'}
Min partners: ${call.min_partners != null ? call.min_partners : 'Unknown'}
URL: ${call.url}

Today's date: ${today}

Scoring weights:
- Thematic relevance 30%
- Organizational eligibility 25%
- Geographic eligibility 20%
- Budget fit 15%
- Deadline feasibility 10% (< 2 weeks = 0, 2-4 weeks = 40, 1-3 months = 80, > 3 months = 100)

Return exactly this JSON:
{
  "score": <weighted average 0-100, integer>,
  "label": <"Excellent Match" | "Good Match" | "Moderate Match" | "Low Match" | "Not Eligible">,
  "breakdown": {
    "thematic_relevance": <0-100>,
    "org_eligibility": <0-100>,
    "geographic_eligibility": <0-100>,
    "budget_fit": <0-100>,
    "deadline_feasibility": <0-100>
  },
  "key_requirements": [<2-4 most important requirements to check>],
  "red_flags": [<disqualifying issues or empty array>],
  "recommendation": <"Apply" | "Monitor" | "Skip">,
  "reasoning": <2-3 sentences explaining the score>
}`;
}

async function scoreCall(parsedCall) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(parsedCall) }],
  });

  const raw = response.content[0].text.trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');

  const scored = safeJsonParse(raw);

  return {
    call_id: parsedCall.id,
    ...scored,
    scored_at: new Date().toISOString(),
  };
}

module.exports = { scoreCall };
