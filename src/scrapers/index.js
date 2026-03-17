import { FundingTendersScraper } from "./funding-tenders.js";
import { ErasmusScraper } from "./erasmus.js";
import { InterregScraper } from "./interreg.js";
import { StructuralFundsScraper } from "./structural-funds.js";

/**
 * Run all scrapers and aggregate results.
 * @param {import('pino').Logger} logger
 * @param {number} maxConcurrent
 * @returns {Promise<import('./base.js').RawCall[]>}
 */
export async function scrapeAll(logger, maxConcurrent = 3) {
  const scrapers = [
    new FundingTendersScraper(logger),
    new ErasmusScraper(logger),
    new InterregScraper(logger),
    new StructuralFundsScraper(logger),
  ];

  const allCalls = [];

  // Run scrapers in batches to respect concurrency limit
  for (let i = 0; i < scrapers.length; i += maxConcurrent) {
    const batch = scrapers.slice(i, i + maxConcurrent);
    const results = await Promise.allSettled(batch.map((s) => s.scrape()));

    for (const result of results) {
      if (result.status === "fulfilled") {
        allCalls.push(...result.value);
      } else {
        logger.error({ err: result.reason?.message }, "Scraper failed");
      }
    }
  }

  // Deduplicate across portals by normalized title
  const seen = new Map();
  const deduplicated = [];
  for (const call of allCalls) {
    const key = call.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(key)) {
      seen.set(key, true);
      deduplicated.push(call);
    }
  }

  logger.info(
    { raw: allCalls.length, deduplicated: deduplicated.length },
    "All scrapers complete"
  );
  return deduplicated;
}
