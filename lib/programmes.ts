import type { Programme } from "./types";

export const PROGRAMMES: Programme[] = [
  {
    id: "esp",
    name: "ESP — Evora Service Partner",
    shortName: "ESP",
    lead: "Srimathi Ravi",
    jiraProjectKey: "ESP"
  },
  {
    id: "recruitment",
    name: "Recruitment",
    lead: "Renuka Desshpande",
    jiraProjectKey: "ESOH"
  },
  {
    id: "evora-ach",
    name: "Evora-ACH Harmonization",
    shortName: "Evora-ACH",
    lead: "Hari Ram",
    jiraProjectKey: "ACH"
  },
  {
    id: "ocm",
    name: "OCM & Communications",
    shortName: "OCM",
    lead: "Hari Ram",
    jiraProjectKey: "ESOH"
  },
  {
    id: "ind",
    name: "IND Projects",
    lead: "Savio James Abraham",
    jiraProjectKey: "ESOH"
  },
  {
    id: "people-and-culture",
    name: "People and Culture",
    shortName: "People & Culture",
    lead: "Hari Ram",
    jiraProjectKey: "ELUE",
    subProgrammes: [
      "Job Architecture",
      "Talent Evaluation 2.0",
      "Optimizing Talent Attraction & Acquisition"
    ]
  },
  {
    id: "innovation-lab",
    name: "Innovation Lab",
    shortName: "Innovation",
    lead: "Hari Ram",
    jiraProjectKey: "ELUE",
    subProgrammes: ["Control Tower"]
  },
  {
    id: "fellowship",
    name: "Fellowship Programme",
    shortName: "Fellowship",
    lead: "Srimathi Ravi",
    jiraProjectKey: "FELLOW"
  }
];

export const PROGRAMMES_BY_ID: Record<string, Programme> = Object.fromEntries(
  PROGRAMMES.map((p) => [p.id, p])
);
