// A fixed list, so the public sector column is never free text that escaped the lint.
export const SECTORS = [
  "Automobiles", "Banks", "Capital goods", "Chemicals", "Construction", "Consumer durables", "FMCG", "Financial services",
  "Healthcare", "IT services", "Media", "Metals and mining", "Oil and gas", "Power", "Realty", "Retail", "Telecom",
  "Textiles", "Transport and logistics", "Other",
] as const;
export type Sector = (typeof SECTORS)[number];
