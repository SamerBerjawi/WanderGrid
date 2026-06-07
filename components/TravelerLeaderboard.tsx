import React, { useState, useMemo } from 'react';
import { Award, Globe, Compass, Star, ArrowUp, User, Plane, Eye } from 'lucide-react';
import { VisitedCountry } from './PassportStamp';
import { Sticker, StickerClaim, ICONIC_STICKERS } from '../utils/stickersData';

interface TravelerLeaderboardProps {
  userEmail: string;
  visitedCountries: VisitedCountry[];
  stickerClaims: Map<string, StickerClaim>;
  totalDistanceKm: number;
}

interface Competitor {
  id: string;
  name: string;
  bio: string;
  avatarEmoji: string;
  countriesCount: number;
  stickersCount: number;
  distanceKm: number;
  favoriteRegion: string;
  rareStickersList: string[];
  isUser?: boolean;
}

export const TravelerLeaderboard: React.FC<TravelerLeaderboardProps> = ({
  userEmail,
  visitedCountries,
  stickerClaims,
  totalDistanceKm,
}) => {
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);

  // Sticker rarity tier helper based on landmark categories
  const getStickerWeightAndRarity = (sticker: Sticker) => {
    switch (sticker.category) {
      case 'World Wonders':
        return { points: 4000, rarity: 'Legendary' };
      case 'Extreme Peaks':
        return { points: 2500, rarity: 'Rare' };
      case 'National Parks':
      case 'Historic Landmarks':
        return { points: 1000, rarity: 'Uncommon' };
      case 'Metropolitan Icons':
      default:
        return { points: 500, rarity: 'Common' };
    }
  };

  // 1. Calculate the user's statistics and total ranking score
  const userStats = useMemo(() => {
    const stampsScore = visitedCountries.length * 1000;
    const distanceScore = Math.round(totalDistanceKm / 100);

    let stickerPoints = 0;
    const rareStickersList: string[] = [];

    stickerClaims.forEach((_, id) => {
      const sticker = ICONIC_STICKERS.find((s) => s.id === id);
      if (sticker) {
        const { points, rarity } = getStickerWeightAndRarity(sticker);
        stickerPoints += points;
        if (rarity === 'Legendary' || rarity === 'Rare') {
          rareStickersList.push(`${sticker.emojis.split(' ')[0]} ${sticker.name}`);
        }
      }
    });

    const totalScore = stampsScore + distanceScore + stickerPoints;

    return {
      score: totalScore,
      rareStickersList,
    };
  }, [visitedCountries, stickerClaims, totalDistanceKm]);

  // 2. Mock competitors to stand alongside the user
  const competitors: Competitor[] = useMemo(() => {
    const list: Competitor[] = [
      {
        id: 'competitor_1',
        name: 'Clara Dubois',
        bio: 'French historian focused on ancient ruins and European architectural marvels.',
        avatarEmoji: '📖',
        countriesCount: 16,
        stickersCount: 9,
        distanceKm: 34200,
        favoriteRegion: 'Europe',
        rareStickersList: ['🏛️ Colosseum', '🗼 Eiffel Tower', '🕋 Acropolis of Athens'],
      },
      {
        id: 'competitor_2',
        name: 'Akiro Sato',
        bio: 'Professional alpine mountaineer seeking summit seals page after page.',
        avatarEmoji: '🧗',
        countriesCount: 6,
        stickersCount: 4,
        distanceKm: 28500,
        favoriteRegion: 'Asia',
        rareStickersList: ['🏔️ Mount Everest', '🍫 The Matterhorn'],
      },
      {
        id: 'competitor_3',
        name: 'Maya Lin',
        bio: 'Eco-tourist and nature journal author dedicated to national forest habitats.',
        avatarEmoji: '🏕️',
        countriesCount: 11,
        stickersCount: 6,
        distanceKm: 18400,
        favoriteRegion: 'North America',
        rareStickersList: ['🏞️ Banff National Park', '🌋 Yellowstone'],
      },
      {
        id: 'competitor_4',
        name: 'Zane Thompson',
        bio: 'Metropolitan sky-scraper photoblogger documenting urban skylines worldwide.',
        avatarEmoji: '📸',
        countriesCount: 8,
        stickersCount: 5,
        distanceKm: 42100,
        favoriteRegion: 'Asia',
        rareStickersList: ['🚀 Burj Khalifa', '🏊 Marina Bay Sands'],
      },
    ];

    // Create the User Competitor object
    const username = userEmail ? userEmail.split('@')[0] : 'Solo Voyager';
    const userCompetitor: Competitor = {
      id: 'current_user',
      name: `${username} (You)`,
      bio: 'Enthusiastic explorer tracing footsteps on modern world coordinates.',
      avatarEmoji: '🧭',
      countriesCount: visitedCountries.length,
      stickersCount: stickerClaims.size,
      distanceKm: Math.round(totalDistanceKm),
      favoriteRegion: visitedCountries[0]?.region || 'Unknown',
      rareStickersList: userStats.rareStickersList,
      isUser: true,
    };

    list.push(userCompetitor);

    // Score calculator helper
    const calculateScore = (c: Competitor, activeUserScore?: number) => {
      if (c.isUser && activeUserScore !== undefined) return activeUserScore;
      
      const stampsScore = c.countriesCount * 1000;
      const distanceScore = Math.round(c.distanceKm / 100);
      
      // Stickers score
      let stickerPoints = 0;
      
      // Emulate stickers point for competitors
      stickerPoints += c.stickersCount * 1200; // Average weight

      return stampsScore + distanceScore + stickerPoints;
    };

    // Sort competitors by score descending
    return list
      .map((c) => ({
        ...c,
        calculatedScore: calculateScore(c, userStats.score),
      }))
      .sort((a, b) => b.calculatedScore - a.calculatedScore);
  }, [userEmail, visitedCountries, stickerClaims, totalDistanceKm, userStats]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Rankings List Column */}
      <div className="lg:col-span-2 bg-white/70 dark:bg-zinc-900/40 backdrop-blur-md rounded-[2.5rem] border border-zinc-200/50 dark:border-white/5 p-8 shadow-sm">
        <div>
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
            Rankings Registry
          </span>
          <h3 className="text-2xl font-black text-gray-900 dark:text-white capitalize mb-6">
            Traveler Leaderboard 🏆
          </h3>
        </div>

        <div className="space-y-3.5">
          {competitors.map((comp, idx) => {
            const isTop3 = idx < 3;
            const medals = ['🥇', '🥈', '🥉'];
            const rankStyle =
              idx === 0
                ? 'from-amber-500/10 to-transparent border-l-amber-500 text-amber-500 bg-amber-500/5'
                : idx === 1
                ? 'from-slate-400/10 to-transparent border-l-slate-400 text-slate-400'
                : idx === 2
                ? 'from-amber-700/10 to-transparent border-l-amber-700 text-amber-700'
                : 'border-l-transparent text-zinc-400';

            return (
              <div
                key={comp.id}
                onClick={() => setSelectedCompetitor(comp)}
                className={`p-4 rounded-2xl border border-zinc-200/40 dark:border-white/5 flex items-center justify-between transition-all hover:scale-[1.01] hover:bg-zinc-100/55 dark:hover:bg-zinc-900/40 cursor-pointer border-l-4 ${rankStyle} ${
                  comp.isUser ? 'ring-2 ring-indigo-500/35 bg-indigo-500/[0.03]' : ''
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-8 text-center font-mono font-black text-sm shrink-0">
                    {isTop3 ? medals[idx] : `#${idx + 1}`}
                  </div>

                  <div className="w-10 h-10 rounded-xl bg-zinc-150 dark:bg-zinc-850 flex items-center justify-center text-xl shadow-inner shrink-0 font-black">
                    {comp.avatarEmoji}
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-gray-950 dark:text-white flex items-center gap-1.5 leading-none">
                      {comp.name}
                      {comp.isUser && (
                        <span className="text-[9px] bg-indigo-500 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">
                          You
                        </span>
                      )}
                    </h4>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 font-semibold truncate max-w-[200px] md:max-w-xs leading-none">
                      {comp.bio}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="hidden sm:flex gap-6 text-[11px] font-semibold text-zinc-500">
                    <div className="text-center">
                      <span className="block text-[8px] uppercase tracking-wide opacity-65">Stamps</span>
                      <span className="font-bold text-gray-850 dark:text-white">{comp.countriesCount}</span>
                    </div>
                    <div className="text-center">
                      <span className="block text-[8px] uppercase tracking-wide opacity-65">Stickers</span>
                      <span className="font-bold text-gray-850 dark:text-white">{comp.stickersCount}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="block text-[8px] uppercase tracking-wide font-black text-zinc-400">Score</span>
                    <span className="text-sm font-black text-indigo-500 dark:text-indigo-400">
                      {(comp as any).calculatedScore.toLocaleString()}
                    </span>
                  </div>

                  <button className="text-zinc-400 hover:text-indigo-500 transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Explorer Detail Spotlight Column */}
      <div className="bg-white/70 dark:bg-zinc-900/40 backdrop-blur-md rounded-[2.5rem] border border-zinc-200/50 dark:border-white/5 p-8 shadow-sm flex flex-col justify-between relative overflow-hidden h-[30.25rem]">
        {/* Spot Light Ambient Accent */}
        <div className="absolute right-0 top-0 w-36 h-36 bg-indigo-500/5 rounded-full blur-[40px] pointer-events-none -translate-y-1/2 translate-x-1/3" />

        {selectedCompetitor ? (
          <div className="flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Explorer Spotlight
                </span>
                <span className="text-xs font-black text-indigo-500 bg-indigo-500/10 px-2.5 py-1 rounded-xl">
                  {selectedCompetitor.favoriteRegion} Enthusiast
                </span>
              </div>

              <div className="flex gap-4 items-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl shadow-semibold border border-zinc-200/50 dark:border-white/5 font-black shrink-0 animate-bounce">
                  {selectedCompetitor.avatarEmoji}
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-950 dark:text-white">
                    {selectedCompetitor.name}
                  </h3>
                  <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-0.5">
                    Level {Math.ceil(selectedCompetitor.countriesCount * 1.5) || 1} Globetrotter
                  </p>
                </div>
              </div>

              <p className="text-xs text-zinc-505 dark:text-zinc-400 mt-5 font-semibold leading-relaxed border-t border-b border-zinc-100 dark:border-white/5 py-4">
                {selectedCompetitor.bio}
              </p>

              {/* Stats Mini Grid */}
              <div className="grid grid-cols-3 gap-2 mt-5 text-center">
                <div className="bg-zinc-100/40 dark:bg-white/5 p-2 rounded-2xl border border-zinc-200/20">
                  <span className="block text-[8px] uppercase tracking-wide text-zinc-400">PASSPORTS</span>
                  <span className="text-sm font-black text-gray-950 dark:text-white mt-1 block">
                    {selectedCompetitor.countriesCount}
                  </span>
                </div>
                <div className="bg-zinc-100/40 dark:bg-white/5 p-2 rounded-2xl border border-zinc-200/20">
                  <span className="block text-[8px] uppercase tracking-wide text-zinc-400">STICKERS</span>
                  <span className="text-sm font-black text-gray-950 dark:text-white mt-1 block">
                    {selectedCompetitor.stickersCount}
                  </span>
                </div>
                <div className="bg-zinc-100/40 dark:bg-white/5 p-2 rounded-2xl border border-zinc-200/20">
                  <span className="block text-[8px] uppercase tracking-wide text-zinc-400">DISTANCE</span>
                  <span className="text-sm font-black text-gray-950 dark:text-white mt-1 block truncate">
                    {(selectedCompetitor.distanceKm).toLocaleString()} km
                  </span>
                </div>
              </div>

              {/* High-Tier Rare Discoveries */}
              <div className="mt-5">
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-2">
                  Historic Wonder Adhesions
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCompetitor.rareStickersList.length > 0 ? (
                    selectedCompetitor.rareStickersList.map((st, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 font-extrabold px-2.5 py-1 rounded-xl"
                      >
                        {st}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] italic text-zinc-400 font-bold">
                      No rare stickers unlocked yet 🧭
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSelectedCompetitor(null)}
                className="w-full py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-350 font-black text-xs uppercase tracking-widest rounded-xl transition-colors cursor-pointer"
              >
                Clear Explorer
              </button>
            </div>
          </div>
        ) : (
            <div className="flex flex-col items-center justify-center text-center h-full text-zinc-300 dark:text-zinc-700 p-6">
              <Compass className="w-16 h-16 stroke-1 mb-3 text-zinc-200 dark:text-zinc-820 animate-spin-slow" />
              <h4 className="text-xs font-black uppercase tracking-wider">Spotlight Selection Empty</h4>
              <p className="text-[10px] text-zinc-400 mt-1 pb-16">
                Click any participant profile from the leaderboard registry to load full historic details!
              </p>
            </div>
          )}
      </div>
    </div>
  );
};
