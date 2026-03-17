import * as cheerio from "cheerio";
import { BaseScraper } from "./base.js";
import { fetchWithRetry } from "../utils/http.js";

/**
 * Scraper for the Erasmus+ programme page and the Romanian National Agency (ANPCDEFP).
 * Complements the F&T portal with Romania-specific call information.
 */
export class ErasmusScraper extends BaseScraper {
  constructor(logger) {
    super("erasmus-plus", logger);
  }

  async scrape() {
    this.log.info("Fetching Erasmus+ calls");
    const calls = [];

    // 1. EU-level Erasmus+ calls from the main programme page
    try {
      const euCalls = await this._scrapeEUPage();
      calls.push(...euCalls);
    } catch (err) {
      this.log.warn({ err: err.message }, "Failed to scrape EU Erasmus+ page");
    }

    // 2. Romanian National Agency (ANPCDEFP) calls
    try {
      const roCalls = await this._scrapeANPCDEFP();
      calls.push(...roCalls);
    } catch (err) {
      this.log.warn({ err: err.message }, "Failed to scrape ANPCDEFP page");
    }

    this.log.info({ total: calls.length }, "Erasmus+ scrape complete");
    return calls;
  }

  async _scrapeEUPage() {
    const url = "https://erasmus-plus.ec.europa.eu/calls";
    const { body } = await fetchWithRetry(url);
    const $ = cheerio.load(body);
    const calls = [];

    // The Erasmus+ site lists calls in card/table layouts
    $("article, .view-content .views-row, .call-item, tr").each((_, el) => {
      const $el = $(el);
      const title = $el.find("h2, h3, .field--name-title, td:first-child a").first().text().trim();
      const link = $el.find("a[href]").first().attr("href") || "";
      const deadline = $el.find(".date, .field--name-field-deadline, time, td:nth-child(3)").first().text().trim();

      if (title && title.length > 10) {
        const fullUrl = link.startsWith("http") ? link : `https://erasmus-plus.ec.europa.eu${link}`;
        calls.push({
          sourcePortal: "erasmus-plus-eu",
          externalId: `erasmus-eu-${Buffer.from(title).toString("base64url").slice(0, 32)}`,
          title,
          url: fullUrl,
          programme: "Erasmus+",
          description: $el.find("p, .field--name-body").first().text().trim().slice(0, 500),
          deadlineDate: this._extractDate(deadline),
          status: "open",
          topics: [],
          fullText: $el.text().trim().slice(0, 2000),
        });
      }
    });

    return calls;
  }

  async _scrapeANPCDEFP() {
    const url = "https://www.anpcdefp.ro/erasmusplus/apeluri-deschise";
    const { body } = await fetchWithRetry(url);
    const $ = cheerio.load(body);
    const calls = [];

    $(".views-row, article, .node--type-apel, tr, li").each((_, el) => {
      const $el = $(el);
      const title = $el.find("h2, h3, a, .field--name-title").first().text().trim();
      const link = $el.find("a[href]").first().attr("href") || "";

      if (title && title.length > 10) {
        const fullUrl = link.startsWith("http") ? link : `https://www.anpcdefp.ro${link}`;
        calls.push({
          sourcePortal: "anpcdefp",
          externalId: `anpcdefp-${Buffer.from(title).toString("base64url").slice(0, 32)}`,
          title,
          url: fullUrl,
          programme: "Erasmus+ (Romania)",
          description: $el.find("p, .field--name-body").first().text().trim().slice(0, 500),
          deadlineDate: "",
          status: "open",
          topics: [],
          fullText: $el.text().trim().slice(0, 2000),
        });
      }
    });

    return calls;
  }

  _extractDate(text) {
    if (!text) return "";
    // Try common date patterns: DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD
    const match = text.match(/(\d{4})-(\d{2})-(\d{2})/) ||
      text.match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (match) {
      if (match[0].includes("-")) return match[0];
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return "";
  }
}
