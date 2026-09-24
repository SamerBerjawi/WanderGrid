export interface TopAirport {
  iata: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  lat: number;
  lng: number;
}

export interface TopAirline {
  iata: string;
  name: string;
  country: string;
  domain: string;
}

// -------------------------------------------------------------
// TOP 100 MOST USED AIRPORTS IN THE WORLD
// Curated for instantaneous first-step retrieval (0ms latency)
// -------------------------------------------------------------
export const TOP_100_AIRPORTS: TopAirport[] = [
  { iata: "ATL", name: "Hartsfield-Jackson Atlanta Intl", city: "Atlanta", country: "United States", timezone: "America/New_York", lat: 33.6407, lng: -84.4277 },
  { iata: "DXB", name: "Dubai Intl", city: "Dubai", country: "United Arab Emirates", timezone: "Asia/Dubai", lat: 25.2532, lng: 55.3657 },
  { iata: "DFW", name: "Dallas/Fort Worth Intl", city: "Dallas-Fort Worth", country: "United States", timezone: "America/Chicago", lat: 32.8998, lng: -97.0403 },
  { iata: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom", timezone: "Europe/London", lat: 51.4700, lng: -0.4543 },
  { iata: "HND", name: "Tokyo Haneda", city: "Tokyo", country: "Japan", timezone: "Asia/Tokyo", lat: 35.5494, lng: 139.7798 },
  { iata: "DEN", name: "Denver Intl", city: "Denver", country: "United States", timezone: "America/Denver", lat: 39.8561, lng: -104.6737 },
  { iata: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey", timezone: "Europe/Istanbul", lat: 41.2753, lng: 28.7519 },
  { iata: "ORD", name: "O'Hare Intl", city: "Chicago", country: "United States", timezone: "America/Chicago", lat: 41.9742, lng: -87.9073 },
  { iata: "LAX", name: "Los Angeles Intl", city: "Los Angeles", country: "United States", timezone: "America/Los_Angeles", lat: 33.9416, lng: -118.4085 },
  { iata: "DEL", name: "Indira Gandhi Intl", city: "Delhi", country: "India", timezone: "Asia/Kolkata", lat: 28.5562, lng: 77.1000 },
  { iata: "CDG", name: "Charles de Gaulle", city: "Paris", country: "France", timezone: "Europe/Paris", lat: 49.0097, lng: 2.5479 },
  { iata: "CAN", name: "Guangzhou Baiyun Intl", city: "Guangzhou", country: "China", timezone: "Asia/Shanghai", lat: 23.3924, lng: 113.2988 },
  { iata: "JFK", name: "John F. Kennedy Intl", city: "New York", country: "United States", timezone: "America/New_York", lat: 40.6413, lng: -73.7781 },
  { iata: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam", country: "Netherlands", timezone: "Europe/Amsterdam", lat: 52.3105, lng: 4.7683 },
  { iata: "MAD", name: "Adolfo Suárez Madrid-Barajas", city: "Madrid", country: "Spain", timezone: "Europe/Madrid", lat: 40.4839, lng: -3.5680 },
  { iata: "FRA", name: "Frankfurt am Main", city: "Frankfurt", country: "Germany", timezone: "Europe/Berlin", lat: 50.0379, lng: 8.5622 },
  { iata: "SIN", name: "Singapore Changi", city: "Singapore", country: "Singapore", timezone: "Asia/Singapore", lat: 1.3644, lng: 103.9915 },
  { iata: "ICN", name: "Seoul Incheon Intl", city: "Seoul", country: "South Korea", timezone: "Asia/Seoul", lat: 37.4602, lng: 126.4407 },
  { iata: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", country: "Thailand", timezone: "Asia/Bangkok", lat: 13.6900, lng: 100.7501 },
  { iata: "SFO", name: "San Francisco Intl", city: "San Francisco", country: "United States", timezone: "America/Los_Angeles", lat: 37.6213, lng: -122.3790 },
  { iata: "BCN", name: "Josep Tarradellas Barcelona-El Prat", city: "Barcelona", country: "Spain", timezone: "Europe/Madrid", lat: 41.2974, lng: 2.0833 },
  { iata: "SEA", name: "Seattle-Tacoma Intl", city: "Seattle", country: "United States", timezone: "America/Los_Angeles", lat: 47.4502, lng: -122.3088 },
  { iata: "LAS", name: "Harry Reid Intl", city: "Las Vegas", country: "United States", timezone: "America/Los_Angeles", lat: 36.0840, lng: -115.1537 },
  { iata: "MCO", name: "Orlando Intl", city: "Orlando", country: "United States", timezone: "America/New_York", lat: 28.4312, lng: -81.3081 },
  { iata: "YYZ", name: "Toronto Pearson Intl", city: "Toronto", country: "Canada", timezone: "America/Toronto", lat: 43.6777, lng: -79.6248 },
  { iata: "MEX", name: "Mexico City Intl (Benito Juárez)", city: "Mexico City", country: "Mexico", timezone: "America/Mexico_City", lat: 19.4361, lng: -99.0719 },
  { iata: "CLT", name: "Charlotte Douglas Intl", city: "Charlotte", country: "United States", timezone: "America/New_York", lat: 35.2144, lng: -80.9473 },
  { iata: "PHX", name: "Phoenix Sky Harbor Intl", city: "Phoenix", country: "United States", timezone: "America/Phoenix", lat: 33.4342, lng: -112.0080 },
  { iata: "MIA", name: "Miami Intl", city: "Miami", country: "United States", timezone: "America/New_York", lat: 25.7959, lng: -80.2870 },
  { iata: "MUC", name: "Munich Airport", city: "Munich", country: "Germany", timezone: "Europe/Berlin", lat: 48.3537, lng: 11.7750 },
  { iata: "SYD", name: "Sydney Airport (Kingsford Smith)", city: "Sydney", country: "Australia", timezone: "Australia/Sydney", lat: -33.9399, lng: 151.1753 },
  { iata: "EWR", name: "Newark Liberty Intl", city: "New York/Newark", country: "United States", timezone: "America/New_York", lat: 40.6895, lng: -74.1745 },
  { iata: "MNL", name: "Ninoy Aquino Intl", city: "Manila", country: "Philippines", timezone: "Asia/Manila", lat: 14.5086, lng: 121.0194 },
  { iata: "LGW", name: "London Gatwick", city: "London", country: "United Kingdom", timezone: "Europe/London", lat: 51.1537, lng: -0.1821 },
  { iata: "PVG", name: "Shanghai Pudong Intl", city: "Shanghai", country: "China", timezone: "Asia/Shanghai", lat: 31.1443, lng: 121.8083 },
  { iata: "SHA", name: "Shanghai Hongqiao Intl", city: "Shanghai", country: "China", timezone: "Asia/Shanghai", lat: 31.1979, lng: 121.3363 },
  { iata: "PEK", name: "Beijing Capital Intl", city: "Beijing", country: "China", timezone: "Asia/Shanghai", lat: 40.0799, lng: 116.6031 },
  { iata: "PKX", name: "Beijing Daxing Intl", city: "Beijing", country: "China", timezone: "Asia/Shanghai", lat: 39.5098, lng: 116.4105 },
  { iata: "FCO", name: "Leonardo da Vinci-Fiumicino", city: "Rome", country: "Italy", timezone: "Europe/Rome", lat: 41.8003, lng: 12.2389 },
  { iata: "DOH", name: "Hamad Intl", city: "Doha", country: "Qatar", timezone: "Asia/Qatar", lat: 25.2731, lng: 51.6081 },
  { iata: "HKG", name: "Hong Kong Intl", city: "Hong Kong", country: "Hong Kong", timezone: "Asia/Hong_Kong", lat: 22.3080, lng: 113.9185 },
  { iata: "KIX", name: "Kansai Intl", city: "Osaka", country: "Japan", timezone: "Asia/Tokyo", lat: 34.4320, lng: 135.2304 },
  { iata: "NRT", name: "Narita Intl", city: "Tokyo", country: "Japan", timezone: "Asia/Tokyo", lat: 35.7720, lng: 140.3929 },
  { iata: "MEL", name: "Melbourne Airport (Tullamarine)", city: "Melbourne", country: "Australia", timezone: "Australia/Melbourne", lat: -37.6690, lng: 144.8410 },
  { iata: "ZRH", name: "Zurich Airport", city: "Zurich", country: "Switzerland", timezone: "Europe/Zurich", lat: 47.4582, lng: 8.5555 },
  { iata: "BOS", name: "Boston Logan Intl", city: "Boston", country: "United States", timezone: "America/New_York", lat: 42.3656, lng: -71.0096 },
  { iata: "MSP", name: "Minneapolis-Saint Paul Intl", city: "Minneapolis", country: "United States", timezone: "America/Chicago", lat: 44.8848, lng: -93.2223 },
  { iata: "DTW", name: "Detroit Metropolitan Wayne County", city: "Detroit", country: "United States", timezone: "America/Detroit", lat: 42.2162, lng: -83.3554 },
  { iata: "FLL", name: "Fort Lauderdale-Hollywood Intl", city: "Fort Lauderdale", country: "United States", timezone: "America/New_York", lat: 26.0742, lng: -80.1506 },
  { iata: "VIE", name: "Vienna Intl", city: "Vienna", country: "Austria", timezone: "Europe/Vienna", lat: 48.1103, lng: 16.5697 },
  { iata: "CPH", name: "Copenhagen Airport", city: "Copenhagen", country: "Denmark", timezone: "Europe/Copenhagen", lat: 55.6180, lng: 12.6508 },
  { iata: "DUB", name: "Dublin Airport", city: "Dublin", country: "Ireland", timezone: "Europe/Dublin", lat: 53.4264, lng: -6.2499 },
  { iata: "BRU", name: "Brussels Airport", city: "Brussels", country: "Belgium", timezone: "Europe/Brussels", lat: 50.9010, lng: 4.4856 },
  { iata: "MXP", name: "Milan Malpensa", city: "Milan", country: "Italy", timezone: "Europe/Rome", lat: 45.6301, lng: 8.7255 },
  { iata: "LIN", name: "Milan Linate", city: "Milan", country: "Italy", timezone: "Europe/Rome", lat: 45.4451, lng: 9.2767 },
  { iata: "BGY", name: "Milan Bergamo (Orio al Serio)", city: "Bergamo", country: "Italy", timezone: "Europe/Rome", lat: 45.6739, lng: 9.7042 },
  { iata: "LIS", name: "Lisbon Humberto Delgado", city: "Lisbon", country: "Portugal", timezone: "Europe/Lisbon", lat: 38.7742, lng: -9.1342 },
  { iata: "OPO", name: "Francisco Sá Carneiro", city: "Porto", country: "Portugal", timezone: "Europe/Lisbon", lat: 41.2421, lng: -8.6786 },
  { iata: "ATH", name: "Athens Eleftherios Venizelos", city: "Athens", country: "Greece", timezone: "Europe/Athens", lat: 37.9364, lng: 23.9445 },
  { iata: "OSL", name: "Oslo Airport Gardermoen", city: "Oslo", country: "Norway", timezone: "Europe/Oslo", lat: 60.1976, lng: 11.1004 },
  { iata: "ARN", name: "Stockholm Arlanda", city: "Stockholm", country: "Sweden", timezone: "Europe/Stockholm", lat: 59.6498, lng: 17.9238 },
  { iata: "HEL", name: "Helsinki-Vantaa", city: "Helsinki", country: "Finland", timezone: "Europe/Helsinki", lat: 60.3172, lng: 24.9633 },
  { iata: "WAW", name: "Warsaw Chopin", city: "Warsaw", country: "Poland", timezone: "Europe/Warsaw", lat: 52.1672, lng: 20.9679 },
  { iata: "PRG", name: "Václav Havel Airport Prague", city: "Prague", country: "Czechia", timezone: "Europe/Prague", lat: 50.1008, lng: 14.2600 },
  { iata: "BUD", name: "Budapest Ferenc Liszt Intl", city: "Budapest", country: "Hungary", timezone: "Europe/Budapest", lat: 47.4369, lng: 19.2556 },
  { iata: "BER", name: "Berlin Brandenburg Airport", city: "Berlin", country: "Germany", timezone: "Europe/Berlin", lat: 52.3667, lng: 13.5033 },
  { iata: "EDI", name: "Edinburgh Airport", city: "Edinburgh", country: "United Kingdom", timezone: "Europe/London", lat: 55.9508, lng: -3.3725 },
  { iata: "MAN", name: "Manchester Airport", city: "Manchester", country: "United Kingdom", timezone: "Europe/London", lat: 53.3588, lng: -2.2727 },
  { iata: "BHX", name: "Birmingham Airport", city: "Birmingham", country: "United Kingdom", timezone: "Europe/London", lat: 52.4539, lng: -1.7480 },
  { iata: "STN", name: "London Stansted", city: "London", country: "United Kingdom", timezone: "Europe/London", lat: 51.8860, lng: 0.2389 },
  { iata: "LTN", name: "London Luton", city: "London", country: "United Kingdom", timezone: "Europe/London", lat: 51.8747, lng: -0.3683 },
  { iata: "NCE", name: "Nice Côte d'Azur", city: "Nice", country: "France", timezone: "Europe/Paris", lat: 43.6584, lng: 7.2159 },
  { iata: "ORY", name: "Paris Orly", city: "Paris", country: "France", timezone: "Europe/Paris", lat: 48.7262, lng: 2.3652 },
  { iata: "GVA", name: "Geneva Airport", city: "Geneva", country: "Switzerland", timezone: "Europe/Zurich", lat: 46.2370, lng: 6.1092 },
  { iata: "BEY", name: "Beirut-Rafic Hariri Intl", city: "Beirut", country: "Lebanon", timezone: "Asia/Beirut", lat: 33.8209, lng: 35.4884 },
  { iata: "AMM", name: "Queen Alia Intl", city: "Amman", country: "Jordan", timezone: "Asia/Amman", lat: 31.7226, lng: 35.9932 },
  { iata: "CAI", name: "Cairo Intl", city: "Cairo", country: "Egypt", timezone: "Africa/Cairo", lat: 30.1219, lng: 31.4056 },
  { iata: "JNB", name: "O.R. Tambo Intl", city: "Johannesburg", country: "South Africa", timezone: "Africa/Johannesburg", lat: -26.1367, lng: 28.2411 },
  { iata: "CPT", name: "Cape Town Intl", city: "Cape Town", country: "South Africa", timezone: "Africa/Johannesburg", lat: -33.9715, lng: 18.6021 },
  { iata: "AUH", name: "Zayed Intl (Abu Dhabi)", city: "Abu Dhabi", country: "United Arab Emirates", timezone: "Asia/Dubai", lat: 24.4330, lng: 54.6511 },
  { iata: "RUH", name: "King Khalid Intl", city: "Riyadh", country: "Saudi Arabia", timezone: "Asia/Riyadh", lat: 24.9576, lng: 46.6988 },
  { iata: "JED", name: "King Abdulaziz Intl", city: "Jeddah", country: "Saudi Arabia", timezone: "Asia/Riyadh", lat: 21.6796, lng: 39.1565 },
  { iata: "BOM", name: "Chhatrapati Shivaji Maharaj Intl", city: "Mumbai", country: "India", timezone: "Asia/Kolkata", lat: 19.0896, lng: 72.8656 },
  { iata: "BLR", name: "Kempegowda Intl", city: "Bengaluru", country: "India", timezone: "Asia/Kolkata", lat: 13.1986, lng: 77.7066 },
  { iata: "TPE", name: "Taiwan Taoyuan Intl", city: "Taipei", country: "Taiwan", timezone: "Asia/Taipei", lat: 25.0797, lng: 121.2342 },
  { iata: "KUL", name: "Kuala Lumpur Intl", city: "Kuala Lumpur", country: "Malaysia", timezone: "Asia/Kuala_Lumpur", lat: 2.7456, lng: 101.7072 },
  { iata: "CGK", name: "Soekarno-Hatta Intl", city: "Jakarta", country: "Indonesia", timezone: "Asia/Jakarta", lat: -6.1275, lng: 106.6537 },
  { iata: "DPS", name: "Ngurah Rai Intl (Bali)", city: "Denpasar/Bali", country: "Indonesia", timezone: "Asia/Makassar", lat: -8.7482, lng: 115.1672 },
  { iata: "AKL", name: "Auckland Airport", city: "Auckland", country: "New Zealand", timezone: "Pacific/Auckland", lat: -37.0082, lng: 174.7850 },
  { iata: "YVR", name: "Vancouver Intl", city: "Vancouver", country: "Canada", timezone: "America/Vancouver", lat: 49.1967, lng: -123.1815 },
  { iata: "YUL", name: "Montréal-Trudeau Intl", city: "Montreal", country: "Canada", timezone: "America/Toronto", lat: 45.4657, lng: -73.7455 },
  { iata: "GRU", name: "São Paulo/Guarulhos Intl", city: "São Paulo", country: "Brazil", timezone: "America/Sao_Paulo", lat: -23.4356, lng: -46.4731 },
  { iata: "GIG", name: "Rio de Janeiro/Galeão Intl", city: "Rio de Janeiro", country: "Brazil", timezone: "America/Sao_Paulo", lat: -22.8089, lng: -43.2436 },
  { iata: "EZE", name: "Ministro Pistarini (Ezeiza)", city: "Buenos Aires", country: "Argentina", timezone: "America/Argentina/Buenos_Aires", lat: -34.8222, lng: -58.5358 },
  { iata: "SCL", name: "Arturo Merino Benítez Intl", city: "Santiago", country: "Chile", timezone: "America/Santiago", lat: -33.3930, lng: -70.7858 },
  { iata: "BOG", name: "El Dorado Intl", city: "Bogotá", country: "Colombia", timezone: "America/Bogota", lat: 4.7016, lng: -74.1469 },
  { iata: "LIM", name: "Jorge Chávez Intl", city: "Lima", country: "Peru", timezone: "America/Lima", lat: -12.0219, lng: -77.1143 },
  { iata: "SAN", name: "San Diego Intl", city: "San Diego", country: "United States", timezone: "America/Los_Angeles", lat: 32.7338, lng: -117.1933 },
  { iata: "TPA", name: "Tampa Intl", city: "Tampa", country: "United States", timezone: "America/New_York", lat: 27.9755, lng: -82.5332 },
  { iata: "IAD", name: "Washington Dulles Intl", city: "Washington D.C.", country: "United States", timezone: "America/New_York", lat: 38.9531, lng: -77.4565 }
];

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
export const TOP_AIRPORTS_BY_IATA = new Map<string, TopAirport>(
  TOP_100_AIRPORTS.map(a => [a.iata.toUpperCase(), a])
);

export const TOP_AIRLINES_BY_IATA = new Map<string, TopAirline>(
  TOP_50_AIRLINES.map(c => [c.iata.toUpperCase(), c])
);

export const AIRPORT_CODES: Record<string, string> = Object.fromEntries(
  TOP_100_AIRPORTS.map(a => [a.iata, a.city])
);

export const AIRLINE_CODES: Record<string, string> = Object.fromEntries(
  TOP_50_AIRLINES.map(c => [c.iata, c.name])
);

export const DEFAULT_AIRPORT_TIMEZONES: Record<string, string> = Object.fromEntries(
  TOP_100_AIRPORTS.map(a => [a.iata, a.timezone])
);

export const TOP_AIRLINE_DOMAINS: Record<string, string> = Object.fromEntries([
  ...TOP_50_AIRLINES.map(c => [c.iata.toLowerCase(), c.domain]),
  ...TOP_50_AIRLINES.map(c => [c.name.toLowerCase().replace(/[^a-z0-9]/g, ''), c.domain]),
  ...TOP_50_AIRLINES.map(c => [c.name.toLowerCase(), c.domain])
]);

// -------------------------------------------------------------
// FIRST-STEP LOCAL RETRIEVAL HELPERS (0ms latency)
// -------------------------------------------------------------
export function searchTopAirports(query: string, limit: number = 15): TopAirport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exactMatches: TopAirport[] = [];
  const prefixMatches: TopAirport[] = [];
  const cityMatches: TopAirport[] = [];
  const nameMatches: TopAirport[] = [];

  for (const a of TOP_100_AIRPORTS) {
    const iataLower = a.iata.toLowerCase();
    const cityLower = a.city.toLowerCase();
    const nameLower = a.name.toLowerCase();
    const countryLower = a.country.toLowerCase();

    if (iataLower === q) {
      exactMatches.push(a);
    } else if (iataLower.startsWith(q)) {
      prefixMatches.push(a);
    } else if (cityLower.startsWith(q) || cityLower.includes(q)) {
      cityMatches.push(a);
    } else if (nameLower.includes(q) || countryLower.includes(q)) {
      nameMatches.push(a);
    }
  }

  return [...exactMatches, ...prefixMatches, ...cityMatches, ...nameMatches].slice(0, limit);
}

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
