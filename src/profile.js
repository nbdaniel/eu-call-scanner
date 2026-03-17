/**
 * Organizational profile for Asociația Mereu pentru Europa (AMPE).
 * Used by the Claude-based scorer to evaluate call relevance.
 */
export const organizationProfile = Object.freeze({
  name: "Asociația Mereu pentru Europa (AMPE)",
  location: "Craiova, Dolj County, Romania",
  nutsRegion: "RO411 – Dolj",
  type: "Non-governmental organization (NGO)",
  legalStatus: "Romanian association under OG 26/2000",

  mission:
    "AMPE promotes European values, intercultural dialogue, and active citizenship " +
    "in South-West Oltenia through European-funded projects. We empower youth, " +
    "educators, and civil society organizations to engage with EU opportunities.",

  coreDomains: [
    "Youth empowerment and non-formal education",
    "Active citizenship and civic participation",
    "Intercultural dialogue and inclusion of minorities (Roma, migrants)",
    "Digital skills and digital transformation for NGOs",
    "Green transition and environmental awareness",
    "Social entrepreneurship and local development",
    "Capacity building for civil society organizations",
  ],

  targetGroups: [
    "Young people (15-30), especially NEETs and those with fewer opportunities",
    "Educators and youth workers",
    "Civil society organizations in the South-West Oltenia region",
    "Local public authorities and community leaders",
    "Marginalized communities (Roma, rural populations)",
  ],

  programExperience: [
    {
      program: "Erasmus+ (KA1, KA2, KA3)",
      role: "Applicant and partner",
      experience: "Multiple youth exchanges, training courses, strategic partnerships",
    },
    {
      program: "European Solidarity Corps",
      role: "Hosting and sending organization",
      experience: "Volunteer placements and solidarity projects",
    },
    {
      program: "Interreg Romania-Bulgaria / Danube Transnational",
      role: "Partner",
      experience: "Cross-border cooperation on social inclusion and tourism",
    },
    {
      program: "POCA / POCU (Romanian Operational Programmes)",
      role: "Partner",
      experience: "Administrative capacity and human capital development",
    },
    {
      program: "EEA and Norway Grants",
      role: "Applicant",
      experience: "Active citizens fund projects",
    },
    {
      program: "CERV (Citizens, Equality, Rights and Values)",
      role: "Applicant / partner",
      experience: "Town twinning, civic engagement",
    },
  ],

  organizationalCapacity: {
    teamSize: "8-12 core staff + network of 30+ volunteers",
    annualBudget: "€100,000 – €300,000 (project-based)",
    languages: ["Romanian", "English", "French", "Bulgarian"],
    partnerships: "Network of 50+ partner organizations across 15 EU countries",
  },

  eligibilityCriteria: {
    canApplyAsLead: true,
    canApplyAsPartner: true,
    maxProjectBudget: 500_000,
    preferredDuration: "12-36 months",
    regionFocus: ["South-West Oltenia", "Romania", "Danube Region", "EU-wide"],
  },

  excludedTopics: [
    "Heavy industry and manufacturing infrastructure",
    "Agricultural production and CAP direct payments",
    "Large-scale transport infrastructure",
    "Military and defense research",
    "Nuclear energy",
    "Pharmaceutical R&D",
  ],
});

/**
 * Returns a compact text representation for inclusion in Claude prompts.
 */
export function profileToPromptText() {
  const p = organizationProfile;
  return `
ORGANIZATION: ${p.name}
LOCATION: ${p.location} (NUTS: ${p.nutsRegion})
TYPE: ${p.type}
MISSION: ${p.mission}

CORE DOMAINS:
${p.coreDomains.map((d) => `  - ${d}`).join("\n")}

TARGET GROUPS:
${p.targetGroups.map((g) => `  - ${g}`).join("\n")}

PROGRAM EXPERIENCE:
${p.programExperience.map((e) => `  - ${e.program}: ${e.experience} (as ${e.role})`).join("\n")}

CAPACITY: ${p.organizationalCapacity.teamSize}, budget ${p.organizationalCapacity.annualBudget}
LANGUAGES: ${p.organizationalCapacity.languages.join(", ")}
PARTNERSHIPS: ${p.organizationalCapacity.partnerships}

ELIGIBILITY: Can apply as ${p.eligibilityCriteria.canApplyAsLead ? "lead applicant" : "partner only"}. Max budget: €${p.eligibilityCriteria.maxProjectBudget.toLocaleString()}. Preferred duration: ${p.eligibilityCriteria.preferredDuration}.
REGION FOCUS: ${p.eligibilityCriteria.regionFocus.join(", ")}

EXCLUDED TOPICS (not relevant):
${p.excludedTopics.map((t) => `  - ${t}`).join("\n")}
`.trim();
}
