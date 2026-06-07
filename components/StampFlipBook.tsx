import React, { useState, useMemo } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Compass, Stars, Map, Award, HelpCircle } from 'lucide-react';
import { VisitedCountry } from './PassportStamp';
import { Sticker, StickerClaim, ICONIC_STICKERS } from '../utils/stickersData';
import { PassportStamp } from './PassportStamp';

interface StampFlipBookProps {
  visitedCountries: VisitedCountry[];
  stickerClaims: Map<string, StickerClaim>;
}

export const StampFlipBook: React.FC<StampFlipBookProps> = ({ visitedCountries, stickerClaims }) => {
  const [currentPage, setCurrentPage] = useState(0); // 0 = Cover, 1 = First Spread, etc.
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [stampTypeFilter, setStampTypeFilter] = useState<'both' | 'countries' | 'stickers'>('both');

  // Interactive mouse perspective 3D tilting
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12; // rotateY limit to 12 degrees
    const y = -((e.clientY - rect.top) / rect.height - 0.5) * 12; // rotateX limit to 11 degrees
    setTilt({ x, y });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  };

  // Compile items to place in the booklet
  const bookletItems = useMemo(() => {
    const items: Array<
      | { type: 'country'; data: VisitedCountry }
      | { type: 'sticker'; data: Sticker; claim: StickerClaim }
    > = [];

    if (stampTypeFilter === 'both' || stampTypeFilter === 'countries') {
      visitedCountries.forEach((c) => {
        items.push({ type: 'country', data: c });
      });
    }

    if (stampTypeFilter === 'both' || stampTypeFilter === 'stickers') {
      ICONIC_STICKERS.forEach((sticker) => {
        const claim = stickerClaims.get(sticker.id);
        if (claim) {
          items.push({ type: 'sticker', data: sticker, claim });
        }
      });
    }

    return items;
  }, [visitedCountries, stickerClaims, stampTypeFilter]);

  // Divide items into pages. Each spread (starting at page index 1) shows 2 items on desktop, 1 on mobile
  const pagesCount = Math.ceil(bookletItems.length / 2);
  const totalPages = 1 + pagesCount; // 1 (Cover) + spreads

  const handleNext = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* Booklet Filter Control Bar */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100/65 dark:bg-zinc-900/65 rounded-2xl border border-zinc-200/40 dark:border-white/5 mb-6 z-10 self-center">
        <button
          onClick={() => { setStampTypeFilter('both'); setCurrentPage(0); }}
          className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            stampTypeFilter === 'both'
              ? 'bg-white dark:bg-zinc-800 text-gray-950 dark:text-white shadow-xs'
              : 'text-zinc-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          All Stamps
        </button>
        <button
          onClick={() => { setStampTypeFilter('countries'); setCurrentPage(0); }}
          className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            stampTypeFilter === 'countries'
              ? 'bg-white dark:bg-zinc-800 text-gray-950 dark:text-white shadow-xs'
              : 'text-zinc-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          Countries ({visitedCountries.length})
        </button>
        <button
          onClick={() => { setStampTypeFilter('stickers'); setCurrentPage(0); }}
          className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            stampTypeFilter === 'stickers'
              ? 'bg-white dark:bg-zinc-800 text-gray-950 dark:text-white shadow-xs'
              : 'text-zinc-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          Landmarks ({Array.from(stickerClaims.values()).length})
        </button>
      </div>

      {/* Main 3D Interactive Container */}
      <div 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={() => setIsHovered(true)}
        style={{
          perspective: '1200px',
        }}
        className="w-full max-w-4xl h-[26rem] md:h-[30rem] relative flex items-center justify-center select-none"
      >
        <div
          style={{
            transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
            transformStyle: 'preserve-3d',
            transition: isHovered ? 'transform 0.1s ease-out, box-shadow 0.3s ease-out' : 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.6s cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          className={`w-full max-w-3xl h-full rounded-[2.5rem] relative transition-all ${
            isHovered 
              ? 'shadow-[0_30px_60px_-15px_rgba(0,0,0,0.45)] dark:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]' 
              : 'shadow-[0_20px_40px_-20px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)]'
          }`}
        >
          {/* Cover Page */}
          {currentPage === 0 ? (
            <div className="absolute inset-0 bg-gradient-to-br from-[#1e2530] via-[#11161d] to-[#0a0d12] rounded-[2.5rem] border border-zinc-800 flex flex-col items-center justify-between p-12 text-center text-amber-500 overflow-hidden shadow-inner">
              {/* Cover aesthetic stamps */}
              <div className="absolute -left-12 -top-12 w-48 h-48 bg-amber-500/5 rounded-full blur-[40px] pointer-events-none" />
              <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-amber-500/5 rounded-full blur-[40px] pointer-events-none" />
              
              <div className="flex flex-col items-center mt-6 space-y-4">
                <div className="p-4 bg-amber-500/10 rounded-full border border-amber-500/20 shadow-lg shadow-amber-500/5">
                  <Compass className="w-12 h-12 text-amber-400 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="text-[10px] font-mono tracking-[0.3em] uppercase opacity-75 text-amber-300 font-black">
                    Official Travel Document
                  </h3>
                  <h1 className="text-3xl md:text-4xl font-black mt-2 tracking-tight uppercase text-white font-sans">
                    PASSPORT &amp; ALBUM
                  </h1>
                </div>
              </div>

              <div className="max-w-md bg-white/5 border border-white/5 backdrop-blur-md p-5 rounded-3xl mt-2 text-zinc-300">
                <p className="text-xs font-semibold leading-relaxed">
                  "Not all those who wander are lost." This physical ledger archives your verified boundary passages and sacred historic sticker discoveries from across the globe.
                </p>
                <div className="mt-4 flex gap-6 justify-center items-center text-[10px] font-mono uppercase text-amber-400 font-bold tracking-widest">
                  <span>🗺️ {visitedCountries.length} Countries</span>
                  <span>⭐ {Array.from(stickerClaims.values()).length} Stickers</span>
                </div>
              </div>

              <button
                onClick={handleNext}
                className="mb-4 px-6 py-3 bg-amber-500 dark:bg-amber-600 hover:bg-amber-400 dark:hover:bg-amber-500 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer"
              >
                Open Booklet
              </button>
            </div>
          ) : (
            /* Open Booklet Spread Layout */
            <div className="absolute inset-0 flex bg-stone-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] overflow-hidden">
              
              {/* Left Page (Spread Side 1) */}
              <div className="flex-1 h-full p-6 md:p-8 flex flex-col justify-between border-r border-[#d4cfc3]/50 dark:border-zinc-800 relative bg-gradient-to-r from-stone-100 to-stone-50 dark:from-zinc-950 dark:to-zinc-900">
                {/* Vintage paper texture lining */}
                <div className="absolute inset-0 opacity-15 dark:opacity-5 mix-blend-multiply dark:mix-blend-screen pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')]" />
                
                <div className="flex justify-between items-center text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                  <span>PAGE {currentPage * 2 - 1}</span>
                  <span className="uppercase text-[8px] font-black">EXPEDITION PASSPORT</span>
                </div>

                <div className="flex items-center justify-center flex-1 my-4">
                  {bookletItems[(currentPage - 1) * 2] ? (
                    (() => {
                      const item = bookletItems[(currentPage - 1) * 2];
                      if (item.type === 'country') {
                        return (
                          <div className="w-full max-w-xs scale-90 md:scale-100">
                            <PassportStamp country={item.data} />
                          </div>
                        );
                      } else {
                        return (
                          <div className="text-center p-4 bg-gradient-to-br from-indigo-50/50 to-indigo-100/30 dark:from-indigo-950/20 dark:to-indigo-900/10 border border-indigo-100 dark:border-indigo-950/40 rounded-3xl w-full max-w-xs relative overflow-hidden group">
                            <span className="text-4xl block mb-2">{item.data.emojis}</span>
                            <h4 className="text-xs font-black uppercase text-gray-900 dark:text-white truncate">{item.data.name}</h4>
                            <p className="text-[10px] text-zinc-400 uppercase font-black tracking-wide mt-0.5">{item.data.location}</p>
                            <div className="mt-3 text-[10px] text-indigo-500 font-bold bg-indigo-500/10 px-2.5 py-1 rounded-xl inline-block">
                              🎖️ Stamp Acquired
                            </div>
                          </div>
                        );
                      }
                    })()
                  ) : (
                    <div className="text-center p-6 text-zinc-300 dark:text-zinc-700 max-w-xs">
                      <HelpCircle className="w-10 h-10 mx-auto stroke-1" />
                      <p className="text-xs mt-2 font-bold uppercase tracking-wider">Unused Stamp Slot</p>
                      <p className="text-[10px] text-zinc-400 mt-1">Visit new destinations or verify landmark locations to stamp this page!</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-start">
                  <button 
                    onClick={handlePrev}
                    className="p-2 mr-2 bg-stone-200 hover:bg-stone-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                  </button>
                </div>
              </div>

              {/* Central Booklet spine seam / shadow line */}
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-6 bg-gradient-to-r from-black/10 via-black/25 to-black/10 dark:from-black/30 dark:via-black/55 dark:to-black/30 z-10 pointer-events-none" />

              {/* Right Page (Spread Side 2) */}
              <div className="flex-1 h-full p-6 md:p-8 flex flex-col justify-between relative bg-gradient-to-l from-stone-100 to-stone-50 dark:from-zinc-950 dark:to-zinc-900">
                <div className="absolute inset-0 opacity-15 dark:opacity-5 mix-blend-multiply dark:mix-blend-screen pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cardboard-flat.png')]" />

                <div className="flex justify-between items-center text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                  <span className="uppercase text-[8px] font-black">LANDMARK ALMANAC</span>
                  <span>PAGE {currentPage * 2}</span>
                </div>

                <div className="flex items-center justify-center flex-1 my-4">
                  {bookletItems[(currentPage - 1) * 2 + 1] ? (
                    (() => {
                      const item = bookletItems[(currentPage - 1) * 2 + 1];
                      if (item.type === 'country') {
                        return (
                          <div className="w-full max-w-xs scale-90 md:scale-100">
                            <PassportStamp country={item.data} />
                          </div>
                        );
                      } else {
                        return (
                          <div className="text-center p-4 bg-gradient-to-br from-indigo-50/50 to-indigo-100/30 dark:from-indigo-950/20 dark:to-indigo-900/10 border border-indigo-100 dark:border-indigo-950/40 rounded-3xl w-full max-w-xs relative overflow-hidden group">
                            <span className="text-4xl block mb-2">{item.data.emojis}</span>
                            <h4 className="text-xs font-black uppercase text-gray-900 dark:text-white truncate">{item.data.name}</h4>
                            <p className="text-[10px] text-zinc-400 uppercase font-black tracking-wide mt-0.5">{item.data.location}</p>
                            <div className="mt-3 text-[10px] text-indigo-500 font-bold bg-indigo-500/10 px-2.5 py-1 rounded-xl inline-block">
                              🎖️ Stamp Acquired
                            </div>
                          </div>
                        );
                      }
                    })()
                  ) : (
                    <div className="text-center p-6 text-zinc-300 dark:text-zinc-700 max-w-xs">
                      <HelpCircle className="w-10 h-10 mx-auto stroke-1" />
                      <p className="text-xs mt-2 font-bold uppercase tracking-wider">Unused Stamp Slot</p>
                      <p className="text-[10px] text-zinc-400 mt-1">Unlock new stickers by listing landmarks in your travel plans or past memories.</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button 
                    onClick={handleNext}
                    disabled={currentPage >= totalPages - 1}
                    className={`p-2 bg-stone-200 hover:bg-stone-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-all cursor-pointer ${
                      currentPage >= totalPages - 1 ? 'opacity-35 cursor-not-allowed' : ''
                    }`}
                  >
                    <ChevronRight className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Pages indicator index summary bar */}
      {currentPage > 0 && (
        <div className="mt-4 flex items-center gap-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">
          <span>{currentPage * 2 - 1} - {currentPage * 2}</span>
          <div className="flex gap-1.5">
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentPage(idx)}
                className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                  currentPage === idx 
                    ? 'bg-amber-500 w-4' 
                    : 'bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400'
                }`}
              />
            ))}
          </div>
          <span>Total Pages: {totalPages * 2}</span>
        </div>
      )}
    </div>
  );
};
