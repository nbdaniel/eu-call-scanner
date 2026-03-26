require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.BRIEF_MODEL || 'claude-sonnet-4-6';

const PROFILES_FILE = path.join(__dirname, '..', 'data', 'stakeholder-profiles.json');
const WHATSAPP_DIR = path.join(__dirname, '..', 'data', 'whatsapp-briefs');

// ─── Constants ────────────────────────────────────────────────────────────────

// Calls with fewer than this many days until deadline are skipped
const MIN_DEADLINE_DAYS = 3;

// Romanian month name → 0-based index
const RO_MONTHS = {
  ianuarie: 0, februarie: 1, martie: 2, aprilie: 3,
  mai: 4, iunie: 5, iulie: 6, august: 7,
  septembrie: 8, octombrie: 9, noiembrie: 10, decembrie: 11,
};

const EN_MONTHS = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};

// Regex patterns for regions OUTSIDE Oltenia.
// If a call's TITLE matches one of these, it's region-locked elsewhere → exclude.
const EXCLUDED_REGION_TITLE = [
  /delta\s+dun[aă]rii/i,
  /iti\s+delta/i,
  /\btulcea\b/i,
  /\bdobrogea\b/i,
  /moților|motii|apuseni/i,
  /\bcluj[\s-]napoca\b|\bcluj\b/i,
  /\btimi[sș]oara\b/i,
  /\bia[sș]i\b/i,
  /\bconstanța\b|\bconstanta\b/i,
  /\bgalați\b|\bgalati\b/i,
  /\bprahova\b/i,
  /\bbrașov\b|\bbrasov\b/i,
  /\bvrancea\b/i,
  /nord[\s-]est\b/i,
  /nord[\s-]vest\b/i,
  /\bcentru\b.*regiune/i,
];

// Same patterns but for the full text body — if 2+ match, likely region-locked
const EXCLUDED_REGION_BODY = [
  /delta\s+dun[aă]rii/i,
  /iti\s+delta/i,
  /\btulcea\b/i,
  /\bdobrogea\b/i,
  /moților|motii/i,
];

// Signals that a call is Oltenia-specific or national/EU-wide → always keep
const OLTENIA_SIGNALS = [
  /oltenia/i, /\bdolj\b/i, /\bgorj\b/i, /meheding/i,
  /\bolt\b/i, /v[aâ]lcea/i, /craiova/i, /sud[\s-]vest/i,
];

// National/EU-wide signals (override region exclusion if present in title)
const NATIONAL_EU_SIGNALS = [
  /național|national|toată țara/i,
  /erasmus\+/i,
  /horizon/i,
  /interreg/i,
  /\bue\b|\beu\b|\beurope\b|\beuropean/i,
  /cerv|life|amif|esf|fedr|erc|msca/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadProfiles() {
  return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')).stakeholders;
}

function getWeekRange() {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' });
  return { start: fmt(monday), end: fmt(sunday), monday };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseDeadline(str) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  if (/curs|publicare|tbd|tbc|unknown|necunoscut|n\/a/i.test(s)) return null;

  // Romanian: "26 mai 2026"
  const roM = s.match(/(\d{1,2})\s+([a-zăîâșț]+)\s+(\d{4})/);
  if (roM && RO_MONTHS[roM[2]] !== undefined)
    return new Date(+roM[3], RO_MONTHS[roM[2]], +roM[1]);

  // English: "26 March 2026"
  const enM = s.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (enM && EN_MONTHS[enM[2]] !== undefined)
    return new Date(+enM[3], EN_MONTHS[enM[2]], +enM[1]);

  // ISO: "2026-05-26"
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  return null;
}

function daysUntilDeadline(deadlineStr) {
  const d = parseDeadline(deadlineStr);
  if (!d) return Infinity; // unknown deadline → keep
  return (d - new Date()) / (1000 * 60 * 60 * 24);
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function passesDeadlineFilter(call) {
  const days = daysUntilDeadline(call.parsed?.deadline);
  if (days < MIN_DEADLINE_DAYS) return false; // too soon or already passed
  return true;
}

function passesGeographicFilter(call) {
  const title = (call.parsed?.title || '') || '';
  const blob = [
    title,
    ((call.parsed?.thematic_areas) || []).join(' '),
    call.raw_text_content || '',
  ].join(' ');

  // If it's clearly Oltenia → always keep
  if (OLTENIA_SIGNALS.some(p => p.test(blob))) return true;

  // If title has a national/EU signal → keep regardless of region mentions
  if (NATIONAL_EU_SIGNALS.some(p => p.test(title))) return true;

  // If the TITLE names a specific non-Oltenia region → exclude
  if (EXCLUDED_REGION_TITLE.some(p => p.test(title))) return false;

  // If the body has 2+ region-lock signals and no national/EU override → exclude
  const bodyHits = EXCLUDED_REGION_BODY.filter(p => p.test(blob)).length;
  const hasNationalSignal = NATIONAL_EU_SIGNALS.some(p => p.test(blob));
  if (bodyHits >= 2 && !hasNationalSignal) return false;

  return true;
}

// ─── Relevance scoring per profile ───────────────────────────────────────────

function scoreCallForProfile(call, profile) {
  if (!call.parsed) return 0;
  const { title = '', programme = '', thematic_areas = [], action_type = '' } = call.parsed;
  const titleLow = (title || '').toLowerCase();
  const progLow = (programme || '').toLowerCase();
  const areasLow = (Array.isArray(thematic_areas) ? thematic_areas : []).join(' ').toLowerCase();
  const blobLow = [titleLow, progLow, (action_type || '').toLowerCase(), areasLow].join(' ');

  const kw = profile.keywords.map(k => k.toLowerCase());
  const progs = profile.programme_filters.map(p => p.toLowerCase());

  let score = 0;

  // Programme match (strongest signal)
  for (const p of progs) {
    if (progLow === p || progLow.startsWith(p)) score += 6;
    else if (progLow.includes(p)) score += 4;
  }

  // Keyword in title (strong)
  for (const k of kw) {
    if (titleLow.includes(k)) score += 3;
  }

  // Keyword in programme + thematic areas (medium)
  for (const k of kw) {
    if ((progLow + ' ' + areasLow).includes(k)) score += 2;
  }

  // Keyword anywhere (weak)
  for (const k of kw) {
    if (blobLow.includes(k)) score += 1;
  }

  return score;
}

// ─── Deduplication: assign each call to its single best-fit profile ───────────

function assignCallsToProfiles(calls, profiles) {
  const buckets = new Map(profiles.map(p => [p.id, []]));

  for (const call of calls) {
    let bestScore = 0;
    let bestProfileId = null;

    for (const profile of profiles) {
      const s = scoreCallForProfile(call, profile);
      if (s > bestScore) {
        bestScore = s;
        bestProfileId = profile.id;
      }
    }

    if (bestProfileId && bestScore > 0) {
      buckets.get(bestProfileId).push({ call, relevance: bestScore });
    }
    // Calls with score 0 across all profiles are dropped
  }

  // Per profile: sort by (relevance DESC, deadline soonest first) → top 5
  const result = new Map();
  for (const profile of profiles) {
    const items = buckets.get(profile.id);
    const sorted = items
      .sort((a, b) => {
        const diff = b.relevance - a.relevance;
        if (diff !== 0) return diff;
        // Secondary: soonest deadline first (Infinity for unknown = pushed to end)
        const da = daysUntilDeadline(a.call.parsed?.deadline);
        const db = daysUntilDeadline(b.call.parsed?.deadline);
        return da - db;
      })
      .slice(0, 5)
      .map(item => item.call);
    result.set(profile.id, sorted);
  }

  return result;
}

// ─── Claude message generation ────────────────────────────────────────────────

async function generateMessage(profile, calls, weekRange) {
  const callsData = calls.map(c => ({
    title: c.parsed.title,
    programme: c.parsed.programme,
    deadline: c.parsed.deadline,
    budget: c.parsed.budget,
    url: c.parsed.url,
    thematic_areas: c.parsed.thematic_areas,
    summary: (c.score?.reasoning || '').slice(0, 200),
  }));

  const prompt = `Ești comunicatorul pentru Europe Direct Craiova, gestionat de Asociația Mereu pentru Europa (AMPE), în Oltenia.

Generează un mesaj WhatsApp în limba română pentru grupul: **${profile.label}** (${profile.description_ro})

Săptămâna: ${weekRange.start} – ${weekRange.end}

${callsData.length === 0
    ? 'Nu există apeluri relevante această săptămână.'
    : `Apeluri relevante găsite:\n${JSON.stringify(callsData, null, 2)}`}

STRUCTURA OBLIGATORIE (respectă EXACT, inclusiv simbolurile):

${profile.emoji} OPORTUNITĂȚI UE — ${profile.label}

📅 Săptămâna ${weekRange.start} – ${weekRange.end}

${callsData.length > 0
    ? `▸ {Titlu tradus/adaptat în română}
  Program: {programul UE}
  Deadline: {data limită sau "în curs de publicare"}
  Buget orientativ: {dacă e disponibil — altfel omite această linie}
  Ce finanțează: {1 frază scurtă și clară în română, fără jargon}
  🔗 {URL complet}

[Repetă pentru fiecare apel, max 5]`
    : `Săptămâna aceasta nu am identificat apeluri noi specifice pentru această categorie. Revenim săptămâna viitoare!`}

---
💡 Vrei ajutor cu un proiect? Scrie-ne în privat sau la europe-direct.craiova@ampe.ro

UE în Oltenia | Asociația Mereu pentru Europa

REGULI STRICTE:
- Limbă: EXCLUSIV ROMÂNĂ — traduce titlurile în română, nu le lăsa în engleză
- Lungime MAXIMĂ: 1500 caractere total (CRITIC — numără toate caracterele inclusiv spații)
- Dacă depășești 1500 caractere, scurtează descrierile sau reduce numărul de apeluri la 3
- Ton: informativ, direct, prietenos — fără jargon tehnic
- Fără hashtags
- Footer-ul AMPE apare ÎNTOTDEAUNA la final
- Răspunde DOAR cu mesajul gata de copy-paste, fără explicații`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text.trim();
}

function fallbackMessage(profile, weekRange) {
  return [
    `${profile.emoji} OPORTUNITĂȚI UE — ${profile.label}`,
    ``,
    `📅 Săptămâna ${weekRange.start} – ${weekRange.end}`,
    ``,
    `Săptămâna aceasta nu am identificat apeluri noi specifice pentru această categorie. Revenim săptămâna viitoare!`,
    ``,
    `---`,
    `💡 Vrei ajutor cu un proiect? Scrie-ne în privat sau la europe-direct.craiova@ampe.ro`,
    ``,
    `UE în Oltenia | Asociația Mereu pentru Europa`,
  ].join('\n');
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function generateWhatsappBriefs(calls, date) {
  const profiles = loadProfiles();
  const weekRange = getWeekRange();
  const briefingDate = date || new Date().toISOString().slice(0, 10);

  ensureDir(WHATSAPP_DIR);

  // Step 1: pre-filter — deadline not too soon + geographic relevance
  const beforeFilter = calls.length;
  const eligible = calls.filter(c => {
    if (!c.parsed) return false;
    if (!passesDeadlineFilter(c)) return false;
    if (!passesGeographicFilter(c)) return false;
    return true;
  });
  console.log(`[WHATSAPP] Filtrare: ${beforeFilter} total → ${eligible.length} eligibile (deadline OK + geo OK)`);

  // Step 2: assign each call to its best-fit profile (deduplication)
  const assignments = assignCallsToProfiles(eligible, profiles);

  // Step 3: generate one message per profile
  const results = [];

  for (const profile of profiles) {
    console.log(`[WHATSAPP] ${profile.emoji}  ${profile.label}...`);
    const relevant = assignments.get(profile.id) || [];
    console.log(`  → ${relevant.length} apeluri dedicate acestei categorii`);

    let message;
    try {
      message = await generateMessage(profile, relevant, weekRange);
    } catch (err) {
      console.error(`  [WARN] ${profile.id}: ${err.message}`);
      message = fallbackMessage(profile, weekRange);
    }

    const filepath = path.join(WHATSAPP_DIR, `${profile.id}.txt`);
    fs.writeFileSync(filepath, message, 'utf8');
    results.push({ profile, callCount: relevant.length, charCount: message.length });
    console.log(`  → Salvat (${message.length} caractere)`);
  }

  // Step 4: write index.txt with posting calendar
  const POSTING_CALENDAR = [
    { day: 'Luni',     id: 'primarii' },
    { day: 'Marți',    id: 'imm'      },
    { day: 'Miercuri', id: 'ong'      },
    { day: 'Joi',      id: 'educatie' },
    { day: 'Vineri',   id: 'tineri'   },
    { day: 'Sâmbătă',  id: 'cetateni' },
    { day: 'Duminică', id: 'medici'   },
  ];

  const byId = Object.fromEntries(results.map(r => [r.profile.id, r]));
  const totalCalls = results.reduce((s, r) => s + r.callCount, 0);
  const { monday } = weekRange;

  const calendarLines = POSTING_CALENDAR.map((entry, i) => {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    const dateStr = dayDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' });
    const r = byId[entry.id];
    const status = r.callCount > 0 ? `${r.callCount} apeluri` : 'fără apeluri noi';
    return `  ${entry.day.padEnd(10)} ${dateStr.padEnd(16)} → ${entry.id}.txt   [${status}, ${r.charCount} caractere]`;
  });

  const lines = [
    `WHATSAPP BRIEFS — ${briefingDate}`,
    `Generat: ${new Date().toLocaleString('ro-RO')}`,
    `Apeluri eligibile după filtrare: ${eligible.length} / ${beforeFilter}`,
    `Total apeluri distribuite: ${totalCalls} (în ${results.length} categorii)`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'CALENDAR DE POSTARE — SĂPTĂMÂNA ACEASTA',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    ...calendarLines,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'DETALII PER CATEGORIE',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    ...POSTING_CALENDAR.map(entry => {
      const r = byId[entry.id];
      return [
        `${r.profile.emoji}  ${r.profile.label}`,
        `   Fișier:            whatsapp-briefs/${entry.id}.txt`,
        `   Apeluri relevante: ${r.callCount}`,
        `   Lungime mesaj:     ${r.charCount} caractere`,
        `   Zi de postare:     ${entry.day}`,
        '',
      ].join('\n');
    }),
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'NOTĂ: Copiază fiecare fișier .txt și trimite-l în grupul WhatsApp corespunzător.',
    'Verifică deadline-urile înainte de postare — pot fi actualizate față de săptămâna trecută.',
  ];

  const indexPath = path.join(WHATSAPP_DIR, 'index.txt');
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf8');
  console.log(`[WHATSAPP] Index salvat → ${indexPath}`);

  return results;
}

module.exports = { generateWhatsappBriefs };
