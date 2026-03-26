require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.BRIEF_MODEL || 'claude-sonnet-4-6';

const PROFILES_FILE = path.join(__dirname, '..', 'data', 'stakeholder-profiles.json');
const WHATSAPP_DIR = path.join(__dirname, '..', 'data', 'whatsapp-briefs');

function loadProfiles() {
  return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')).stakeholders;
}

function getWeekRange() {
  const today = new Date();
  const dow = today.getDay(); // 0 = Sunday
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' });
  return { start: fmt(monday), end: fmt(sunday) };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function filterCallsForProfile(calls, profile) {
  const kw = profile.keywords.map(k => k.toLowerCase());
  const progs = profile.programme_filters.map(p => p.toLowerCase());

  return calls
    .filter(c => {
      if (!c.parsed) return false;
      const { title = '', programme = '', thematic_areas = [], action_type = '' } = c.parsed;
      const blob = [
        title,
        programme,
        action_type,
        ...(Array.isArray(thematic_areas) ? thematic_areas : []),
        c.raw_text_content || '',
      ].join(' ').toLowerCase();

      return progs.some(p => blob.includes(p)) || kw.some(k => blob.includes(k));
    })
    .sort((a, b) => (b.score?.score || 0) - (a.score?.score || 0))
    .slice(0, 5);
}

async function generateMessage(profile, calls, weekRange) {
  const callsData = calls.map(c => ({
    title: c.parsed.title,
    programme: c.parsed.programme,
    deadline: c.parsed.deadline,
    budget: c.parsed.budget,
    url: c.parsed.url,
    thematic_areas: c.parsed.thematic_areas,
    summary: (c.score?.reasoning || '').slice(0, 250),
  }));

  const prompt = `Ești comunicatorul pentru Europe Direct Craiova, gestionat de Asociația Mereu pentru Europa (AMPE).

Generează un mesaj WhatsApp în limba română pentru grupul: **${profile.label}** (${profile.description_ro})

Săptămâna: ${weekRange.start} – ${weekRange.end}

${callsData.length === 0
  ? 'Nu există apeluri relevante această săptămână.'
  : `Apeluri relevante găsite:\n${JSON.stringify(callsData, null, 2)}`}

STRUCTURA OBLIGATORIE (respectă EXACT, inclusiv simbolurile):

${profile.emoji} OPORTUNITĂȚI UE — ${profile.label}

📅 Săptămâna ${weekRange.start} – ${weekRange.end}

${callsData.length > 0
  ? `[Inserează fiecare apel în formatul de mai jos, max 5:]

▸ {Titlu tradus/adaptat în română}
  Program: {programul UE}
  Deadline: {data limită sau "în curs de publicare"}
  Buget orientativ: {dacă e disponibil — altfel omite această linie}
  Ce finanțează: {1 frază scurtă și clară în română, fără jargon}
  🔗 {URL complet}`
  : `Săptămâna aceasta nu am identificat apeluri noi specifice pentru această categorie. Revenim săptămâna viitoare!`}

---
💡 Vrei ajutor cu un proiect? Scrie-ne în privat sau la europe-direct.craiova@ampe.ro

UE în Oltenia | Asociația Mereu pentru Europa

REGULI STRICTE:
- Limbă: EXCLUSIV ROMÂNĂ — traduce titlurile în română, nu le lăsa în engleză
- Lungime MAXIMĂ: 1500 caractere (numără inclusiv spațiile — WhatsApp e limitat)
- Dacă mesajul depășește 1500 caractere, scurtează descrierile sau reduce la 3 apeluri
- Ton: informativ, direct, prietenos — fără jargon tehnic sau birocrație
- Fără hashtags
- Footer-ul AMPE apare ÎNTOTDEAUNA la final
- Răspunde DOAR cu mesajul gata de copy-paste, fără niciun comentariu suplimentar`;

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

async function generateWhatsappBriefs(calls, date) {
  const profiles = loadProfiles();
  const weekRange = getWeekRange();
  const briefingDate = date || new Date().toISOString().slice(0, 10);

  ensureDir(WHATSAPP_DIR);

  const results = [];

  for (const profile of profiles) {
    console.log(`[WHATSAPP] ${profile.emoji}  ${profile.label}...`);
    const relevant = filterCallsForProfile(calls, profile);
    console.log(`  → ${relevant.length} apeluri relevante`);

    let message;
    try {
      message = await generateMessage(profile, relevant, weekRange);
    } catch (err) {
      console.error(`  [WARN] Claude error pentru ${profile.id}: ${err.message}`);
      message = fallbackMessage(profile, weekRange);
    }

    const filepath = path.join(WHATSAPP_DIR, `${profile.id}.txt`);
    fs.writeFileSync(filepath, message, 'utf8');
    results.push({ profile, callCount: relevant.length, charCount: message.length });
    console.log(`  → Salvat (${message.length} caractere)`);
  }

  // Index file
  const sorted = [...results].sort((a, b) => b.callCount - a.callCount);
  const lines = [
    `WHATSAPP BRIEFS — ${briefingDate}`,
    `Generat: ${new Date().toLocaleString('ro-RO')}`,
    '',
    'ORDINE RECOMANDATĂ DE POSTARE (după numărul de apeluri relevante):',
    '',
    ...sorted.map((r, i) => [
      `${i + 1}. ${r.profile.emoji}  ${r.profile.label}`,
      `   Fișier: whatsapp-briefs/${r.profile.id}.txt`,
      `   Apeluri relevante: ${r.callCount} | Lungime: ${r.charCount} caractere`,
      '',
    ].join('\n')),
    '---',
    'NOTĂ: Copiază fiecare fișier .txt și trimite-l în grupul WhatsApp corespunzător.',
    'Verifică deadline-urile înainte de postare — pot fi actualizate față de săptămâna trecută.',
  ];

  const indexPath = path.join(WHATSAPP_DIR, 'index.txt');
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf8');
  console.log(`[WHATSAPP] Index salvat → ${indexPath}`);

  return results;
}

module.exports = { generateWhatsappBriefs };
