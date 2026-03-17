import * as cheerio from "cheerio";
import { fetchWithRetry } from "../utils/http.js";

/**
 * Fetches the full text of a call's detail page for deeper analysis.
 * Used to enrich calls before scoring when the scraper only got a summary.
 */
export class DetailFetcher {
  constructor(logger) {
    this.log = logger.child({ module: "detail-fetcher" });
  }

  /**
   * Enrich calls that have short descriptions by fetching their detail pages.
   * @param {import('../scrapers/base.js').RawCall[]} calls
   * @param {number} maxEnrich - Max number of calls to enrich per run
   * @returns {Promise<import('../scrapers/base.js').RawCall[]>}
   */
  async enrichCalls(calls, maxEnrich = 20) {
    const toEnrich = calls.filter(
      (c) => (!c.fullText || c.fullText.length < 200) && c.url
    );

    const batch = toEnrich.slice(0, maxEnrich);
    this.log.info({ count: batch.length, total: toEnrich.length }, "Enriching call details");

    const enriched = await Promise.allSettled(
      batch.map((call) => this._fetchDetail(call))
    );

    const enrichedMap = new Map();
    for (const result of enriched) {
      if (result.status === "fulfilled" && result.value) {
        enrichedMap.set(result.value.externalId, result.value);
      }
    }

    return calls.map((c) => enrichedMap.get(c.externalId) || c);
  }

  async _fetchDetail(call) {
    try {
      const { body } = await fetchWithRetry(call.url, { timeout: 20_000, retries: 1 });
      const $ = cheerio.load(body);

      // Remove scripts, styles, nav, footer
      $("script, style, nav, footer, header, .sidebar, .menu").remove();

      const mainContent =
        $("main, article, .content, .field--name-body, #content, .entry-content")
          .first()
          .text()
          .trim() || $("body").text().trim();

      const cleanText = mainContent
        .replace(/\s+/g, " ")
        .slice(0, 5000);

      return {
        ...call,
        fullText: cleanText,
        description: call.description || cleanText.slice(0, 500),
      };
    } catch (err) {
      this.log.debug({ url: call.url, err: err.message }, "Failed to fetch call detail");
      return null;
    }
  }
}
