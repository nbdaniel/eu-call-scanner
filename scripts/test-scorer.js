require('dotenv').config();
const { scoreCall } = require('../src/scorer');

const sample = {
  id: 'test-ka2-2025',
  source: 'erasmus-plus',
  url: 'https://erasmus-plus.ec.europa.eu/calls/2025/ka2-youth',
  title: 'Erasmus+ KA2 — Cooperation Partnerships in Youth',
  programme: 'Erasmus+',
  action_type: 'KA2',
  deadline: '2025-04-05',
  open_date: '2024-11-20',
  budget: {
    min_grant: 60000,
    max_grant: 400000,
    total_budget: null,
    currency: 'EUR',
  },
  description:
    'Supports transnational cooperation partnerships between youth organisations to develop innovative practices, promote active citizenship, and foster social inclusion among young people aged 13–30 through non-formal learning approaches.',
  eligible_countries: ['ALL_EU', 'AL', 'MK', 'RS', 'TR', 'UA'],
  eligible_org_types: ['NGO', 'Youth club', 'Association', 'Public body', 'Informal group'],
  thematic_areas: ['Youth', 'Social inclusion', 'Non-formal education', 'Active citizenship', 'Digital transformation'],
  partnership_required: true,
  min_partners: 3,
};

(async () => {
  console.log('Testing scorer — Erasmus+ KA2 sample call\n');
  console.log(`Call:       ${sample.title}`);
  console.log(`Programme:  ${sample.programme} / ${sample.action_type}`);
  console.log(`Deadline:   ${sample.deadline}`);
  console.log(`Budget:     €${sample.budget.min_grant.toLocaleString()} – €${sample.budget.max_grant.toLocaleString()}\n`);

  try {
    const result = await scoreCall(sample);
    console.log('Score result:\n');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nFinal score: ${result.score}/100 — ${result.label}`);
    console.log(`Recommendation: ${result.recommendation}`);
    console.log('\nScorer test passed.');
  } catch (err) {
    console.error('Scorer test FAILED:', err.message);
    process.exit(1);
  }
})();
