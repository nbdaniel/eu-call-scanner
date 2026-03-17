#!/usr/bin/env node

import { Command } from "commander";
import { Cron } from "croner";
import { loadConfig } from "./config.js";
import { createLogger } from "./utils/logger.js";
import { ScannerAgent } from "./agent.js";

const program = new Command();

program
  .name("eu-scanner")
  .description("EU Funding Call Scanner for AMPE — monitors EU portals, scores calls, delivers briefings")
  .version("1.0.0");

program
  .command("scan")
  .description("Run a full scan cycle: scrape portals, enrich, store, and score calls")
  .action(async () => {
    const config = loadConfig();
    const log = createLogger(config.logLevel);
    const agent = new ScannerAgent(config, log);

    try {
      const result = await agent.scan();
      log.info(result, "Scan completed");
      console.log("\n--- Scan Results ---");
      console.log(`  Calls found:   ${result.callsFound}`);
      console.log(`  New calls:     ${result.callsNew}`);
      console.log(`  Calls scored:  ${result.callsScored}`);
      console.log(`  Total in DB:   ${result.stats.total}`);
      console.log(`  High relevance (≥60%): ${result.stats.high_relevance}`);
      console.log(`  Moderate (40-59%):     ${result.stats.moderate_relevance}`);
    } catch (err) {
      log.fatal({ err: err.message }, "Scan failed");
      process.exitCode = 1;
    } finally {
      agent.close();
    }
  });

program
  .command("briefing")
  .description("Generate a weekly briefing of top EU funding opportunities")
  .option("--send", "Send the briefing via email (requires SMTP config)")
  .action(async (opts) => {
    const config = loadConfig();
    const log = createLogger(config.logLevel);
    const agent = new ScannerAgent(config, log);

    try {
      const result = await agent.briefing({ send: !!opts.send });
      console.log("\n--- Briefing ---");
      console.log(`  Subject: ${result.subject}`);
      console.log(`  Calls included: ${result.callsIncluded}`);
      console.log("");
      console.log(result.bodyText);
    } catch (err) {
      log.fatal({ err: err.message }, "Briefing failed");
      process.exitCode = 1;
    } finally {
      agent.close();
    }
  });

program
  .command("status")
  .description("Show database statistics and top opportunities")
  .action(() => {
    const config = loadConfig();
    const log = createLogger(config.logLevel);
    const agent = new ScannerAgent(config, log);

    try {
      const { stats, topCalls } = agent.status();
      console.log("\n--- Database Statistics ---");
      console.log(`  Total calls:           ${stats.total}`);
      console.log(`  Scored:                ${stats.scored}`);
      console.log(`  High relevance (≥60%): ${stats.high_relevance}`);
      console.log(`  Moderate (40-59%):     ${stats.moderate_relevance}`);
      console.log(`  Expired:               ${stats.expired}`);

      if (topCalls.length > 0) {
        console.log("\n--- Top Opportunities ---");
        for (const c of topCalls) {
          const score = (c.relevance_score * 100).toFixed(0);
          const deadline = c.deadline_date || "TBD";
          console.log(`  [${score}%] ${c.title}`);
          console.log(`        ${c.programme} | Deadline: ${deadline} | Role: ${c.suggested_role}`);
          console.log(`        ${c.url}`);
          console.log("");
        }
      }
    } finally {
      agent.close();
    }
  });

program
  .command("serve")
  .description("Run the scanner as a long-lived service with scheduled scans and briefings")
  .action(() => {
    const config = loadConfig();
    const log = createLogger(config.logLevel);

    log.info(
      { scanCron: config.scanCron, briefingCron: config.briefingCron },
      "Starting scanner service"
    );

    // Schedule scan
    const scanJob = new Cron(config.scanCron, async () => {
      const agent = new ScannerAgent(config, log);
      try {
        log.info("Scheduled scan starting");
        await agent.scan();
        log.info("Scheduled scan complete");
      } catch (err) {
        log.error({ err: err.message }, "Scheduled scan failed");
      } finally {
        agent.close();
      }
    });

    // Schedule briefing
    const briefingJob = new Cron(config.briefingCron, async () => {
      const agent = new ScannerAgent(config, log);
      try {
        log.info("Scheduled briefing starting");
        await agent.briefing({ send: true });
        log.info("Scheduled briefing sent");
      } catch (err) {
        log.error({ err: err.message }, "Scheduled briefing failed");
      } finally {
        agent.close();
      }
    });

    log.info("Scanner service running. Press Ctrl+C to stop.");
    log.info(`  Next scan:     ${scanJob.nextRun()?.toISOString()}`);
    log.info(`  Next briefing: ${briefingJob.nextRun()?.toISOString()}`);

    // Keep process alive
    process.on("SIGINT", () => {
      log.info("Shutting down scanner service");
      scanJob.stop();
      briefingJob.stop();
      process.exit(0);
    });
  });

program.parse();
