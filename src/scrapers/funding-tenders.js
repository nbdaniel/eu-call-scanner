import { BaseScraper } from "./base.js";
import { fetchWithRetry } from "../utils/http.js";

/**
 * Scraper for the EU Funding & Tenders Portal (ec.europa.eu/info/funding-tenders).
 * Uses the public search API to find open calls.
 */
export class FundingTendersScraper extends BaseScraper {
  constructor(logger) {
    super("funding-tenders", logger);
    this.apiBase = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
  }

  async scrape() {
    this.log.info("Fetching open calls from EU Funding & Tenders Portal");

    const programmes = [
      "CERV",       // Citizens, Equality, Rights and Values
      "ERASMUS",    // Erasmus+
      "ESF",        // European Social Fund+
      "SOCPL",      // Social Prerogatives and Specific Competencies
      "AMIF",       // Asylum, Migration and Integration Fund
      "DIGIT",      // Digital Europe Programme
      "LIFE",       // LIFE Programme
      "EQUAL",      // Equality programmes
      "CREATIVE",   // Creative Europe
    ];

    const calls = [];

    for (const prog of programmes) {
      try {
        const batch = await this._fetchProgramme(prog);
        calls.push(...batch);
        this.log.info({ programme: prog, count: batch.length }, "Fetched calls");
      } catch (err) {
        this.log.warn({ programme: prog, err: err.message }, "Failed to fetch programme");
      }
    }

    this.log.info({ total: calls.length }, "Funding & Tenders scrape complete");
    return calls;
  }

  async _fetchProgramme(programmeCode) {
    // The F&T portal exposes a search API used by its frontend
    const query = {
      bool: {
        must: [
          { term: { type: "1" } }, // type 1 = calls for proposals
          { terms: { status: ["31094501", "31094502"] } }, // open, forthcoming
        ],
      },
    };

    const params = new URLSearchParams({
      apiKey: "SEDIA",
      text: `programmes/${programmeCode}`,
      pageSize: "50",
      pageNumber: "1",
    });

    const url = `${this.apiBase}?${params}`;
    const { body } = await fetchWithRetry(url, {
      headers: { Accept: "application/json" },
    });

    let data;
    try {
      data = JSON.parse(body);
    } catch {
      this.log.warn({ programmeCode }, "Non-JSON response from F&T API");
      return [];
    }

    const results = data?.results || [];
    return results.map((r) => this._mapResult(r, programmeCode));
  }

  _mapResult(result, programmeCode) {
    const meta = result.metadata || {};
    const getValue = (key) => {
      const entry = meta[key];
      if (!entry) return "";
      if (Array.isArray(entry)) return entry.map((e) => e.value || e).join(", ");
      return entry.value || entry || "";
    };

    const identifier = getValue("identifier");
    const title = getValue("title") || result.title || "Untitled";
    const ccm2Id = getValue("ccm2Id");

    return {
      sourcePortal: "funding-tenders",
      externalId: identifier || ccm2Id || `ft-${programmeCode}-${Date.now()}`,
      title,
      url: identifier
        ? `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${identifier.toLowerCase()}`
        : `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/programmes/${programmeCode.toLowerCase()}`,
      programme: programmeCode,
      description: getValue("callTitle") || getValue("description") || "",
      deadlineDate: this._parseDate(getValue("deadlineDate")),
      openingDate: this._parseDate(getValue("startDate")),
      budget: getValue("budget"),
      status: getValue("status"),
      topics: getValue("keywords")
        ? getValue("keywords").split(",").map((s) => s.trim())
        : [],
      fullText: [title, getValue("callTitle"), getValue("description")].filter(Boolean).join("\n\n"),
    };
  }

  _parseDate(dateStr) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toISOString().split("T")[0];
    } catch {
      return dateStr;
    }
  }
}
