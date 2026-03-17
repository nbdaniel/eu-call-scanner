import * as cheerio from "cheerio";
import { BaseScraper } from "./base.js";
import { fetchWithRetry } from "../utils/http.js";

/**
 * Scraper for Interreg programmes relevant to Romania / South-West Oltenia:
 *  - Interreg Romania-Bulgaria
 *  - Interreg Danube Region (Danube Transnational)
 *  - Interreg Europe
 *  - keep.eu (EU project database for territorial cooperation)
 */
export class InterregScraper extends BaseScraper {
  constructor(logger) {
    super("interreg", logger);
  }

  async scrape() {
    this.log.info("Fetching Interreg calls");
    const calls = [];

    const sources = [
      { name: "Interreg Romania-Bulgaria", fn: () => this._scrapeRoBg() },
      { name: "Interreg Danube", fn: () => this._scrapeDanube() },
      { name: "Interreg Europe", fn: () => this._scrapeInterregEurope() },
    ];

    for (const source of sources) {
      try {
        const batch = await source.fn();
        calls.push(...batch);
        this.log.info({ source: source.name, count: batch.length }, "Fetched calls");
      } catch (err) {
        this.log.warn({ source: source.name, err: err.message }, "Failed to scrape");
      }
    }

    this.log.info({ total: calls.length }, "Interreg scrape complete");
    return calls;
  }

  async _scrapeRoBg() {
    const url = "https://interregviarobg.eu/en/calls-for-proposals";
    const { body } = await fetchWithRetry(url);
    return this._extractFromHtml(body, url, "Interreg VI-A Romania-Bulgaria", "interreg-robg");
  }

  async _scrapeDanube() {
    const url = "https://www.interreg-danube.eu/calls-for-proposals";
    const { body } = await fetchWithRetry(url);
    return this._extractFromHtml(body, url, "Interreg Danube Region", "interreg-danube");
  }

  async _scrapeInterregEurope() {
    const url = "https://www.interregeurope.eu/calls-for-proposals";
    const { body } = await fetchWithRetry(url);
    return this._extractFromHtml(body, url, "Interreg Europe", "interreg-europe");
  }

  /**
   * Generic HTML call extractor for Interreg portal pages.
   */
  _extractFromHtml(html, baseUrl, programme, idPrefix) {
    const $ = cheerio.load(html);
    const calls = [];
    const base = new URL(baseUrl);

    // Interreg sites typically list calls as cards, rows, or table entries
    const selectors = [
      "article",
      ".views-row",
      ".call-item",
      ".node--type-call",
      ".card",
      "tr:has(a)",
      ".list-item",
      ".item",
    ];

    $(selectors.join(", ")).each((_, el) => {
      const $el = $(el);
      const titleEl = $el.find("h2, h3, h4, .title, a").first();
      const title = titleEl.text().trim();
      const href = $el.find("a[href]").first().attr("href") || "";

      if (!title || title.length < 10) return;

      let fullUrl;
      try {
        fullUrl = href.startsWith("http") ? href : new URL(href, base).toString();
      } catch {
        fullUrl = baseUrl;
      }

      const deadline = $el.find(".date, time, .deadline").first().text().trim();

      calls.push({
        sourcePortal: idPrefix,
        externalId: `${idPrefix}-${Buffer.from(title).toString("base64url").slice(0, 32)}`,
        title,
        url: fullUrl,
        programme,
        description: $el.find("p, .description, .summary, .field--name-body").first().text().trim().slice(0, 500),
        deadlineDate: this._extractDate(deadline),
        status: "open",
        topics: [],
        fullText: $el.text().trim().slice(0, 2000),
      });
    });

    // Deduplicate by title
    const seen = new Set();
    return calls.filter((c) => {
      if (seen.has(c.title)) return false;
      seen.add(c.title);
      return true;
    });
  }

  _extractDate(text) {
    if (!text) return "";
    const match = text.match(/(\d{4})-(\d{2})-(\d{2})/) ||
      text.match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (match) {
      if (match[0].includes("-")) return match[0];
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return "";
  }
}
