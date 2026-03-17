import { scrapeAll } from "./scrapers/index.js";
import { DetailFetcher } from "./analysis/detail-fetcher.js";
import { CallScorer } from "./analysis/scorer.js";
import { CallRepository } from "./db/repository.js";
import { BriefingGenerator } from "./briefing/generator.js";
import { Mailer } from "./briefing/mailer.js";
import { initDatabase } from "./db/migrate.js";

/**
 * Main agent orchestrator. Coordinates scraping, scoring, and briefing.
 */
export class ScannerAgent {
  constructor(config, logger) {
    this.config = config;
    this.log = logger;
    this.db = initDatabase(config.dbPath);
    this.repo = new CallRepository(this.db);
    this.scorer = new CallScorer(config, logger);
    this.detailFetcher = new DetailFetcher(logger);
    this.briefingGenerator = new BriefingGenerator(config, logger);
    this.mailer = new Mailer(config, logger);
  }

  /**
   * Run a full scan cycle: scrape -> enrich -> store -> score.
   */
  async scan() {
    const runId = this.repo.startScanRun();
    const errors = [];

    try {
      this.log.info("Starting scan cycle");

      // 1. Scrape all portals
      const rawCalls = await scrapeAll(this.log, this.config.maxConcurrentScrapes);
      this.log.info({ count: rawCalls.length }, "Scraping complete");

      // 2. Enrich calls with short descriptions
      const enrichedCalls = await this.detailFetcher.enrichCalls(rawCalls);

      // 3. Store in database
      const { total, new: newCount } = this.repo.upsertBatch(enrichedCalls);
      this.log.info({ total, new: newCount }, "Calls stored in database");

      // 4. Score unscored calls
      const unscored = this.repo.getUnscored();
      let scoredCount = 0;

      if (unscored.length > 0) {
        this.log.info({ count: unscored.length }, "Scoring new calls");

        // Convert DB rows back to the format the scorer expects
        const callsForScoring = unscored.map((row) => ({
          externalId: row.external_id,
          title: row.title,
          url: row.url,
          programme: row.programme,
          description: row.description,
          fullText: row.full_text,
          deadlineDate: row.deadline_date,
          budget: row.budget,
        }));

        const scores = await this.scorer.scoreBatch(callsForScoring);
        for (const [, score] of scores) {
          this.repo.updateScore(score);
          scoredCount++;
        }
      }

      this.repo.completeScanRun(runId, {
        callsFound: total,
        callsNew: newCount,
        callsScored: scoredCount,
        errors,
      });

      const stats = this.repo.getStats();
      this.log.info(
        { ...stats, newThisRun: newCount, scoredThisRun: scoredCount },
        "Scan cycle complete"
      );

      return { callsFound: total, callsNew: newCount, callsScored: scoredCount, stats };
    } catch (err) {
      errors.push(err.message);
      this.repo.failScanRun(runId, errors);
      this.log.error({ err: err.message }, "Scan cycle failed");
      throw err;
    }
  }

  /**
   * Generate and optionally send a weekly briefing.
   * @param {{ send?: boolean }} options
   */
  async briefing({ send = false } = {}) {
    this.log.info("Generating weekly briefing");

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const since = lastWeek.toISOString().split("T")[0];

    const calls = this.repo.getForBriefing(this.config.minRelevanceScore, since, 30);
    this.log.info({ callCount: calls.length }, "Calls for briefing");

    const content = await this.briefingGenerator.generate(calls);

    // Save briefing to database
    const briefingId = this.repo.saveBriefing({
      recipients: this.config.emailTo,
      callsIncluded: calls.length,
      subject: content.subject,
      bodyHtml: content.bodyHtml,
      bodyText: content.bodyText,
      status: "draft",
    });

    // Mark calls as included
    const today = new Date().toISOString().split("T")[0];
    this.repo.markBriefed(
      calls.map((c) => c.external_id),
      today
    );

    if (send) {
      const sent = await this.mailer.send(content);
      if (sent) {
        this.repo.markBriefingSent(briefingId);
        this.log.info("Briefing sent successfully");
      }
    } else {
      this.log.info("Briefing generated (not sent — use --send to email)");
    }

    return { briefingId, subject: content.subject, callsIncluded: calls.length, bodyText: content.bodyText };
  }

  /**
   * Print a summary of the database status.
   */
  status() {
    const stats = this.repo.getStats();
    const relevant = this.repo.getRelevant(this.config.minRelevanceScore);
    return { stats, topCalls: relevant.slice(0, 10) };
  }

  close() {
    this.db.close();
  }
}
