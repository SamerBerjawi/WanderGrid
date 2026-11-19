export interface TopAirline {
  iata: string;
  name: string;
  country: string;
  domain: string;
}

// Airports are not listed here: they come from the server's live airport table (services/airportIndex.ts).

// -------------------------------------------------------------
// TOP 50 MOST USED AIRLINES IN THE WORLD
// Curated for instantaneous first-step retrieval (0ms latency)
// -------------------------------------------------------------
export const TOP_50_AIRLINES: TopAirline[] = [
  { iata: "DL", name: "Delta Air Lines", country: "United States", domain: "delta.com" },
  { iata: "AA", name: "American Airlines", country: "United States", domain: "aa.com" },
  { iata: "UA", name: "United Airlines", country: "United States", domain: "united.com" },
  { iata: "WN", name: "Southwest Airlines", country: "United States", domain: "southwest.com" },
  { iata: "BA", name: "British Airways", country: "United Kingdom", domain: "britishairways.com" },
  { iata: "AF", name: "Air France", country: "France", domain: "airfrance.com" },
  { iata: "LH", name: "Lufthansa", country: "Germany", domain: "lufthansa.com" },
  { iata: "EK", name: "Emirates", country: "United Arab Emirates", domain: "emirates.com" },
  { iata: "QR", name: "Qatar Airways", country: "Qatar", domain: "qatarairways.com" },
  { iata: "SQ", name: "Singapore Airlines", country: "Singapore", domain: "singaporeair.com" },
  { iata: "CX", name: "Cathay Pacific", country: "Hong Kong", domain: "cathaypacific.com" },
  { iata: "KL", name: "KLM Royal Dutch Airlines", country: "Netherlands", domain: "klm.com" },
  { iata: "QF", name: "Qantas", country: "Australia", domain: "qantas.com" },
  { iata: "AC", name: "Air Canada", country: "Canada", domain: "aircanada.com" },
  { iata: "TK", name: "Turkish Airlines", country: "Turkey", domain: "turkishairlines.com" },
  { iata: "EY", name: "Etihad Airways", country: "United Arab Emirates", domain: "etihad.com" },
  { iata: "VS", name: "Virgin Atlantic", country: "United Kingdom", domain: "virginatlantic.com" },
  { iata: "FR", name: "Ryanair", country: "Ireland", domain: "ryanair.com" },
  { iata: "U2", name: "easyJet", country: "United Kingdom", domain: "easyjet.com" },
  { iata: "B6", name: "JetBlue Airways", country: "United States", domain: "jetblue.com" },
  { iata: "AS", name: "Alaska Airlines", country: "United States", domain: "alaskaair.com" },
  { iata: "NK", name: "Spirit Airlines", country: "United States", domain: "spirit.com" },
  { iata: "F9", name: "Frontier Airlines", country: "United States", domain: "flyfrontier.com" },
  { iata: "JL", name: "Japan Airlines", country: "Japan", domain: "jal.co.jp" },
  { iata: "NH", name: "All Nippon Airways", country: "Japan", domain: "ana.co.jp" },
  { iata: "KE", name: "Korean Air", country: "South Korea", domain: "koreanair.com" },
  { iata: "OZ", name: "Asiana Airlines", country: "South Korea", domain: "flyasiana.com" },
  { iata: "BR", name: "EVA Air", country: "Taiwan", domain: "evaair.com" },
  { iata: "CI", name: "China Airlines", country: "Taiwan", domain: "china-airlines.com" },
  { iata: "CZ", name: "China Southern Airlines", country: "China", domain: "csair.com" },
  { iata: "MU", name: "China Eastern Airlines", country: "China", domain: "ceair.com" },
  { iata: "CA", name: "Air China", country: "China", domain: "airchina.com" },
  { iata: "AI", name: "Air India", country: "India", domain: "airindia.com" },
  { iata: "6E", name: "IndiGo", country: "India", domain: "goindigo.in" },
  { iata: "IB", name: "Iberia", country: "Spain", domain: "iberia.com" },
  { iata: "TP", name: "TAP Air Portugal", country: "Portugal", domain: "flytap.com" },
  { iata: "AZ", name: "ITA Airways", country: "Italy", domain: "ita-airways.com" },
  { iata: "LX", name: "SWISS", country: "Switzerland", domain: "swiss.com" },
  { iata: "OS", name: "Austrian Airlines", country: "Austria", domain: "austrian.com" },
  { iata: "SK", name: "Scandinavian Airlines (SAS)", country: "Sweden", domain: "flysas.com" },
  { iata: "AY", name: "Finnair", country: "Finland", domain: "finnair.com" },
  { iata: "EI", name: "Aer Lingus", country: "Ireland", domain: "aerlingus.com" },
  { iata: "W6", name: "Wizz Air", country: "Hungary", domain: "wizzair.com" },
  { iata: "D8", name: "Norwegian Air", country: "Norway", domain: "norwegian.com" },
  { iata: "SV", name: "Saudia", country: "Saudi Arabia", domain: "saudia.com" },
  { iata: "ME", name: "Middle East Airlines", country: "Lebanon", domain: "mea.com.lb" },
  { iata: "MS", name: "EgyptAir", country: "Egypt", domain: "egyptair.com" },
  { iata: "ET", name: "Ethiopian Airlines", country: "Ethiopia", domain: "ethiopianairlines.com" },
  { iata: "LA", name: "LATAM Airlines", country: "Chile", domain: "latamairlines.com" },
  { iata: "AV", name: "Avianca", country: "Colombia", domain: "avianca.com" }
];

// Pre-indexed lookups
export const TOP_AIRLINES_BY_IATA = new Map<string, TopAirline>(
  TOP_50_AIRLINES.map(c => [c.iata.toUpperCase(), c])
);

export const AIRLINE_CODES: Record<string, string> = Object.fromEntries(
  TOP_50_AIRLINES.map(c => [c.iata, c.name])
);

export const TOP_AIRLINE_DOMAINS: Record<string, string> = Object.fromEntries([
  ...TOP_50_AIRLINES.map(c => [c.iata.toLowerCase(), c.domain]),
  ...TOP_50_AIRLINES.map(c => [c.name.toLowerCase().replace(/[^a-z0-9]/g, ''), c.domain]),
  ...TOP_50_AIRLINES.map(c => [c.name.toLowerCase(), c.domain])
]);

// -------------------------------------------------------------
// FIRST-STEP LOCAL RETRIEVAL HELPERS (0ms latency)
// -------------------------------------------------------------
export function searchTopAirlines(query: string, limit: number = 15): TopAirline[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exactMatches: TopAirline[] = [];
  const prefixMatches: TopAirline[] = [];
  const nameMatches: TopAirline[] = [];

  for (const c of TOP_50_AIRLINES) {
    const iataLower = c.iata.toLowerCase();
    const nameLower = c.name.toLowerCase();
    const countryLower = c.country.toLowerCase();

    if (iataLower === q) {
      exactMatches.push(c);
    } else if (iataLower.startsWith(q)) {
      prefixMatches.push(c);
    } else if (nameLower.includes(q) || countryLower.includes(q)) {
      nameMatches.push(c);
    }
  }

  return [...exactMatches, ...prefixMatches, ...nameMatches].slice(0, limit);
}
