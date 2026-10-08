/**
 * IATA to ICAO Airline Carrier Code Translation
 * 
 * Maps 2-character IATA airline designators to 3-character ICAO airline codes.
 * Returns null if no verified mapping exists (never guesses).
 */

const IATA_TO_ICAO = new Map([
  ['AA', 'AAL'], // American Airlines
  ['UA', 'UAL'], // United Airlines
  ['DL', 'DAL'], // Delta Air Lines
  ['WN', 'SWA'], // Southwest Airlines
  ['B6', 'JBU'], // JetBlue
  ['AS', 'ASA'], // Alaska Airlines
  ['NK', 'NKS'], // Spirit Airlines
  ['F9', 'FFT'], // Frontier Airlines
  ['HA', 'HAL'], // Hawaiian Airlines
  ['G4', 'AAY'], // Allegiant Air
  ['BA', 'BAW'], // British Airways
  ['AF', 'AFR'], // Air France
  ['LH', 'DLH'], // Lufthansa
  ['KL', 'KLM'], // KLM
  ['IB', 'IBE'], // Iberia
  ['AZ', 'ITY'], // ITA Airways
  ['LX', 'SWR'], // Swiss
  ['OS', 'AUA'], // Austrian Airlines
  ['SN', 'BEL'], // Brussels Airlines
  ['TP', 'TAP'], // TAP Air Portugal
  ['EI', 'EIN'], // Aer Lingus
  ['SK', 'SAS'], // Scandinavian Airlines
  ['AY', 'FIN'], // Finnair
  ['TK', 'THY'], // Turkish Airlines
  ['EK', 'UAE'], // Emirates
  ['QR', 'QTR'], // Qatar Airways
  ['EY', 'ETD'], // Etihad Airways
  ['SQ', 'SIA'], // Singapore Airlines
  ['CX', 'CPA'], // Cathay Pacific
  ['NH', 'ANA'], // All Nippon Airways
  ['JL', 'JAL'], // Japan Airlines
  ['KE', 'KAL'], // Korean Air
  ['OZ', 'AAR'], // Asiana Airlines
  ['QF', 'QFA'], // Qantas
  ['NZ', 'ANZ'], // Air New Zealand
  ['VA', 'VOZ'], // Virgin Australia
  ['AC', 'ACA'], // Air Canada
  ['WS', 'WJA'], // WestJet
  ['AM', 'AMX'], // Aeromexico
  ['AV', 'AVA'], // Avianca
  ['LA', 'LAN'], // LATAM
  ['ET', 'ETH'], // Ethiopian Airlines
  ['MS', 'MSR'], // EgyptAir
  ['SA', 'SAA'], // South African Airways
  ['FR', 'RYR'], // Ryanair
  ['U2', 'EZY'], // easyJet
  ['W6', 'WZZ'], // Wizz Air
  ['DY', 'NAX'], // Norwegian
  ['VY', 'VLG'], // Vueling
  ['PC', 'PGT'], // Pegasus Airlines
  ['SV', 'SVA'], // Saudia
  ['ME', 'MEA'], // Middle East Airlines
  ['RJ', 'RJA'], // Royal Jordanian
  ['AI', 'AIC'], // Air India
  ['6E', 'IGO'], // IndiGo
  ['MH', 'MAS'], // Malaysia Airlines
  ['TG', 'THA'], // Thai Airways
  ['VN', 'HVN'], // Vietnam Airlines
  ['GA', 'GIA'], // Garuda Indonesia
]);

/**
 * Resolves a flight identifier to an ICAO callsign.
 * - If input is already ICAO format (3 letters + digits/letters, e.g. UAL123), returns it directly.
 * - If input is IATA format (2 letters/alphanumeric + digits, e.g. UA123), maps carrier to ICAO.
 * - If unmapped, returns null (never guesses).
 */
function resolveIcaoCallsign(flightNumberOrCallsign) {
  if (!flightNumberOrCallsign) return null;
  const clean = String(flightNumberOrCallsign).trim().toUpperCase().replace(/\s|-/g, '');
  if (!clean) return null;

  // Check if already 3-letter ICAO callsign (e.g. UAL123, BAW456, DLH789)
  const icaoMatch = clean.match(/^([A-Z]{3})(\d+[A-Z]?)$/);
  if (icaoMatch) {
    return clean;
  }

  // Check if 2-character IATA format (e.g. UA123, AF456, BA789, U2123, 6E456)
  const iataMatch = clean.match(/^([A-Z0-9]{2})(\d+[A-Z]?)$/);
  if (iataMatch) {
    const [, iataCarrier, numberPart] = iataMatch;
    const icaoCarrier = IATA_TO_ICAO.get(iataCarrier);
    if (icaoCarrier) {
      return `${icaoCarrier}${numberPart}`;
    }
  }

  return null;
}

module.exports = {
  IATA_TO_ICAO,
  resolveIcaoCallsign,
};
