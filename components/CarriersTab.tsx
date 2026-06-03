import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from './ui';
import { WorkspaceSettings, Carrier } from '../types';
import { dataService } from '../services/mockDb';
import { getMerchantLogoUrl } from '../utils/brandfetch';
import { getCarrierName } from '../utils/flightData';

interface CarriersTabProps {
    config: WorkspaceSettings;
    setConfig: (config: WorkspaceSettings) => void;
    handleSaveOrgSettings: () => Promise<void>;
    isSavingOrg: boolean;
}

// Robust Image component that automatically transitions through cdn.brandfetch -> Clearbit -> unauth brandfetch -> Google Favicon
interface CarrierImageProps {
    domain: string;
    alt: string;
    className?: string;
    apiKey?: string;
    fill?: boolean;
}

const CarrierImage: React.FC<CarrierImageProps> = ({ domain, alt, className = "w-12 h-12", apiKey, fill = false }) => {
    const [src, setSrc] = useState<string>('');
    const [attempt, setAttempt] = useState(0);

    const getUrl = (d: string, att: number): string => {
        const cleanDomain = d.trim().toLowerCase();
        const steps: string[] = [];
        
        if (apiKey) {
            const bfUrl = getMerchantLogoUrl(cleanDomain, apiKey, {}, { type: 'icon', fallback: '404' });
            if (bfUrl) steps.push(bfUrl);
        }
        
        steps.push(`https://logo.clearbit.com/${cleanDomain}`);
        steps.push(`https://asset.brandfetch.io/${cleanDomain}/logo?theme=light`);
        steps.push(`https://www.google.com/s2/favicons?sz=128&domain=${cleanDomain}`);
        
        return steps[att] || '';
    };

    useEffect(() => {
        if (domain) {
            setSrc(getUrl(domain, 0));
            setAttempt(0);
        }
    }, [domain, apiKey]);

    const handleError = () => {
        const maxAttempts = apiKey ? 3 : 2;
        if (attempt < maxAttempts) {
            const next = attempt + 1;
            setAttempt(next);
            setSrc(getUrl(domain, next));
        } else {
            setSrc('__failed__');
        }
    };

    if (!domain || src === '__failed__') {
        return (
            <div className={`${className} bg-zinc-100 border border-zinc-200 dark:bg-zinc-850 dark:border-white/5 rounded-xl flex items-center justify-center ${fill ? 'p-0' : 'p-2'} text-zinc-400`}>
                <span className="material-icons-outlined text-lg">flight_takeoff</span>
            </div>
        );
    }

    return (
        <div className={`${className} bg-white border border-zinc-150 rounded-xl flex items-center justify-center ${fill ? 'p-0' : 'p-1.5'} dark:bg-zinc-800 dark:border-white/5 overflow-hidden`}>
            <img 
                src={src || getUrl(domain, 0)} 
                alt={alt} 
                className={`w-full h-full ${fill ? 'object-cover' : 'object-contain'}`}
                referrerPolicy="no-referrer"
                onError={handleError}
            />
        </div>
    );
};

export const CarriersTab: React.FC<CarriersTabProps> = ({ config, setConfig, handleSaveOrgSettings, isSavingOrg }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [domain, setDomain] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    const carriers = config.carriers || [];

    // Clear notification automatically after 5 seconds
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const handleAddOrEditCarrier = () => {
        if (!name.trim() || !code.trim() || !domain.trim()) return;

        let updatedCarriers: Carrier[];
        if (editingId) {
            updatedCarriers = carriers.map(c => 
                c.id === editingId 
                    ? { ...c, name: name.trim(), code: code.trim().toUpperCase(), domain: domain.trim().toLowerCase() } 
                    : c
            );
            setEditingId(null);
            setNotification({ type: 'success', text: `Successfully updated carrier: ${name.trim()}` });
        } else {
            const codeUpper = code.trim().toUpperCase();
            // Check for duplicates
            if (carriers.some(c => c.code === codeUpper)) {
                setNotification({ type: 'error', text: `Carrier code "${codeUpper}" is already registered.` });
                return;
            }

            const newCarrier: Carrier = {
                id: Math.random().toString(36).substr(2, 9),
                name: name.trim(),
                code: codeUpper,
                domain: domain.trim().toLowerCase()
            };
            updatedCarriers = [...carriers, newCarrier];
            setNotification({ type: 'success', text: `Successfully added carrier: ${name.trim()}` });
        }

        setConfig({ ...config, carriers: updatedCarriers });
        setName('');
        setCode('');
        setDomain('');
    };

    const handleAutoPopulate = async () => {
        setIsScanning(true);
        setNotification(null);
        try {
            // Retrieve trips and flights from db
            const [trips, independentFlights] = await Promise.all([
                dataService.getTrips(),
                dataService.getFlights()
            ]);

            const allFlights: any[] = [];
            
            // Extract flights from trips
            trips.forEach((t: any) => {
                if (t.transports) {
                    t.transports.forEach((transport: any) => {
                        if (transport.mode === 'Flight') {
                            allFlights.push(transport);
                        }
                    });
                }
            });

            // Extract independent flights
            independentFlights.forEach((f: any) => {
                allFlights.push(f);
            });

            if (allFlights.length === 0) {
                setNotification({ type: 'info', text: 'No flight records found to auto-populate from.' });
                setIsScanning(false);
                return;
            }

            // Common mapping for popular providers to official domains
            const mappings: Record<string, string> = {
              'deltaairlines': 'delta.com', 'delta': 'delta.com', 'americanairlines': 'aa.com', 'american': 'aa.com',
              'unitedairlines': 'united.com', 'united': 'united.com', 'southwestairlines': 'southwest.com', 'southwest': 'southwest.com',
              'britishairways': 'britishairways.com', 'emirates': 'emirates.com', 'qatarairways': 'qatarairways.com', 'qatar': 'qatarairways.com',
              'lufthansa': 'lufthansa.com', 'airfrance': 'airfrance.com', 'klm': 'klm.com', 'singaporeairlines': 'singaporeair.com',
              'cathaypacific': 'cathaypacific.com', 'ana': 'ana.co.jp', 'japanairlines': 'jal.com', 'jal': 'jal.com',
              'ryanair': 'ryanair.com', 'easyjet': 'easyjet.com'
            };

            const updatedCarriers = [...carriers];
            let addedCount = 0;

            allFlights.forEach((flight: any) => {
                const rawProvider = flight.provider || flight.providerCode;
                if (!rawProvider) return;

                const codeStr = (flight.providerCode || rawProvider || '').trim().toUpperCase();
                let nameStr = (flight.provider || flight.providerCode || '').trim();
                
                // If it's a code, attempt to get real commercial name
                if (nameStr.length <= 3 && nameStr === nameStr.toUpperCase()) {
                    const resolvedName = getCarrierName(nameStr);
                    if (resolvedName && resolvedName !== nameStr) {
                        nameStr = resolvedName;
                    }
                }

                if (!codeStr || !nameStr) return;

                // Check duplicates against updated carriers list
                const exists = updatedCarriers.some(
                    c => c.code.toUpperCase() === codeStr.toUpperCase() || 
                         c.name.toLowerCase() === nameStr.toLowerCase()
                );

                if (!exists) {
                    // Match a standard domain or guess
                    const cleanedName = nameStr.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const domainStr = mappings[cleanedName] || `${cleanedName}.com`;

                    updatedCarriers.push({
                        id: Math.random().toString(36).substr(2, 9),
                        name: nameStr,
                        code: codeStr,
                        domain: domainStr
                    });
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                setConfig({ ...config, carriers: updatedCarriers });
                setNotification({ 
                    type: 'success', 
                    text: `Scanned flight logs successfully! Identified and added ${addedCount} new carrier(s). Save settings to persist.` 
                });
            } else {
                setNotification({ 
                    type: 'info', 
                    text: 'Scanned flight logs successfully. All identified operating carriers are already registered.' 
                });
            }
        } catch (error) {
            console.error("Auto populate custom carriers error:", error);
            setNotification({ type: 'error', text: 'Failed to auto-populate from flights.' });
        } finally {
            setIsScanning(false);
        }
    };

    const handleEditClick = (c: Carrier) => {
        setEditingId(c.id);
        setName(c.name);
        setCode(c.code);
        setDomain(c.domain);
    };

    const handleDeleteCarrier = (id: string) => {
        const target = carriers.find(c => c.id === id);
        const updatedCarriers = carriers.filter(c => c.id !== id);
        setConfig({ ...config, carriers: updatedCarriers });
        
        if (target) {
            setNotification({ type: 'info', text: `Deleted custom carrier: ${target.name}` });
        }

        if (editingId === id) {
            setEditingId(null);
            setName('');
            setCode('');
            setDomain('');
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setName('');
        setCode('');
        setDomain('');
    };

    // Filter carriers according to search term
    const filteredCarriers = carriers.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.domain.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full animate-fade-in pb-4">
            <Card noPadding className="rounded-[2.5rem] border-white/50 dark:border-white/10 shadow-2xl h-full flex flex-col overflow-hidden">
                <div className="p-8 border-b border-gray-100 dark:border-white/5 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 rounded-t-[2.5rem] shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-blue-500 to-indigo-650 flex items-center justify-center text-white shadow-xl shadow-blue-500/10">
                                <span className="material-icons-outlined text-3xl">flight_takeoff</span>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Operating Carriers</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Manage airline overrides and Brandfetch API domains</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                variant="outline"
                                size="lg"
                                className="!rounded-2xl shadow-sm border-gray-200 dark:border-white/10 text-gray-700 dark:text-zinc-200 cursor-pointer"
                                onClick={handleAutoPopulate}
                                isLoading={isScanning}
                                icon={<span className="material-icons-outlined text-gray-500">sync_alt</span>}
                            >
                                Auto-Fill from Flights
                            </Button>
                            <Button 
                                variant="primary" 
                                size="lg" 
                                className="!rounded-2xl shadow-xl shadow-blue-500/20 text-white cursor-pointer font-bold" 
                                onClick={handleSaveOrgSettings}
                                isLoading={isSavingOrg}
                                icon={<span className="material-icons-outlined text-white">save</span>}
                            >
                                Save Carriers List
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Notification Banner */}
                {notification && (
                    <div className={`px-8 py-3 shrink-0 flex items-center justify-between border-b text-xs font-bold font-sans ${
                        notification.type === 'success' 
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                            : notification.type === 'error'
                            ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400'
                            : 'bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30 text-blue-600 dark:text-blue-400'
                    }`}>
                        <div className="flex items-center gap-2">
                            <span className="material-icons-outlined text-sm">
                                {notification.type === 'success' ? 'check_circle' : notification.type === 'error' ? 'error' : 'info'}
                            </span>
                            <span>{notification.text}</span>
                        </div>
                        <button onClick={() => setNotification(null)} className="opacity-60 hover:opacity-100 cursor-pointer text-current">
                            <span className="material-icons-outlined text-sm">close</span>
                        </button>
                    </div>
                )}

                <div className="flex-1 flex flex-col lg:flex-row min-h-[450px] bg-gray-50/20 dark:bg-white/5 overflow-hidden">
                    {/* Input/Edit Form on the left/top */}
                    <div className="w-full lg:w-[24rem] p-8 border-r border-b lg:border-b-0 border-zinc-200/60 dark:border-white/5 bg-white/40 dark:bg-black/10 shrink-0 overflow-y-auto custom-scrollbar">
                        <h4 className="text-lg font-black text-gray-900 dark:text-white mb-6 font-sans">
                            {editingId ? 'Edit Carrier Mapping' : 'Add Carrier Mapping'}
                        </h4>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider font-mono">Carrier Name</label>
                                <Input 
                                    placeholder="e.g. Lufthansa" 
                                    value={name} 
                                    onChange={e => setName(e.target.value)}
                                    className="!bg-white dark:!bg-zinc-900/60 !border-transparent shadow-sm rounded-xl"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider font-mono">Airline Code or Provider ID</label>
                                <Input 
                                    placeholder="e.g. LH or lufthansa" 
                                    value={code} 
                                    onChange={e => setCode(e.target.value)}
                                    className="!bg-white dark:!bg-zinc-900/60 !border-transparent shadow-sm rounded-xl"
                                />
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block leading-normal mt-1">
                                    Matches flight provider entries case-insensitively (e.g. LH, Delta, DL).
                                </span>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider font-mono">Brandfetch Domain Override</label>
                                <Input 
                                    placeholder="e.g. lufthansa.com" 
                                    value={domain} 
                                    onChange={e => setDomain(e.target.value)}
                                    className="!bg-white dark:!bg-zinc-900/60 !border-transparent shadow-sm rounded-xl"
                                />
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block leading-normal mt-1">
                                    Provides high-fidelity, vector-refined brand assets and icons on dashboards.
                                </span>
                            </div>

                            {/* Logo Live Preview */}
                            {domain.trim() && (
                                <div className="p-4 rounded-xl bg-white border border-zinc-200/50 dark:bg-black/30 dark:border-white/5 flex items-center gap-4 shadow-sm animate-fade-in">
                                    <CarrierImage domain={domain} alt="Preview" className="w-12 h-12 shrink-0" apiKey={config.brandfetchApiKey} />
                                    <div className="min-w-0">
                                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest block font-mono">Interactive Preview</span>
                                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate block max-w-[140px] mt-0.5">{domain.trim()}</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                {editingId && (
                                    <Button variant="ghost" className="flex-1 !rounded-xl cursor-pointer" onClick={handleCancelEdit}>
                                        Cancel
                                    </Button>
                                )}
                                <Button 
                                    variant="primary" 
                                    className="flex-1 !rounded-xl text-white font-bold cursor-pointer" 
                                    onClick={handleAddOrEditCarrier}
                                    disabled={!name.trim() || !code.trim() || !domain.trim()}
                                >
                                    {editingId ? 'Save Changes' : 'Register Carrier'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Carrier searchable List + Table on the right */}
                    <div className="flex-1 p-8 flex flex-col min-w-0 overflow-hidden">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
                            <div>
                                <h4 className="text-lg font-black text-gray-900 dark:text-white font-sans">Registered Carrier Mappings</h4>
                                <p className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mt-1">Configure {carriers.length} mappings</p>
                            </div>
                            
                            {/* Search Filter input */}
                            <div className="relative w-full sm:w-72">
                                <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-450 dark:text-zinc-500 text-[18px]">search</span>
                                <input
                                    type="text"
                                    placeholder="Filter by airline name, code, domain..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full text-xs bg-white dark:bg-zinc-900/50 border border-zinc-200/55 dark:border-white/5 rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-zinc-400 font-sans text-zinc-800 dark:text-zinc-100 shadow-sm"
                                />
                                {searchQuery && (
                                    <button 
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 cursor-pointer text-xs font-bold"
                                    >
                                        CLEAR
                                    </button>
                                )}
                            </div>
                        </div>

                        {carriers.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-zinc-200 dark:border-white/5 rounded-3xl bg-white/40 dark:bg-black/10 min-h-[300px]">
                                <span className="material-icons-outlined text-5xl text-gray-300 mb-3 animate-pulse">flight_takeoff</span>
                                <p className="text-sm font-extrabold text-zinc-550 dark:text-zinc-400">No Custom Carriers Configured</p>
                                <p className="text-xs text-zinc-400 max-w-sm leading-relaxed mt-2">
                                    Click &quot;Auto-Fill from Flights&quot; to automatically map codes detected in your flight history, or create carrier overrides manually.
                                </p>
                            </div>
                        ) : filteredCarriers.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-zinc-200 dark:border-white/5 rounded-3xl bg-white/40 dark:bg-black/10 min-h-[300px]">
                                <span className="material-icons-outlined text-4xl text-gray-300 mb-3">search_off</span>
                                <p className="text-sm font-extrabold text-zinc-550 dark:text-zinc-400">No results matched your search</p>
                                <p className="text-xs text-zinc-400 mt-1">Try another search query.</p>
                            </div>
                        ) : (
                            <div className="flex-1 bg-white/50 dark:bg-zinc-900/40 border border-zinc-150 dark:border-white/5 shadow-sm rounded-3xl overflow-y-auto overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[500px]">
                                    <thead className="sticky top-0 z-10 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-md">
                                        <tr className="border-b border-zinc-250 dark:border-zinc-850/50 font-mono text-zinc-400 dark:text-zinc-500 text-[11px] font-black uppercase tracking-widest leading-none">
                                            <th className="py-4 pl-6 w-[80px]">Logo</th>
                                            <th className="py-4 px-4">Carrier Name</th>
                                            <th className="py-4 px-4 w-[140px]">Airline Code</th>
                                            <th className="py-4 px-4">Brandfetch Domain</th>
                                            <th className="py-4 pr-6 w-[120px] text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200/50 dark:divide-white/5">
                                        {filteredCarriers.map(c => {
                                            let displayName = c.name;
                                            if (displayName.length <= 3 && displayName === displayName.toUpperCase() || displayName === c.code) {
                                                const resolved = getCarrierName(c.code);
                                                if (resolved && resolved !== c.code) {
                                                    displayName = resolved;
                                                }
                                            }
                                            return (
                                            <tr key={c.id} className="hover:bg-zinc-100/30 dark:hover:bg-zinc-900/60 transition-colors group">
                                                <td className="py-3 pl-6">
                                                    <CarrierImage domain={c.domain} alt={displayName} className="w-10 h-10 shrink-0" apiKey={config.brandfetchApiKey} fill />
                                                </td>
                                                <td className="py-3 px-4 align-middle font-sans">
                                                    <span className="font-extrabold text-zinc-800 dark:text-white text-sm block">{displayName}</span>
                                                </td>
                                                <td className="py-3 px-4 align-middle font-mono">
                                                    <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900/30 font-extrabold uppercase shrink-0">
                                                        {c.code}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 align-middle font-mono">
                                                    <a 
                                                        href={`https://${c.domain}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-zinc-500 hover:text-blue-500 hover:underline dark:text-zinc-400 transition-colors inline-flex items-center gap-1.5"
                                                    >
                                                        {c.domain}
                                                        <span className="material-icons-outlined text-xs">launch</span>
                                                    </a>
                                                </td>
                                                <td className="py-3 pr-6 align-middle text-right">
                                                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button 
                                                            onClick={() => handleEditClick(c)}
                                                            className="w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center border border-gray-150 text-gray-500 hover:text-blue-500 transition-colors dark:bg-zinc-800 dark:hover:bg-zinc-750 dark:border-white/5 cursor-pointer"
                                                            title="Edit Carrier"
                                                        >
                                                            <span className="material-icons-outlined text-sm">edit</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteCarrier(c.id)}
                                                            className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 flex items-center justify-center border border-rose-100 text-rose-500 hover:text-rose-650 transition-colors dark:bg-rose-950/20 dark:hover:bg-rose-900/30 dark:border-rose-900/30 cursor-pointer"
                                                            title="Delete Carrier"
                                                        >
                                                            <span className="material-icons-outlined text-sm">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )})}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};
