import React, { useMemo, useState } from 'react';
import { 
  Shield, Flame, Crown, Sun, Trees, Heart, Sparkles, Compass, TreePine, 
  Droplet, Waves, Binoculars, Radio, Grid, Hexagon, Atom, Mountain, 
  Snowflake, CloudRain, TowerControl, Torus, Hotel, Check, Calendar, 
  Award, Trash2, Edit2, MapPin, Eye, BookOpen, Stars
} from 'lucide-react';
import { Sticker, StickerClaim, saveManualStickerClaim, deleteManualStickerClaim } from '../utils/stickersData';
import { Trip } from '../types';
import { Modal, Button, Input } from './ui';

interface StickerStampProps {
  sticker: Sticker;
  claim?: StickerClaim;
  onFocusOnMap?: (lat: number, lng: number, name: string) => void;
  availableTrips?: Trip[];
}

const ThemeClasses: Record<string, { gradient: string; shadow: string; border: string; ring: string; text: string; bgSoft: string }> = {
  amber: { 
    gradient: 'from-amber-400 to-orange-500', 
    shadow: 'shadow-orange-500/20', 
    border: 'border-amber-300', 
    ring: 'ring-amber-500/20', 
    text: 'text-amber-950',
    bgSoft: 'bg-amber-500/10 text-amber-300'
  },
  emerald: { 
    gradient: 'from-emerald-400 to-teal-500', 
    shadow: 'shadow-teal-500/20', 
    border: 'border-emerald-300', 
    ring: 'ring-emerald-500/20', 
    text: 'text-emerald-950',
    bgSoft: 'bg-emerald-500/10 text-emerald-300'
  },
  sky: { 
    gradient: 'from-sky-300 to-blue-500', 
    shadow: 'shadow-sky-500/20', 
    border: 'border-sky-200', 
    ring: 'ring-sky-500/20', 
    text: 'text-slate-950',
    bgSoft: 'bg-sky-500/10 text-sky-455'
  },
  rose: { 
    gradient: 'from-rose-400 to-pink-500', 
    shadow: 'shadow-pink-500/20', 
    border: 'border-rose-300', 
    ring: 'ring-rose-500/20', 
    text: 'text-rose-950',
    bgSoft: 'bg-rose-500/10 text-rose-300'
  },
  purple: { 
    gradient: 'from-purple-400 to-fuchsia-500', 
    shadow: 'shadow-fuchsia-500/20', 
    border: 'border-purple-300', 
    ring: 'ring-purple-500/20', 
    text: 'text-purple-950',
    bgSoft: 'bg-purple-500/10 text-purple-300'
  },
  violet: { 
    gradient: 'from-violet-400 to-indigo-500', 
    shadow: 'shadow-indigo-500/20', 
    border: 'border-violet-300', 
    ring: 'ring-violet-500/20', 
    text: 'text-indigo-950',
    bgSoft: 'bg-violet-500/10 text-violet-300'
  },
  indigo: { 
    gradient: 'from-indigo-400 to-purple-600', 
    shadow: 'shadow-indigo-600/20', 
    border: 'border-indigo-300', 
    ring: 'ring-indigo-500/20', 
    text: 'text-indigo-950',
    bgSoft: 'bg-indigo-500/10 text-indigo-300'
  },
  orange: { 
    gradient: 'from-orange-400 to-red-500', 
    shadow: 'shadow-red-500/20', 
    border: 'border-orange-300', 
    ring: 'ring-orange-500/20', 
    text: 'text-orange-950',
    bgSoft: 'bg-orange-500/10 text-orange-300'
  },
  teal: { 
    gradient: 'from-teal-400 to-emerald-500', 
    shadow: 'shadow-emerald-500/20', 
    border: 'border-teal-300', 
    ring: 'ring-teal-500/20', 
    text: 'text-teal-950',
    bgSoft: 'bg-teal-500/10 text-teal-300'
  },
  slate: { 
    gradient: 'from-slate-400 to-zinc-600', 
    shadow: 'shadow-zinc-500/20', 
    border: 'border-slate-350', 
    ring: 'ring-slate-500/20', 
    text: 'text-slate-950',
    bgSoft: 'bg-slate-500/10 text-slate-300'
  },
  cyan: { 
    gradient: 'from-cyan-300 to-sky-500', 
    shadow: 'shadow-sky-500/20', 
    border: 'border-cyan-200', 
    ring: 'ring-cyan-500/20', 
    text: 'text-teal-950',
    bgSoft: 'bg-cyan-500/10 text-cyan-300'
  },
  yellow: { 
    gradient: 'from-yellow-300 to-amber-500', 
    shadow: 'shadow-amber-500/20', 
    border: 'border-yellow-200', 
    ring: 'ring-yellow-500/20', 
    text: 'text-amber-950',
    bgSoft: 'bg-yellow-500/10 text-yellow-300'
  }
};

const IconComponent = ({ name, className }: { name: string; className?: string }) => {
  switch (name) {
    case 'Shield': return <Shield className={className} />;
    case 'Flame': return <Flame className={className} />;
    case 'Crown': return <Crown className={className} />;
    case 'Sun': return <Sun className={className} />;
    case 'Trees': return <Trees className={className} />;
    case 'Heart': return <Heart className={className} />;
    case 'Sparkles': return <Sparkles className={className} />;
    case 'Compass': return <Compass className={className} />;
    case 'TreePine': return <TreePine className={className} />;
    case 'Droplet': return <Droplet className={className} />;
    case 'Waves': return <Waves className={className} />;
    case 'Binoculars': return <Binoculars className={className} />;
    case 'Radio': return <Radio className={className} />;
    case 'Grid': return <Grid className={className} />;
    case 'Hexagon': return <Hexagon className={className} />;
    case 'Atom': return <Atom className={className} />;
    case 'Mountain': return <Mountain className={className} />;
    case 'Snowflake': return <Snowflake className={className} />;
    case 'CloudRain': return <CloudRain className={className} />;
    case 'TowerControl': return <TowerControl className={className} />;
    case 'Torus': return <Torus className={className} />;
    case 'Hotel': return <Hotel className={className} />;
    default: return <Compass className={className} />;
  }
};

export const StickerStamp: React.FC<StickerStampProps> = ({ 
  sticker, 
  claim, 
  onFocusOnMap,
  availableTrips = []
}) => {
  const isUnlocked = !!claim;
  const theme = ThemeClasses[sticker.colorTheme] || ThemeClasses.sky;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [memo, setMemo] = useState(claim?.memo || '');
  const [claimDate, setClaimDate] = useState(claim?.claimDate || new Date().toISOString().substring(0, 10));
  const [matchedTripId, setMatchedTripId] = useState(claim?.matchedTripId || '');
  
  // Computes a deterministic subtle rotation tilt to make the booklet look authentic
  const tilt = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < sticker.name.length; i++) {
      hash = sticker.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return ((Math.abs(hash) % 10) - 5) * 1.5; // -7.5 to +7.5 degrees
  }, [sticker.name]);

  const handleSaveClaim = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenTrip = availableTrips.find(t => t.id === matchedTripId);
    
    saveManualStickerClaim({
      stickerId: sticker.id,
      claimDate,
      memo: memo || `Manually collected your visit to ${sticker.name}!`,
      isAutoMatched: false,
      matchedTripId: matchedTripId || undefined,
      matchedTripName: chosenTrip?.name || undefined
    });
    setIsModalOpen(false);
  };

  const handleDeleteClaim = () => {
    deleteManualStickerClaim(sticker.id);
    setIsModalOpen(false);
    setMemo('');
  };

  return (
    <>
      <div 
        onClick={() => setIsModalOpen(true)}
        style={{ transform: isUnlocked ? `rotate(${tilt}deg)` : undefined }}
        className={`group relative flex flex-col items-center justify-between p-5 rounded-[2.5rem] h-[19rem] w-full border transition-all duration-300 cursor-pointer select-none overflow-hidden hover:-translate-y-1.5 active:scale-[0.98] ${
          isUnlocked 
            ? `bg-gradient-to-br ${theme.gradient} border-white/40 dark:border-white/20 shadow-xl ${theme.shadow} hover:shadow-2xl`
            : 'bg-zinc-50/50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/90 shadow-sm opacity-55 hover:opacity-100'
        }`}
      >
        {/* Holographic sparkle texture for unlocked stickers */}
        {isUnlocked && (
          <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none opacity-20 mix-blend-overlay bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.8),transparent)] transition-opacity group-hover:opacity-35" />
        )}
        
        {/* Peeling effect in the top-right corner */}
        {isUnlocked && (
          <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none overflow-hidden">
            <div className="absolute top-0 right-0 w-12 h-12 bg-white/20 dark:bg-black/20 origin-top-right rotate-45 transform translate-x-5 -translate-y-2 border-l border-b border-black/10 dark:border-white/10" />
          </div>
        )}

        {/* Die-Cut sticker outer white/grey border ring */}
        <div className={`w-full flex justify-between items-center ${isUnlocked ? theme.text : 'text-zinc-400 dark:text-zinc-650'}`}>
          <span className="text-[10px] font-mono tracking-widest font-black uppercase opacity-65">
            {sticker.category.slice(0, 13)}
          </span>
          <span className="text-sm font-bold">
            {isUnlocked ? sticker.emojis : '🔒'}
          </span>
        </div>

        {/* Core Sticker Figure Design */}
        <div className="flex flex-col items-center justify-center space-y-3 flex-1">
          {isUnlocked ? (
            /* Unlocked: Bold Colorful Emblem */
            <div className={`w-20 h-20 rounded-full bg-white/50 backdrop-blur-md flex items-center justify-center border-2 ${theme.border} border-dashed relative shadow-inner ${theme.text} group-hover:scale-110 transition-transform duration-300`}>
              <div className="absolute inset-1.5 rounded-full border border-current opacity-20" />
              <IconComponent name={sticker.icon} className="w-9 h-9 opacity-90 drop-shadow" />
            </div>
          ) : (
            /* Locked: Greyscale Placeholder */
            <div className="w-20 h-20 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-950/40 flex items-center justify-center text-zinc-300 dark:text-zinc-700">
              <IconComponent name={sticker.icon} className="w-8 h-8 opacity-45" />
            </div>
          )}

          <div className="text-center">
            <h4 className={`text-sm font-black tracking-tight leading-tight uppercase ${isUnlocked ? theme.text : 'text-zinc-600 dark:text-zinc-300'}`}>
              {sticker.name}
            </h4>
            <p className={`text-[10px] font-semibold tracking-wide ${isUnlocked ? 'text-black/60 dark:text-white/60' : 'text-zinc-450 dark:text-zinc-500'}`}>
              {sticker.location}
            </p>
          </div>
        </div>

        {/* Sticker Footer status banner */}
        <div className="w-full pt-2 border-t border-black/10 dark:border-white/5 flex justify-between items-center text-[9px] font-mono">
          {isUnlocked ? (
            <>
              <span className={`font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 ${theme.text}`}>
                {claim.isAutoMatched ? '⭐ MATCH' : '🖋️ CLAIMED'}
              </span>
              <span className={`font-black opacity-80 ${theme.text}`}>
                {new Date(claim.claimDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </span>
            </>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-600 block text-center w-full font-bold uppercase tracking-[0.15em]">
              UNCOLLECTED
            </span>
          )}
        </div>
      </div>

      {/* Deep Detail & Claims Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={isUnlocked ? `Sticker: ${sticker.name}` : `Discover: ${sticker.name}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6">
          {/* Main Visual Header Decal Banner */}
          <div className={`p-6 rounded-3xl bg-gradient-to-r ${isUnlocked ? theme.gradient : 'from-zinc-100/70 to-zinc-200/50 dark:from-zinc-950/30 dark:to-zinc-900/40'} border border-zinc-200/50 dark:border-white/5 flex flex-col md:flex-row shadow-sm gap-5 relative overflow-hidden`}>
            {isUnlocked && (
              <div className="absolute right-0 top-0 w-48 h-48 bg-white/10 rounded-full blur-[40px] pointer-events-none -translate-y-1/3 translate-x-1/3" />
            )}
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${isUnlocked ? 'bg-white/40 text-black/90' : 'bg-zinc-200 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-400'} text-3xl shadow`}>
              {isUnlocked ? sticker.emojis.split(' ')[0] : '🔒'}
            </div>
            <div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${isUnlocked ? 'bg-black/10 text-black/80' : 'bg-zinc-100 dark:bg-white/10 text-zinc-500'}`}>
                  {sticker.category}
                </span>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {sticker.lat.toFixed(4)}°, {sticker.lng.toFixed(4)}°
                </span>
              </div>
              <h2 className={`text-2xl font-black tracking-tight mt-1.5 ${isUnlocked ? theme.text : 'text-zinc-950 dark:text-white'}`}>
                {sticker.name}
              </h2>
              <p className={`text-xs font-bold ${isUnlocked ? 'text-black/60 dark:text-white/60' : 'text-zinc-500'}`}>
                {sticker.location} ({sticker.countryCode})
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed">
            {/* Descriptive Content Section */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider mb-1">
                  Historical Record
                </h4>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {sticker.description}
                </p>
              </div>

              <div className="p-4 bg-amber-500/10 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 rounded-2xl border border-amber-300/30">
                <h5 className="text-[10px] font-black uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Stars className="w-3.5 h-3.5" /> Did You Know?
                </h5>
                <p className="text-xs leading-normal font-semibold">
                  {sticker.funFact}
                </p>
              </div>

              {/* Utility command triggers */}
              <div className="flex gap-3">
                {onFocusOnMap && (
                  <Button 
                    variant="secondary" 
                    size="sm"
                    className="flex-1 rounded-xl font-bold py-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-white/5"
                    icon={<MapPin className="w-4 h-4 text-blue-500" />}
                    onClick={() => {
                      onFocusOnMap(sticker.lat, sticker.lng, sticker.name);
                      setIsModalOpen(false);
                    }}
                  >
                    Locate on Atlas
                  </Button>
                )}
              </div>
            </div>

            {/* Sticker Claim Log (Gamification Core) */}
            <div className="p-5 rounded-3xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-900/40 relative">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-xs font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
                  Journal Entry & Logs
                </h4>
                {isUnlocked && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded font-black uppercase">
                    Unlocked
                  </span>
                )}
              </div>

              {isUnlocked ? (
                /* Detail Summary of Collected Visit */
                <div className="space-y-4 text-sm font-medium">
                  {claim.isAutoMatched ? (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      <p className="text-xs font-black uppercase mb-0.5 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Automatic Verification
                      </p>
                      <p className="text-[11px] font-semibold leading-relaxed">
                        Match detected on past trip <strong className="font-bold underline">"{claim.matchedTripName}"</strong> scheduled for {new Date(claim.claimDate).toLocaleDateString()}.
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-450 uppercase font-bold tracking-wide block">Visit Date</span>
                    <p className="text-zinc-900 dark:text-white font-bold flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-500" />
                      {new Date(claim.claimDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-450 uppercase font-bold tracking-wide block">My Memories</span>
                    <blockquote className="p-3 bg-zinc-100/50 dark:bg-zinc-900/60 rounded-xl italic text-zinc-700 dark:text-zinc-300 border-l-4 border-indigo-500">
                      "{claim.memo}"
                    </blockquote>
                  </div>

                  {!claim.isAutoMatched && (
                    <div className="pt-2 flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="rounded-xl font-bold py-2 text-red-500 hover:bg-red-500/10"
                        icon={<Trash2 className="w-4 h-4" />}
                        onClick={handleDeleteClaim}
                      >
                        Delete Claim
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                /* Form to claim visit manually */
                <form onSubmit={handleSaveClaim} className="space-y-4">
                  <p className="text-xs text-zinc-500 font-medium leading-relaxed mb-1">
                    Have you stood before this iconic landmark? Unlock this beautiful adhesive sticker for your booklet by logging your prior travel memories here.
                  </p>

                  <Input 
                    type="date" 
                    label="Date of Visit"
                    value={claimDate}
                    onChange={(e) => setClaimDate(e.target.value)}
                    required
                  />

                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">
                      Link with Database Trip (Optional)
                    </label>
                    <select
                      className="w-full px-4 py-3 rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none text-xs text-gray-800 dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100"
                      value={matchedTripId}
                      onChange={(e) => setMatchedTripId(e.target.value)}
                    >
                      <option value="">-- No tied trip (Independent memory) --</option>
                      {availableTrips.map(trip => (
                        <option key={trip.id} value={trip.id}>
                          {trip.name} ({trip.location} - {new Date(trip.startDate).getFullYear()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">
                      Journal Entry Memories
                    </label>
                    <textarea
                      placeholder="e.g. The sunset was incredible and the altitude was breathtaking! Stood there feeling so tiny..."
                      className="w-full h-24 px-4 py-3 text-xs rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none text-gray-800 dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      required
                    />
                  </div>

                  <Button 
                    type="submit" 
                    variant="primary" 
                    className="w-full rounded-2xl py-3 font-black text-sm uppercase tracking-wider"
                    icon={<Award className="w-4 h-4" />}
                  >
                    Unlock and Apply Sticker
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
