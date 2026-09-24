import React from 'react';
import { Speedometer } from '@phosphor-icons/react';

interface DurationInputProps {
    minutes: number;
    onChange: (m: number) => void;
    onAutoCalc?: () => void;
    canAutoCalc?: boolean;
}

export const DurationInput: React.FC<DurationInputProps> = ({ 
    minutes, 
    onChange, 
    onAutoCalc, 
    canAutoCalc 
}) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">Duration</label>
                {onAutoCalc && canAutoCalc && (
                    <button 
                        type="button"
                        onClick={onAutoCalc} 
                        className="text-xs font-bold text-primary-500 hover:text-primary-600 flex items-center gap-1 bg-primary-500/10 px-2 py-0.5 rounded transition-colors cursor-pointer"
                        title="Estimate duration based on distance and speed"
                        aria-label="Estimate duration"
                    >
                        <Speedometer className="w-3.5 h-3.5" weight="duotone" /> Auto
                    </button>
                )}
            </div>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <input 
                        type="number" 
                        min="0"
                        className="w-full px-3 py-2.5 rounded-xl bg-white/80 dark:bg-dark-card/70 backdrop-blur-md border border-black/12 dark:border-white/10 text-light-text dark:text-dark-text outline-none font-bold text-sm pr-8 [&::-webkit-inner-spin-button]:cursor-pointer [&::-webkit-inner-spin-button]:opacity-40 hover:[&::-webkit-inner-spin-button]:opacity-80"
                        value={hours}
                        onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            onChange(val * 60 + mins);
                        }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">h</span>
                </div>
                <div className="relative flex-1">
                    <input 
                        type="number" 
                        min="0"
                        max="59"
                        className="w-full px-3 py-2.5 rounded-xl bg-white/80 dark:bg-dark-card/70 backdrop-blur-md border border-black/12 dark:border-white/10 text-light-text dark:text-dark-text outline-none font-bold text-sm pr-8 [&::-webkit-inner-spin-button]:cursor-pointer [&::-webkit-inner-spin-button]:opacity-40 hover:[&::-webkit-inner-spin-button]:opacity-80"
                        value={mins}
                        onChange={(e) => {
                            const val = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                            onChange(hours * 60 + val);
                        }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">m</span>
                </div>
            </div>
        </div>
    );
};
