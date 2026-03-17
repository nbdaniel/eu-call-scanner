# EU Funding Call Scanner

Production tool for **Asociația Mereu pentru Europa (AMPE)** — an NGO in Craiova, Romania that manages European-funded projects (Erasmus+, Interreg, structural funds).

The agent monitors EU funding portals, parses calls using Claude's API, scores them against AMPE's organizational profile, and delivers weekly briefings.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐     ┌───────────┐
│  Scrapers   │────▶│  Enrichment  │────▶│  SQLite   │────▶│  Claude   │
│  (4 portals)│     │  (detail     │     │  Database  │     │  Scorer   │
│             │     │   fetcher)   │     │           │     │           │
└─────────────┘     └──────────────┘     └───────────┘     └─────┬─────┘
                                                                  │
                                              ┌───────────┐      │
                                              │  Briefing  │◀─────┘
                                              │  Generator │
                                              │  + Mailer  │
                                              └───────────┘
```

### Monitored Portals

| Portal | Source | What it covers |
|--------|--------|----------------|
| EU Funding & Tenders | API (SEDIA) | CERV, Erasmus+, ESF+, AMIF, Digital Europe, LIFE, Creative Europe |
| Erasmus+ | Web scrape | EU-level calls + Romanian National Agency (ANPCDEFP) |
| Interreg | Web scrape | Romania-Bulgaria, Danube Region, Interreg Europe |
| Structural Funds | Web scrape | MFE, PIDS (Inclusion), PEO (Education & Employment) |

### Scoring

Claude evaluates each call against AMPE's profile, scoring 0–100%:

- **80–100%** — Perfect match, direct alignment with core domains
- **60–79%** — Strong match, worth pursuing
- **40–59%** — Moderate match, worth monitoring
- **Below 40%** — Filtered out of briefings

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY (required) and SMTP settings (optional)

# 3. Initialize database
npm run migrate

# 4. Run a scan
npm run scan

# 5. Generate a briefing
npm run briefing

# 6. Generate and send briefing via email
node src/index.js briefing --send
```

## CLI Commands

```bash
eu-scanner scan        # Scrape all portals, enrich, store, and score calls
eu-scanner briefing    # Generate weekly briefing (add --send for email)
eu-scanner status      # Show database stats and top opportunities
eu-scanner serve       # Run as daemon with cron-scheduled scans & briefings
```

## Running as a Service

```bash
# Start the long-lived service (uses cron scheduling from .env)
npm run serve

# Default schedule:
#   Scan:     Every Monday at 06:00 (SCAN_CRON)
#   Briefing: Every Monday at 08:00 (BRIEFING_CRON)
```

For production deployment, use a process manager:

```bash
# With PM2
pm2 start src/index.js --name eu-scanner -- serve

# With systemd (create a service file)
```

## Project Structure

```
src/
├── index.js                  # CLI entry point
├── agent.js                  # Main orchestrator
├── config.js                 # Environment configuration
├── profile.js                # AMPE organizational profile
├── scrapers/
│   ├── base.js               # Base scraper class
│   ├── funding-tenders.js    # EU Funding & Tenders Portal (API)
│   ├── erasmus.js            # Erasmus+ & ANPCDEFP
│   ├── interreg.js           # Interreg programmes
│   ├── structural-funds.js   # Romanian structural funds (MFE)
│   └── index.js              # Scraper aggregator
├── analysis/
│   ├── scorer.js             # Claude-based relevance scorer
│   └── detail-fetcher.js     # Call detail page enrichment
├── briefing/
│   ├── generator.js          # Claude-based briefing writer
│   └── mailer.js             # SMTP email delivery
├── db/
│   ├── migrate.js            # Database schema & initialization
│   └── repository.js         # Data access layer
└── utils/
    ├── http.js               # HTTP client with retries
    └── logger.js             # Pino logger setup
```

## Customization

### Changing the Organization Profile

Edit `src/profile.js` to update:
- Core domains and target groups
- Programme experience
- Eligibility criteria
- Excluded topics

The scorer uses this profile to evaluate every call.

### Adding a New Portal

1. Create a new scraper in `src/scrapers/` extending `BaseScraper`
2. Implement the `scrape()` method returning `RawCall[]`
3. Register it in `src/scrapers/index.js`

## Requirements

- Node.js ≥ 20
- Anthropic API key (Claude)
- SMTP credentials (for email delivery, optional)
