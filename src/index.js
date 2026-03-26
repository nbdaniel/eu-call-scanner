#!/usr/bin/env node
require('dotenv').config();

const [command, ...flags] = process.argv.slice(2);

async function runScan() {
  const { scan } = require('./scanner');
  await scan({ forceReparse: flags.includes('--force') });
}

async function runBriefing() {
  const { loadCalls } = require('./storage');
  const { generateBriefing } = require('./briefing');

  console.log('[BRIEFING] Loading calls from storage...');
  const calls = loadCalls();

  if (calls.length === 0) {
    console.error('[BRIEFING] No calls in database. Run `npm run scan` first.');
    process.exit(1);
  }

  const entries = calls
    .filter(c => c.parsed && c.score)
    .map(c => ({ parsed: c.parsed, score: c.score }));

  console.log(`[BRIEFING] ${entries.length} scored calls. Generating briefing with Claude...`);

  const { content, filepath } = await generateBriefing(entries);
  console.log(`[BRIEFING] Saved → ${filepath}\n`);
  console.log(content);
}

async function runWeekly() {
  const { scan } = require('./scanner');
  const { loadCalls } = require('./storage');
  const { generateBriefing } = require('./briefing');
  const { generateWhatsappBriefs } = require('./whatsapp');

  const startTime = Date.now();
  const sep = '─'.repeat(52);

  console.log(sep);
  console.log('  AMPE EU SCANNER — PIPELINE COMPLET');
  console.log(`  ${new Date().toLocaleString('ro-RO')}`);
  console.log(sep);

  // 1. SCAN
  console.log('\n[1/3] SCANARE PORTALE...\n');
  await scan({ forceReparse: flags.includes('--force') });

  // 2. BRIEFING
  console.log('\n[2/3] GENERARE BRIEF AMPE (.md)...\n');
  const calls = loadCalls();
  const entries = calls.filter(c => c.parsed && c.score).map(c => ({ parsed: c.parsed, score: c.score }));
  const { filepath: briefingPath } = await generateBriefing(entries);

  // 3. WHATSAPP
  console.log('\n[3/3] GENERARE MESAJE WHATSAPP...\n');
  const whatsappResults = await generateWhatsappBriefs(calls.filter(c => c.parsed && c.score));

  // REZUMAT FINAL
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const totalScored = entries.length;
  const priority = entries.filter(e => e.score.score >= 80).length;
  const good = entries.filter(e => e.score.score >= 60).length;
  const totalWA = whatsappResults.reduce((s, r) => s + r.callCount, 0);

  console.log(`\n${sep}`);
  console.log('  REZUMAT PIPELINE');
  console.log(sep);
  console.log(`  Durată totală:      ${elapsed}s`);
  console.log(`  Apeluri în baza DB: ${totalScored}`);
  console.log(`  Prioritare (≥80):   ${priority}`);
  console.log(`  Bune (≥60):         ${good}`);
  console.log(sep);
  console.log('  FIȘIERE GENERATE');
  console.log(sep);
  console.log(`  Brief AMPE:         ${briefingPath}`);
  console.log(`  WhatsApp mesaje:    ${whatsappResults.length} fișiere în data/whatsapp-briefs/`);
  console.log('');

  // Calendar de postare
  const CALENDAR = [
    { day: 'Luni    ', id: 'primarii' },
    { day: 'Marți   ', id: 'imm'      },
    { day: 'Miercuri', id: 'ong'      },
    { day: 'Joi     ', id: 'educatie' },
    { day: 'Vineri  ', id: 'tineri'   },
    { day: 'Sâmbătă ', id: 'cetateni' },
    { day: 'Duminică', id: 'medici'   },
  ];
  const byId = Object.fromEntries(whatsappResults.map(r => [r.profile.id, r]));
  console.log('  CALENDAR POSTARE WHATSAPP');
  console.log(sep);
  CALENDAR.forEach(entry => {
    const r = byId[entry.id];
    const bar = '█'.repeat(r.callCount) || '○';
    console.log(`  ${entry.day}  ${entry.id.padEnd(10)} ${bar} ${r.callCount} apeluri`);
  });
  console.log(`\n  Total apeluri distribuite WhatsApp: ${totalWA}`);
  console.log(sep);
}

async function runWhatsapp() {
  const { loadCalls } = require('./storage');
  const { generateWhatsappBriefs } = require('./whatsapp');

  console.log('[WHATSAPP] Loading calls from storage...');
  const calls = loadCalls();

  if (calls.length === 0) {
    console.error('[WHATSAPP] No calls in database. Run `npm run scan` first.');
    process.exit(1);
  }

  const entries = calls.filter(c => c.parsed && c.score);
  console.log(`[WHATSAPP] ${entries.length} scored calls. Generating WhatsApp messages...`);

  const results = await generateWhatsappBriefs(entries);
  const total = results.reduce((s, r) => s + r.callCount, 0);
  console.log(`\n[WHATSAPP] Done. ${results.length} mesaje generate în data/whatsapp-briefs/`);
  console.log(`[WHATSAPP] Total apeluri distribuite: ${total}`);
}

async function runSchedule() {
  const cron = require('node-cron');
  const { scan } = require('./scanner');
  const { loadCalls } = require('./storage');
  const { generateBriefing } = require('./briefing');

  const cronExpr = process.env.SCAN_CRON || '0 8 * * 1';
  console.log(`[SCHEDULE] Cron: "${cronExpr}" (every Monday at 08:00 by default)`);
  console.log('[SCHEDULE] Running initial scan now...\n');

  await scan();

  cron.schedule(cronExpr, async () => {
    console.log(`\n[SCHEDULE] Triggered at ${new Date().toISOString()}`);
    await scan();

    const entries = loadCalls()
      .filter(c => c.parsed && c.score)
      .map(c => ({ parsed: c.parsed, score: c.score }));

    const { filepath } = await generateBriefing(entries);
    console.log(`[SCHEDULE] Briefing → ${filepath}`);
  });
}

function printHelp() {
  console.log(`
eu-scanner — EU Funding Call Scanner for AMPE

Commands:
  npm run scan              Fetch and score new EU funding calls
  npm run scan -- --force   Re-process all calls (ignore seen cache)
  npm run briefing          Generate this week's funding briefing
  npm run schedule          Run on weekly cron schedule

  npm run weekly            Run full pipeline: scan + briefing + whatsapp
  npm run whatsapp          Generate WhatsApp messages per stakeholder profile
  npm run test:parser       Test the Claude parser with a sample call
  npm run test:scorer       Test the Claude scorer with a sample call

Global install:
  npm install -g .
  eu-scanner scan | briefing | schedule
`);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[ERROR] ANTHROPIC_API_KEY is not set. Add it to your .env file.');
  process.exit(1);
}

(async () => {
  switch (command) {
    case 'scan':      return runScan();
    case 'briefing':  return runBriefing();
    case 'whatsapp':  return runWhatsapp();
    case 'weekly':    return runWeekly();
    case 'schedule':  return runSchedule();
    default:         return printHelp();
  }
})().catch(err => {
  console.error(`[FATAL] ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
