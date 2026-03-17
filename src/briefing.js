require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const profile = require('./profile');
const { saveBriefing } = require('./storage');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.BRIEF_MODEL || 'claude-sonnet-4-6';

function formatForPrompt(entries) {
  return entries.map(({ parsed, score }) => ({
    title: parsed.title,
    programme: parsed.programme,
    action_type: parsed.action_type,
    deadline: parsed.deadline,
    budget: parsed.budget,
    url: parsed.url,
    thematic_areas: parsed.thematic_areas,
    eligible_org_types: parsed.eligible_org_types,
    partnership_required: parsed.partnership_required,
    score: score.score,
    label: score.label,
    recommendation: score.recommendation,
    key_requirements: score.key_requirements,
    red_flags: score.red_flags,
    reasoning: score.reasoning,
  }));
}

async function generateBriefing(entries, date) {
  const briefingDate = date || new Date().toISOString().slice(0, 10);

  const relevant = entries
    .filter(e => e.score && e.score.score >= 40)
    .sort((a, b) => (b.score?.score || 0) - (a.score?.score || 0))
    .slice(0, 20);

  if (relevant.length === 0) {
    const content = `# AMPE Weekly EU Funding Briefing — ${briefingDate}\n\nNo relevant calls found this week (all scored below 40).\n`;
    const filepath = saveBriefing(content, briefingDate);
    return { content, filepath };
  }

  const callsJson = JSON.stringify(formatForPrompt(relevant), null, 2);

  const prompt = `You are a senior EU grants consultant preparing a weekly funding briefing for ${profile.name}, a small NGO (under 10 staff) based in ${profile.location.city}, ${profile.location.country}.

Today: ${briefingDate}
Organization focus: ${profile.focus_areas.slice(0, 4).join(', ')}
Budget range: €${profile.budget_range.min.toLocaleString()}–€${profile.budget_range.max.toLocaleString()}

Top-scored EU funding calls this week:
${callsJson}

Write a professional weekly briefing in Markdown. Use this structure:

1. **Header** — date, total calls scanned, number of good matches
2. **Priority Calls** (score ≥ 80) — for each: what it is, why it fits AMPE, deadline, budget, key requirements, next steps
3. **Worth Monitoring** (score 60–79) — brief paragraph per call with deadline and link
4. **On the Radar** (score 40–59) — one-line entries with link
5. **This Week's Actions** — 3–5 concrete next steps for the team

Be direct and actionable. Assume the reader knows EU funding terminology. Do not add disclaimers.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0].text;
  const filepath = saveBriefing(content, briefingDate);
  return { content, filepath };
}

module.exports = { generateBriefing };
