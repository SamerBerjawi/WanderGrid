import { Trip } from '../types';

export interface Sticker {
  id: string;
  name: string;
  category: 'World Wonders' | 'National Parks' | 'Historic Landmarks' | 'Extreme Peaks' | 'Metropolitan Icons';
  location: string;
  countryCode: string;
  lat: number;
  lng: number;
  description: string;
  funFact: string;
  icon: string; // Lucide icon alias string
  colorTheme: 'amber' | 'emerald' | 'sky' | 'rose' | 'purple' | 'violet' | 'indigo' | 'orange' | 'teal' | 'slate' | 'cyan' | 'yellow';
  emojis: string;
}

export interface StickerClaim {
  stickerId: string;
  claimDate: string;
  memo?: string;
  photoUrl?: string;
  isAutoMatched?: boolean;
  matchedTripId?: string;
  matchedTripName?: string;
}

export const STICKER_CATEGORIES = [
  'World Wonders',
  'National Parks',
  'Historic Landmarks',
  'Extreme Peaks',
  'Metropolitan Icons'
] as const;

export const ICONIC_STICKERS: Sticker[] = [
  // --- Category: World Wonders ---
  {
    id: 'great-wall',
    name: 'Great Wall of China',
    category: 'World Wonders',
    location: 'Beijing, China',
    countryCode: 'CN',
    lat: 40.4319,
    lng: 116.5704,
    description: 'Stretching over 13,000 miles, this ancient fortification is the longest man-made structure on Earth, built to protect historical dynastic borders.',
    funFact: 'The mortar used to bind the brickwork was made with a mixture that included sticky rice flour!',
    icon: 'Shield',
    colorTheme: 'amber',
    emojis: '🇨🇳 🧱 🥾'
  },
  {
    id: 'petra',
    name: 'Petra',
    category: 'World Wonders',
    location: 'Ma\'an, Jordan',
    countryCode: 'JO',
    lat: 30.3285,
    lng: 35.4444,
    description: 'A famous archaeological site in Jordan\'s southwestern desert, featuring tombs and temples carved directly into pink sandstone cliffs.',
    funFact: 'About 85% of Petra\'s incredible underground structure still remains unexcavated and hidden!',
    icon: 'Flame',
    colorTheme: 'orange',
    emojis: '🇯🇴 🏛️ 🐫'
  },
  {
    id: 'colosseum',
    name: 'Colosseum',
    category: 'World Wonders',
    location: 'Rome, Italy',
    countryCode: 'IT',
    lat: 41.8902,
    lng: 12.4922,
    description: 'The largest ancient amphitheater ever built, situated in the heart of Rome. An iconic monument to Roman engineering and gladiator combats.',
    funFact: 'To celebrate the grand openings, the Romans sometimes flooded the Colosseum to stage full-scale mock naval battles!',
    icon: 'Crown',
    colorTheme: 'emerald',
    emojis: '🇮🇹 🏟️ 🛡️'
  },
  {
    id: 'chichen-itza',
    name: 'Chichen Itza',
    category: 'World Wonders',
    location: 'Yucatan, Mexico',
    countryCode: 'MX',
    lat: 20.6843,
    lng: -88.5678,
    description: 'A vibrant ruined Mayan city dominated by the massive step pyramid El Castillo (Temple of Kukulcan), representing the Mesoamerican calendar.',
    funFact: 'An acoustic clap at the base of the staircase triggers an echo that mimics the exact chirp of the sacred Quetzal bird.',
    icon: 'Sun',
    colorTheme: 'yellow',
    emojis: '🇲🇽 🏛️ 🐍'
  },
  {
    id: 'machu-picchu',
    name: 'Machu Picchu',
    category: 'World Wonders',
    location: 'Cusco, Peru',
    countryCode: 'PE',
    lat: -13.1631,
    lng: -72.5450,
    description: 'A 15th-century Inca citadel nestled high in the Andes mountains, showcasing sophisticated dry-stone masonry with astronomical alignments.',
    funFact: 'Its granite stones are cut so precisely without mortar that they slide back into alignment during earthquakes!',
    icon: 'Trees',
    colorTheme: 'emerald',
    emojis: '🇵🇪 ⛰️ 🦙'
  },
  {
    id: 'taj-mahal',
    name: 'Taj Mahal',
    category: 'World Wonders',
    location: 'Agra, India',
    countryCode: 'IN',
    lat: 27.1751,
    lng: 78.0421,
    description: 'An immense, shimmering white marble mausoleum commissioned by Shah Jahan in memory of his beloved wife Mumtaz Mahal.',
    funFact: 'The monuments are completely symmetrical, saving for the uneven heights of the two internal sarcophagi.',
    icon: 'Heart',
    colorTheme: 'indigo',
    emojis: '🇮🇳 🕌 🤍'
  },
  {
    id: 'christ-redeemer',
    name: 'Christ the Redeemer',
    category: 'World Wonders',
    location: 'Rio de Janeiro, Brazil',
    countryCode: 'BR',
    lat: -22.9519,
    lng: -43.2105,
    description: 'The colossal Art Deco statue of Jesus Christ crowning Corcovado Mountain, embracing the city of Rio de Janeiro with open arms.',
    funFact: 'Due to its exposed mountaintop peak location, the statue gets struck by lightning an average of 4-6 times every single year!',
    icon: 'Sparkles',
    colorTheme: 'teal',
    emojis: '🇧🇷 🗽 🌴'
  },
  {
    id: 'pyramids-giza',
    name: 'Pyramid of Giza',
    category: 'World Wonders',
    location: 'Cairo, Egypt',
    countryCode: 'EG',
    lat: 29.9792,
    lng: 31.1342,
    description: 'The oldest and only surviving monument of the original Seven Wonders of the Ancient World, standing tall in the desert sands.',
    funFact: 'For over 3,800 years, it reigned unchallenged as the tallest man-made structure on Earth!',
    icon: 'Compass',
    colorTheme: 'orange',
    emojis: '🇪🇬 📐 🏜️'
  },

  // --- Category: National Parks ---
  {
    id: 'yosemite',
    name: 'Yosemite Valley',
    category: 'National Parks',
    location: 'California, USA',
    countryCode: 'US',
    lat: 37.8651,
    lng: -119.5383,
    description: 'A spectacular glacial valley enclosed by towering granite monoliths like El Capitan and Half Dome, populated by ancient giant sequoias.',
    funFact: 'Its giant waterfalls can produce luminous "moonbows" — rare night-time rainbows created by moonlight!',
    icon: 'TreePine',
    colorTheme: 'emerald',
    emojis: '🇺🇸 🏕️ 🥾'
  },
  {
    id: 'yellowstone',
    name: 'Yellowstone',
    category: 'National Parks',
    location: 'Wyoming, USA',
    countryCode: 'US',
    lat: 44.4280,
    lng: -110.5885,
    description: 'The world\'s oldest National Park, sitting atop active bubbling geothermal hotspots with majestic geysers, canyons, and alpine lakes.',
    funFact: 'The incredible rainbow colors of Grand Prismatic Spring are caused by billions of extremophile microbial mats thriving in boiling water.',
    icon: 'Droplet',
    colorTheme: 'rose',
    emojis: '🇺🇸 🌋 🦌'
  },
  {
    id: 'banff',
    name: 'Banff National Park',
    category: 'National Parks',
    location: 'Alberta, Canada',
    countryCode: 'CA',
    lat: 51.4968,
    lng: -115.9281,
    description: 'A mountainous wonderland in the heart of the Canadian Rockies, famous for its turquoise-colored lakes and pine-clad peaks.',
    funFact: 'Its turquoise tint comes from "rock flour" — fine silk dust ground down by glaciers and suspended in the lake depths.',
    icon: 'Waves',
    colorTheme: 'teal',
    emojis: '🇨🇦 🏔️ 🌲'
  },
  {
    id: 'serengeti',
    name: 'Serengeti Wildlife Reserve',
    category: 'National Parks',
    location: 'Mara, Tanzania',
    countryCode: 'TZ',
    lat: -2.1540,
    lng: 34.6857,
    description: 'The legendary savanna plain that plays host to the Great Wildebeest Migration, the longest and largest wildlife migration in history.',
    funFact: 'Its name comes from the Maasai word "Siringet", which literally translates to "the place where the land runs on forever."',
    icon: 'Binoculars',
    colorTheme: 'amber',
    emojis: '🇹🇿 🦁 🦓'
  },
  {
    id: 'plitvice',
    name: 'Plitvice Lakes',
    category: 'National Parks',
    location: 'Lika-Senj, Croatia',
    countryCode: 'HR',
    lat: 44.8654,
    lng: 15.5820,
    description: 'A dazzling forest reserve of 16 interconnected terraced lakes, characterized by natural travertine barriers and cascading waterfalls.',
    funFact: 'Depending on the day\'s angle of sunlight and mineral concentrations, the lakes shift between green, gray, blue, and azure!',
    icon: 'Droplet',
    colorTheme: 'sky',
    emojis: '🇭🇷 💧 🪵'
  },

  // --- Category: Historic Landmarks ---
  {
    id: 'eiffel-tower',
    name: 'Eiffel Tower',
    category: 'Historic Landmarks',
    location: 'Paris, France',
    countryCode: 'FR',
    lat: 48.8584,
    lng: 2.2945,
    description: 'The famous puddle-iron latticed tower of Paris, built originally as a temporary entrance arch for the 1889 World\'s Fair.',
    funFact: 'Due to thermal expansion of its giant iron framework, the tower grows by up to 6 inches every summer!',
    icon: 'Radio',
    colorTheme: 'indigo',
    emojis: '🇫🇷 🗼 🍷'
  },
  {
    id: 'statue-of-liberty',
    name: 'Statue of Liberty',
    category: 'Historic Landmarks',
    location: 'New York, USA',
    countryCode: 'US',
    lat: 40.6892,
    lng: -74.0445,
    description: 'A monument of copper presented by the people of France to the United States, representing liberty and international friendship.',
    funFact: 'Originally reddish-brown like a penny, it took roughly 30 years to oxidize and form its signature mint-green copper patina.',
    icon: 'Sparkles',
    colorTheme: 'cyan',
    emojis: '🇺🇸 🗽 🛥️'
  },
  {
    id: 'ankgor-wat',
    name: 'Angkor Wat',
    category: 'Historic Landmarks',
    location: 'Siem Reap, Cambodia',
    countryCode: 'KH',
    lat: 13.4125,
    lng: 103.8670,
    description: 'A colossal 12th century temple complex representing the peaks of classical Khmer architecture and spiritual cosmology.',
    funFact: 'Unlike most nearby Khmer temples, Angkor Wat faces West — the direction associated with the spiritual afterlife.',
    icon: 'Grid',
    colorTheme: 'amber',
    emojis: '🇰🇭 🛕 🐵'
  },
  {
    id: 'stonehenge',
    name: 'Stonehenge',
    category: 'Historic Landmarks',
    location: 'Wiltshire, UK',
    countryCode: 'GB-ENG',
    lat: 51.1789,
    lng: -1.8262,
    description: 'A mysterious prehistoric stone circle standing alone on the Salisbury Plain, aligned with the summer and winter solstices.',
    funFact: 'The smaller bluestones are verified to have been transported over 150 miles across hills and water from Wales!',
    icon: 'Hexagon',
    colorTheme: 'slate',
    emojis: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 🪨 ☀️'
  },
  {
    id: 'acropolis',
    name: 'Acropolis of Athens',
    category: 'Historic Landmarks',
    location: 'Athens, Greece',
    countryCode: 'GR',
    lat: 37.9715,
    lng: 23.7257,
    description: 'The towering rocky citadel overlooking Athens, crowned by the majestic ruins of the Parthenon and surrounding temples.',
    funFact: 'Every column and lintel of the Parthenon was carved with subtle outward curves to correct visual distance distortions.',
    icon: 'Atom',
    colorTheme: 'sky',
    emojis: '🇬🇷 🏛️ 🫒'
  },

  // --- Category: Extreme Peaks ---
  {
    id: 'everest',
    name: 'Mount Everest',
    category: 'Extreme Peaks',
    location: 'Solukhumbu, Nepal',
    countryCode: 'NP',
    lat: 27.9881,
    lng: 86.9250,
    description: 'The highest mountain above sea level, standing majestically on the boundary between Nepal and China.',
    funFact: 'Due to ongoing continental plate pressure, Mount Everest grows about 4 millimeters taller every single year!',
    icon: 'Mountain',
    colorTheme: 'purple',
    emojis: '🇳🇵 🏔️ 🌬️'
  },
  {
    id: 'mont-blanc',
    name: 'Mont Blanc',
    category: 'Extreme Peaks',
    location: 'Chamonix, France',
    countryCode: 'FR',
    lat: 45.8326,
    lng: 6.8652,
    description: 'The monarch peak of Western Europe, reigning over the Graian Alps on the French-Italian border.',
    funFact: 'The first successful ascent in 1786 is historically regarded as the birth of modern mountaineering.',
    icon: 'Snowflake',
    colorTheme: 'sky',
    emojis: '🇫🇷 🏔️ ⛷️'
  },
  {
    id: 'kilimanjaro',
    name: 'Mount Kilimanjaro',
    category: 'Extreme Peaks',
    location: 'Kilimanjaro, Tanzania',
    countryCode: 'TZ',
    lat: -3.0674,
    lng: 37.3556,
    description: 'The highest single free-standing mountain peak in the world, with three inactive volcanic vents rising over Tanzania.',
    funFact: 'Climbers pass through five distinct ecological climate zones during their ascent, from wet rain forest to arctic sand glaciers.',
    icon: 'CloudRain',
    colorTheme: 'amber',
    emojis: '🇹🇿 ⛰️ 🦒'
  },
  {
    id: 'matterhorn',
    name: 'The Matterhorn',
    category: 'Extreme Peaks',
    location: 'Zermatt, Switzerland',
    countryCode: 'CH',
    lat: 45.9766,
    lng: 7.6585,
    description: 'A striking jagged pyramid-shaped peak overlooking Alpine valleys on the Swiss-Italian border.',
    funFact: 'The distinct symmetric tetrahedral four-sided face shape of the mountain inspired the famous Toblerone chocolate bar!',
    icon: 'Mountain',
    colorTheme: 'rose',
    emojis: '🇨🇭 🪨 🍫'
  },

  // --- Category: Metropolitan Icons ---
  {
    id: 'burj-khalifa',
    name: 'Burj Khalifa',
    category: 'Metropolitan Icons',
    location: 'Dubai, UAE',
    countryCode: 'AE',
    lat: 25.1972,
    lng: 55.2744,
    description: 'An architectural marvel soaring to a peak of 828 meters, currently standing as the tallest structure in human history.',
    funFact: 'The air at the topmost viewpoint is noticeably cooler by about 15 degrees Fahrenheit compared to the sweltering desert base!',
    icon: 'TowerControl',
    colorTheme: 'indigo',
    emojis: '🇦🇪 🏙️ 🚀'
  },
  {
    id: 'sydney-opera',
    name: 'Sydney Opera House',
    category: 'Metropolitan Icons',
    location: 'Sydney, Australia',
    countryCode: 'AU',
    lat: -33.8568,
    lng: 151.2153,
    description: 'The iconic performing arts multi-venue overlooking Sydney Harbour, famed for its sweeping white sail-like roof vaults.',
    funFact: 'If you were to combine all the concrete sails of the roof together, they would create a perfect, flawless sphere.',
    icon: 'Compass',
    colorTheme: 'cyan',
    emojis: '🇦🇺 🎭 ⛵'
  },
  {
    id: 'golden-gate',
    name: 'Golden Gate Bridge',
    category: 'Metropolitan Icons',
    location: 'California, USA',
    countryCode: 'US',
    lat: 37.8199,
    lng: -122.4783,
    description: 'The legendary reddish-orange suspension bridge spanning the mile-wide strait between San Francisco Bay and the Pacific Ocean.',
    funFact: 'The brilliant "International Orange" color was originally selected as a high-visibility sealant, but proved so beloved they kept it!',
    icon: 'Torus',
    colorTheme: 'rose',
    emojis: '🇺🇸 🌉 🌁'
  },
  {
    id: 'marina-bay',
    name: 'Marina Bay Sands',
    category: 'Metropolitan Icons',
    location: 'Downtown, Singapore',
    countryCode: 'SG',
    lat: 1.2828,
    lng: 103.8585,
    description: 'An integrated resort fronting Marina Bay, featuring three soaring hotel towers connected by the sky-high Sands SkyPark.',
    funFact: 'Its SkyPark is long enough to span four and a half parked Airbus A380 giant passenger jets end-to-end!',
    icon: 'Hotel',
    colorTheme: 'purple',
    emojis: '🇸🇬 🏙️ 🏊'
  }
];

/**
 * Calculates distance between two coordinates in kilometers using Haversine formula
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Scans a user's trip structure to see if they automatically match any iconic stickers.
 * Unlocks a sticker if they did an activity, transport, or accommodation within 50km (or matched exact name).
 */
export function detectAutoMatchStickers(trips: Trip[]): StickerClaim[] {
  const pastTrips = trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
  const claims: StickerClaim[] = [];

  for (const sticker of ICONIC_STICKERS) {
    let matchedTrip: Trip | null = null;
    let matchType = '';

    for (const trip of pastTrips) {
      // 1. Check primary trip location name
      const cleanStickerName = sticker.name.toLowerCase();
      const cleanTripLoc = (trip.location || '').toLowerCase();
      
      if (cleanTripLoc.includes(cleanStickerName) || cleanStickerName.includes(cleanTripLoc) && cleanTripLoc.length > 3) {
        matchedTrip = trip;
        matchType = 'Trip Location';
        break;
      }

      // 2. Check primary coordinates
      if (trip.coordinates) {
        const dist = calculateDistanceKm(trip.coordinates.lat, trip.coordinates.lng, sticker.lat, sticker.lng);
        if (dist <= 65) { // within 65 km of landmark
          matchedTrip = trip;
          matchType = 'Coordinates Proximity';
          break;
        }
      }

      // 3. Check accommodations
      if (trip.accommodations) {
        const matchedAcc = trip.accommodations.find(acc => {
          if (acc.name.toLowerCase().includes(cleanStickerName) || acc.address.toLowerCase().includes(cleanStickerName)) {
            return true;
          }
          if (acc.coordinates) {
             const dist = calculateDistanceKm(acc.coordinates.lat, acc.coordinates.lng, sticker.lat, sticker.lng);
             return dist <= 65;
          }
          return false;
        });
        if (matchedAcc) {
          matchedTrip = trip;
          matchType = `Accommodation: ${matchedAcc.name}`;
          break;
        }
      }

      // 4. Check activities
      if (trip.activities) {
        const matchedAct = trip.activities.find(act => {
          if (act.title.toLowerCase().includes(cleanStickerName) || (act.location || '').toLowerCase().includes(cleanStickerName)) {
            return true;
          }
          if (act.coordinates) {
            const dist = calculateDistanceKm(act.coordinates.lat, act.coordinates.lng, sticker.lat, sticker.lng);
            return dist <= 65;
          }
          return false;
        });
        if (matchedAct) {
          matchedTrip = trip;
          matchType = `Activity: ${matchedAct.title}`;
          break;
        }
      }

      // 5. Check route plan locations
      if (trip.locations) {
        const matchedLoc = trip.locations.find(loc => {
          if (loc.name.toLowerCase().includes(cleanStickerName)) {
            return true;
          }
          if (loc.coordinates) {
            const dist = calculateDistanceKm(loc.coordinates.lat, loc.coordinates.lng, sticker.lat, sticker.lng);
            return dist <= 65;
          }
          return false;
        });
        if (matchedLoc) {
          matchedTrip = trip;
          matchType = `Visual Route Entry: ${matchedLoc.name}`;
          break;
        }
      }
    }

    if (matchedTrip) {
      claims.push({
        stickerId: sticker.id,
        claimDate: matchedTrip.endDate,
        isAutoMatched: true,
        matchedTripId: matchedTrip.id,
        matchedTripName: matchedTrip.name,
        memo: `Earned automatically via "${matchType}" during your trip to ${matchedTrip.location}!`
      });
    }
  }

  return claims;
}

/**
 * Loads the sticker journal claims from localStorage and merges with auto-computed ones.
 */
export function loadStickersProgress(trips: Trip[]): { claimsMap: Map<string, StickerClaim>; autoClaims: StickerClaim[] } {
  // 1. Detect auto-matches
  const autoClaims = detectAutoMatchStickers(trips);
  const claimsMap = new Map<string, StickerClaim>();
  
  autoClaims.forEach(claim => {
    claimsMap.set(claim.stickerId, claim);
  });

  // 2. Overlap manual claims
  try {
    const listStr = localStorage.getItem('wandergrid_manual_stickers_v2');
    if (listStr) {
      const list: StickerClaim[] = JSON.parse(listStr);
      list.forEach(claim => {
        // Preference for manual claims if they are more specific (or override)
        claimsMap.set(claim.stickerId, claim);
      });
    }
  } catch (e) {
    console.warn("Failed to load manual sticker claims:", e);
  }

  return { claimsMap, autoClaims };
}

/**
 * Save manual sticker claim
 */
export function saveManualStickerClaim(claim: StickerClaim): void {
  try {
    const listStr = localStorage.getItem('wandergrid_manual_stickers_v2') || '[]';
    const list: StickerClaim[] = JSON.parse(listStr);
    
    const existingIdx = list.findIndex(c => c.stickerId === claim.stickerId);
    if (existingIdx >= 0) {
      list[existingIdx] = claim;
    } else {
      list.push(claim);
    }
    
    localStorage.setItem('wandergrid_manual_stickers_v2', JSON.stringify(list));
    // Dispatch DB updated event to trigger rerender across hooks
    window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
  } catch (e) {
    console.error("Failed to save manual sticker claim:", e);
  }
}

/**
 * Remove manual sticker claim
 */
export function deleteManualStickerClaim(stickerId: string): void {
  try {
    const listStr = localStorage.getItem('wandergrid_manual_stickers_v2') || '[]';
    const list: StickerClaim[] = JSON.parse(listStr);
    const filtered = list.filter(c => c.stickerId !== stickerId);
    localStorage.setItem('wandergrid_manual_stickers_v2', JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
  } catch (e) {
    console.error("Failed to delete manual sticker claim:", e);
  }
}
