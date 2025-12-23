

import React, { useEffect, useState, useMemo } from 'react';
import { Button, Badge } from '../components/ui';
import { TripModal } from '../components/TripModal';
import { dataService } from '../services/mockDb';
import { Trip, User, WorkspaceSettings } from '../types';

interface VacationPlannerProps {
    onTripClick?: (tripId: string) => void;
}

export const VacationPlanner: React.FC<VacationPlannerProps> = ({ onTripClick }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [activeTab, setActiveTab] = useState<'Planned' | 'Confirmed'>('Planned');
    
    const [isCreateTripOpen, setIsCreateTripOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = () => {
        Promise.all([
            dataService.getTrips(), 
            dataService.getUsers(),
            dataService.getWorkspaceSettings()
        ]).then(([t, u, s]) => {
            setTrips(t.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()));
            setUsers(u);
            setSettings(s);
        });
    };

    const handleUpdateStatus = async (trip: Trip, newStatus: 'Planning' | 'Upcoming') => {
        await dataService.updateTrip({ ...trip, status: newStatus });
        refreshData();
    };

    // --- Trip Handlers ---
    const handleSaveTrip = async (tripData: Trip) => {
        if (tripData.id && trips.some(t => t.id === tripData.id)) {
            await dataService.updateTrip(tripData);
        } else {
            await dataService.addTrip(tripData);
        }
        refreshData();
        setEditingTrip(null);
    };

    const handleDeleteTrip = async (tripId: string) => {
        await dataService.deleteTrip(tripId);
        refreshData();
        setEditingTrip(null);
    };

    const handleEditTrip = (trip: Trip) => {
        setEditingTrip(trip);
        setIsCreateTripOpen(true);
    };

    const formatCurrency = (amount: number) => {
        if (!settings) return `$${amount}`;
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: settings.currency }).format(amount);
        } catch (e) {
            return `${settings.currency} ${amount}`;
        }
    };

    const filteredTrips = trips.filter(t => {
        if (activeTab === 'Planned') return t.status === 'Planning';
        return t.status === 'Upcoming' || t.status === 'Past';
    });

    return (
        <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12">
            
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/40 dark:bg-gray-900/40 p-6 rounded-[2rem] backdrop-blur-xl border border-white/50 dark:border-white/5 shadow-xl">
                <div>
                    <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">Vacation Planner</h2>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Logistics, flights, and itineraries.</p>
                </div>
                <Button 
                    variant="primary" 
                    size="lg" 
                    icon={<span className="material-icons-outlined">add_location_alt</span>} 
                    onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                >
                    Create Trip
                </Button>
            </header>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-white/10">
                <button 
                    onClick={() => setActiveTab('Planned')}
                    className={`px-8 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'Planned' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    Planned
                </button>
                <button 
                    onClick={() => setActiveTab('Confirmed')}
                    className={`px-8 py-3 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'Confirmed' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    Confirmed
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {filteredTrips.map(trip => {
                    const days = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    const transportCount = trip.transports?.length || 0;
                    const accommodationCount = trip.accommodations?.length || 0;
                    
                    const transportCost = trip.transports?.reduce((sum, f) => sum + (f.cost || 0), 0) || 0;
                    const stayCost = trip.accommodations?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
                    const totalCost = transportCost + stayCost;

                    return (
                        <div key={trip.id} className="group relative bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-white/5 shadow-lg overflow-hidden flex flex-col hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                             {/* Card Action Overlay */}
                             <div 
                                className="absolute inset-0 z-0 cursor-pointer" 
                                onClick={() => onTripClick ? onTripClick(trip.id) : handleEditTrip(trip)}
                             />

                             <div className="p-8 pb-6 flex justify-between items-start relative z-10 pointer-events-none">
                                 <div className="flex items-center gap-4">
                                     <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/5 text-4xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                                         {trip.icon || '✈️'}
                                     </div>
                                     <div>
                                         <h3 className="text-xl font-black text-gray-900 dark:text-white leading-tight group-hover:text-blue-500 transition-colors line-clamp-1">{trip.name}</h3>
                                         <div className="text-xs font-bold text-gray-400 mt-2 flex items-center gap-1">
                                             <span className="material-icons-outlined text-xs">location_on</span>
                                             {trip.location || 'Remote'}
                                         </div>
                                     </div>
                                 </div>
                                 <div className="pointer-events-auto">
                                     <button onClick={() => handleEditTrip(trip)} className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all">
                                         <span className="material-icons-outlined text-lg">edit</span>
                                     </button>
                                 </div>
                             </div>

                             <div className="px-8 pb-4 relative z-10 pointer-events-none">
                                <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-gray-100 dark:border-white/5">
                                    <span className="material-icons-outlined text-sm">calendar_today</span>
                                    <span>{new Date(trip.startDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} - {new Date(trip.endDate).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span>
                                    <span className="w-1 h-1 rounded-full bg-gray-300 mx-1"/>
                                    <span>{days} Days</span>
                                </div>
                             </div>

                             <div className="mt-auto bg-gray-50/50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 p-6 relative z-10">
                                 <div className="flex justify-between items-center mb-4">
                                     <div className="flex gap-4">
                                         <div className="flex flex-col">
                                             <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Transport</span>
                                             <span className="text-lg font-black text-gray-800 dark:text-white">{transportCount}</span>
                                         </div>
                                         <div className="flex flex-col">
                                             <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Stays</span>
                                             <span className="text-lg font-black text-gray-800 dark:text-white">{accommodationCount}</span>
                                         </div>
                                     </div>
                                     <div className="text-right">
                                         <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Est. Cost</span>
                                         <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCost)}</div>
                                     </div>
                                 </div>

                                 <div className="flex gap-2 pointer-events-auto">
                                     {activeTab === 'Planned' ? (
                                         <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(trip, 'Upcoming')} className="flex-1 !text-emerald-600 hover:!bg-emerald-50 border-emerald-100 dark:border-emerald-900/30 dark:bg-emerald-900/10" icon={<span className="material-icons-outlined text-sm">check_circle</span>}>
                                             Confirm
                                         </Button>
                                     ) : (
                                        <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(trip, 'Planning')} className="flex-1 !text-amber-600 hover:!bg-amber-50 border-amber-100 dark:border-amber-900/30 dark:bg-amber-900/10" icon={<span className="material-icons-outlined text-sm">undo</span>}>
                                             Revert
                                        </Button>
                                     )}
                                     {onTripClick && (
                                        <Button size="sm" variant="primary" onClick={() => onTripClick(trip.id)} className="flex-1 shadow-none" icon={<span className="material-icons-outlined text-sm">visibility</span>}>
                                             Details
                                        </Button>
                                     )}
                                 </div>
                             </div>
                        </div>
                    );
                })}
                
                {/* Add New Card Stub */}
                <button 
                    onClick={() => { setEditingTrip(null); setIsCreateTripOpen(true); }}
                    className="group min-h-[300px] rounded-[2.5rem] border-2 border-dashed border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 flex flex-col items-center justify-center gap-4 transition-all duration-300"
                >
                    <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-white/5 text-gray-300 dark:text-gray-600 group-hover:bg-blue-500 group-hover:text-white flex items-center justify-center transition-all duration-300 shadow-sm group-hover:shadow-blue-500/30 group-hover:scale-110">
                        <span className="material-icons-outlined text-4xl">add</span>
                    </div>
                    <span className="font-bold text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 uppercase tracking-widest text-xs">Plan New Adventure</span>
                </button>
            </div>
            
            {/* Create Trip Modal */}
            <TripModal 
                isOpen={isCreateTripOpen} 
                onClose={() => setIsCreateTripOpen(false)} 
                onSubmit={handleSaveTrip}
                onDelete={handleDeleteTrip}
                users={users}
                initialData={editingTrip}
            />
        </div>
    );
};