import Anthropic from "@anthropic-ai/sdk";
import { profileToPromptText } from "../profile.js";

/**
 * @typedef {Object} ScoredCall
 * @property {string} externalId
 * @property {number} relevanceScore - 0.0 to 1.0
 * @property {string} reasoning - Why this score
 * @property {string[]} matchedDomains - Which org domains match
 * @property {string} suggestedRole - "lead" | "partner" | "not_applicable"
 * @property {string} actionItems - Concrete next steps
 * @property {string} riskFlags - Potential issues (eligibility, capacity, etc.)
 */

export class CallScorer {
  /**
   * @param {import('../config.js').loadConfig} config
   * @param {import('pino').Logger} logger
   */
  constructor(config, logger) {
    this.config = config;
    this.log = logger.child({ module: "scorer" });
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.model = config.claudeModel;
  }

  /**
   * Score a batch of calls against the organization profile.
   * @param {import('../scrapers/base.js').RawCall[]} calls
   * @returns {Promise<Map<string, ScoredCall>>}
   */
  async scoreBatch(calls) {
    const results = new Map();
    const batchSize = 5;

    for (let i = 0; i < calls.length; i += batchSize) {
      const batch = calls.slice(i, i + batchSize);
      this.log.info(
        { batch: Math.floor(i / batchSize) + 1, total: Math.ceil(calls.length / batchSize) },
        "Scoring batch"
      );

      const scored = await this._scoreBatchCalls(batch);
      for (const s of scored) {
        results.set(s.externalId, s);
      }
    }

    return results;
  }

  async _scoreBatchCalls(calls) {
    const callSummaries = calls
      .map(
        (c, i) =>
          `--- CALL ${i + 1} ---
ID: ${c.externalId}
TITLE: ${c.title}
PROGRAMME: ${c.programme || "Unknown"}
DEADLINE: ${c.deadlineDate || "Not specified"}
BUDGET: ${c.budget || "Not specified"}
URL: ${c.url}
DESCRIPTION: ${(c.description || c.fullText || "No description available").slice(0, 1500)}
--- END CALL ${i + 1} ---`
      )
      .join("\n\n");

    const systemPrompt = `You are an expert EU funding analyst working for a Romanian NGO. Your task is to evaluate EU funding calls for relevance to the organization described below.

${profileToPromptText()}

SCORING GUIDELINES:
- Score 0.8-1.0: Perfect match — the call directly addresses our core domains, we have experience in the programme, and we meet all eligibility criteria
- Score 0.6-0.79: Strong match — significant overlap with our work, likely eligible, worth pursuing
- Score 0.4-0.59: Moderate match — some relevant elements, worth monitoring or joining as partner
- Score 0.2-0.39: Weak match — tangential relevance, only if a strong consortium invites us
- Score 0.0-0.19: No match — outside our scope, excluded topics, or ineligible

Consider: thematic alignment, geographic eligibility (Romania, South-West Oltenia, Danube region), programme experience, organizational capacity, target group overlap, and partnership potential.`;

    const userPrompt = `Analyze each of the following EU funding calls and provide a relevance assessment for our organization.

${callSummaries}

Respond with a JSON array (no markdown, just raw JSON). Each element must have:
{
  "externalId": "<the call ID>",
  "relevanceScore": <0.0 to 1.0>,
  "reasoning": "<2-3 sentence explanation>",
  "matchedDomains": ["<matching domain 1>", ...],
  "suggestedRole": "lead" | "partner" | "not_applicable",
  "actionItems": "<concrete next steps if relevant>",
  "riskFlags": "<any concerns about eligibility, capacity, deadlines>"
}`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = response.content[0]?.text || "[]";
      // Extract JSON from potential markdown wrapping
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.log.warn("No JSON array found in Claude response");
        return calls.map((c) => this._fallbackScore(c));
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((item) => ({
        externalId: item.externalId,
        relevanceScore: Math.max(0, Math.min(1, parseFloat(item.relevanceScore) || 0)),
        reasoning: item.reasoning || "",
        matchedDomains: item.matchedDomains || [],
        suggestedRole: item.suggestedRole || "not_applicable",
        actionItems: item.actionItems || "",
        riskFlags: item.riskFlags || "",
      }));
    } catch (err) {
      this.log.error({ err: err.message }, "Claude API error during scoring");
      return calls.map((c) => this._fallbackScore(c));
    }
  }

  _fallbackScore(call) {
    return {
      externalId: call.externalId,
      relevanceScore: 0,
      reasoning: "Scoring failed — manual review required",
      matchedDomains: [],
      suggestedRole: "not_applicable",
      actionItems: "Review manually",
      riskFlags: "Automated scoring unavailable",
    };
  }
}
