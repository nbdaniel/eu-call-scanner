import * as cheerio from "cheerio";
import { BaseScraper } from "./base.js";
import { fetchWithRetry } from "../utils/http.js";

/**
 * Scraper for Romanian structural/cohesion fund calls.
 * Targets the Romanian Government's EU funds portal (mfe.gov.ro)
 * and the relevant operational programmes for 2021-2027.
 */
export class StructuralFundsScraper extends BaseScraper {
  constructor(logger) {
    super("structural-funds", logger);
  }

  async scrape() {
    this.log.info("Fetching Romanian structural fund calls");
    const calls = [];

    const sources = [
      { name: "MFE (Ministry of EU Funds)", fn: () => this._scrapeMFE() },
      { name: "PIDS (Inclusion & Social Dignity)", fn: () => this._scrapePIDS() },
      { name: "PEO (Education & Employment)", fn: () => this._scrapePEO() },
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

    this.log.info({ total: calls.length }, "Structural funds scrape complete");
    return calls;
  }

  async _scrapeMFE() {
    // Ministry of European Funds - main portal for open calls
    const url = "https://mfe.gov.ro/ghiduri-solicitant/";
    const { body } = await fetchWithRetry(url);
    return this._extractFromHtml(body, url, "Romanian EU Funds (MFE)", "mfe");
  }

  async _scrapePIDS() {
    // Programme for Inclusion and Social Dignity (formerly POCU)
    const url = "https://mfe.gov.ro/programe/programul-incluziune-si-demnitate-sociala/";
    const { body } = await fetchWithRetry(url);
    return this._extractFromHtml(body, url, "PIDS (Inclusion & Social Dignity)", "pids");
  }

  async _scrapePEO() {
    // Programme for Education and Employment
    const url = "https://mfe.gov.ro/programe/programul-educatie-si-ocupare/";
    const { body } = await fetchWithRetry(url);
    return this._extractFromHtml(body, url, "PEO (Education & Employment)", "peo");
  }

  _extractFromHtml(html, baseUrl, programme, idPrefix) {
    const $ = cheerio.load(html);
    const calls = [];
    const base = new URL(baseUrl);

    $("article, .entry, .post, .views-row, li:has(a), tr:has(a)").each((_, el) => {
      const $el = $(el);
      const titleEl = $el.find("h2 a, h3 a, h4 a, .entry-title a, a").first();
      const title = titleEl.text().trim();
      const href = titleEl.attr("href") || "";

      if (!title || title.length < 10) return;

      let fullUrl;
      try {
        fullUrl = href.startsWith("http") ? href : new URL(href, base).toString();
      } catch {
        fullUrl = baseUrl;
      }

      calls.push({
        sourcePortal: idPrefix,
        externalId: `${idPrefix}-${Buffer.from(title).toString("base64url").slice(0, 32)}`,
        title,
        url: fullUrl,
        programme,
        description: $el.find("p, .excerpt, .summary").first().text().trim().slice(0, 500),
        deadlineDate: "",
        status: "open",
        topics: [],
        fullText: $el.text().trim().slice(0, 2000),
      });
    });

    const seen = new Set();
    return calls.filter((c) => {
      if (seen.has(c.title)) return false;
      seen.add(c.title);
      return true;
    });
  }
}
