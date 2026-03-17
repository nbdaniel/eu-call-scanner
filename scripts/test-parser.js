require('dotenv').config();
const { parseCall } = require('../src/parser');

const sample = {
  source: 'erasmus-plus',
  raw_id: 'test-ka2-2025',
  title: 'Erasmus+ KA2 — Cooperation Partnerships in Youth',
  url: 'https://erasmus-plus.ec.europa.eu/calls/2025/ka2-youth',
  text_content: `
Title: Erasmus+ KA2 — Cooperation Partnerships in Youth
Programme: Erasmus+ | Action: KA2 Cooperation Partnerships | Sector: Youth

This call supports transnational cooperation partnerships between youth organisations to develop
innovative practices, promote active citizenship, and foster social inclusion among young people
aged 13–30. Projects should address challenges facing youth through non-formal learning,
transnational exchanges, and capacity building.

Eligible organisations: NGOs, youth clubs, associations, public bodies, informal groups of young people
Eligible countries: EU Member States + Programme countries (Albania, North Macedonia, Serbia, Turkey, Ukraine, etc.)
Budget per project: €60,000 – €400,000
Duration: 12 to 36 months
Deadline: 5 April 2025 (12:00 Brussels time)
Partners required: minimum 3 organisations from 3 different programme countries

Priority themes this round: social inclusion, digital transformation, environment and climate change,
democratic participation

Application: via ERASMUS+ National Agency (ANPCDEFP in Romania)
`.trim(),
  metadata: {
    deadline: '2025-04-05',
    programme: 'Erasmus+',
    status: 'OPEN',
  },
};

(async () => {
  console.log('Testing parser — Erasmus+ KA2 sample call\n');
  try {
    const result = await parseCall(sample);
    console.log('Result:\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('\nParser test passed.');
  } catch (err) {
    console.error('Parser test FAILED:', err.message);
    process.exit(1);
  }
})();
