/**
 * @typedef {Object} RawCall
 * @property {string} sourcePortal - Which portal this came from
 * @property {string} externalId - Unique ID from the portal (call identifier)
 * @property {string} title - Call title
 * @property {string} url - Direct link to the call
 * @property {string} [programme] - Programme name (Erasmus+, Interreg, etc.)
 * @property {string} [description] - Short description / summary
 * @property {string} [deadlineDate] - ISO date string for submission deadline
 * @property {string} [openingDate] - ISO date string for opening
 * @property {string} [budget] - Budget info as text
 * @property {string} [status] - Open, forthcoming, closed
 * @property {string[]} [topics] - Topic keywords
 * @property {string} [fullText] - Full scraped text for analysis
 */

/**
 * Base class for portal scrapers.
 */
export class BaseScraper {
  /**
   * @param {string} name
   * @param {import('pino').Logger} logger
   */
  constructor(name, logger) {
    this.name = name;
    this.log = logger.child({ scraper: name });
  }

  /**
   * Scrape the portal and return raw calls.
   * @returns {Promise<RawCall[]>}
   */
  async scrape() {
    throw new Error("scrape() not implemented");
  }
}
