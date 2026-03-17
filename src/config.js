import "dotenv/config";

/** @returns {import('./types.js').Config} */
export function loadConfig() {
  const required = (key) => {
    const v = process.env[key];
    if (!v) throw new Error(`Missing required env var: ${key}`);
    return v;
  };
  const optional = (key, fallback) => process.env[key] || fallback;

  return Object.freeze({
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    claudeModel: optional("CLAUDE_MODEL", "claude-sonnet-4-20250514"),

    // Email / SMTP
    smtpHost: optional("SMTP_HOST", ""),
    smtpPort: parseInt(optional("SMTP_PORT", "587"), 10),
    smtpUser: optional("SMTP_USER", ""),
    smtpPass: optional("SMTP_PASS", ""),
    emailFrom: optional("EMAIL_FROM", "scanner@ampe.ro"),
    emailTo: optional("EMAIL_TO", "").split(",").map((s) => s.trim()).filter(Boolean),

    // Database
    dbPath: optional("DB_PATH", "./data/scanner.db"),

    // Scheduling
    scanCron: optional("SCAN_CRON", "0 6 * * 1"),        // Monday 6 AM
    briefingCron: optional("BRIEFING_CRON", "0 8 * * 1"), // Monday 8 AM

    // Tuning
    minRelevanceScore: parseFloat(optional("MIN_RELEVANCE_SCORE", "0.4")),
    maxConcurrentScrapes: parseInt(optional("MAX_CONCURRENT_SCRAPES", "3"), 10),

    // Logging
    logLevel: optional("LOG_LEVEL", "info"),
  });
}
