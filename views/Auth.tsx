import React, { useState, useEffect } from 'react';
import { Button, Input } from '../components/ui';
import GlassPanel from '../components/glass/GlassPanel';
import { RocketLaunch } from '@phosphor-icons/react';
import { dataService } from '../services/mockDb';
import { User, Trip, VisitedItem } from '../types';

interface AuthProps {
    onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'signin' | 'signup' | 'setup_admin'>('signin');
    const [isCheckingSetup, setIsCheckingSetup] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        dataService.getUsers()
            .then(users => {
                if (users.length === 0) {
                    setMode('setup_admin');
                } else {
                    setMode('signin');
                }
            })
            .catch(err => {
                console.error("Error checking system users roster:", err);
            })
            .finally(() => {
                setIsCheckingSetup(false);
            });
    }, []);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            if (mode === 'signin') {
                const user = await dataService.login(formData.email, formData.password);
                if (user) {
                    onLogin(user);
                } else {
                    setError('Invalid credentials. Please verify design coordinates.');
                }
            } else if (mode === 'signup') {
                if (formData.password !== formData.confirmPassword) {
                    throw new Error("Passwords do not match");
                }
                const user = await dataService.register(formData.name, formData.email, formData.password);
                onLogin(user);
            } else if (mode === 'setup_admin') {
                if (formData.password !== formData.confirmPassword) {
                    throw new Error("Passwords do not match");
                }
                if (!formData.name || !formData.email || !formData.password) {
                    throw new Error("All fields are required for initial administrator configuration");
                }
                // Automatically assign 'Admin' role as the first system administrator
                const user = await dataService.register(formData.name, formData.email, formData.password, 'Admin');
                onLogin(user);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDemoLogin = async () => {
        setIsLoading(true);
        setError('');
        try {
            const allUsers = await dataService.getUsers();
            let user: User | null = null;
            
            if (allUsers.length === 0) {
                // Create an Admin user as initial enrollment on blank slate
                user = await dataService.register('Admin User', 'admin@wandergrid.app', 'password', 'Admin');
            } else {
                // Prefer admin user from existing/restored users
                const targetUser = allUsers.find(u => u.email === 'admin@wandergrid.app')
                    || allUsers.find(u => u.role === 'Admin')
                    || allUsers[0];
                try {
                    user = await dataService.login(targetUser.email, targetUser.password || 'password');
                } catch {
                    user = targetUser;
                }
                if (!user) {
                    user = targetUser;
                }
            }
            
            if (user) {
                // If the database has zero trips, seed an initial illustrative expedition dataset so routes, scratch map, and 3D globe are populated
                const existingTrips = await dataService.getTrips();
                if (existingTrips.length === 0) {
                    const sampleTrips: Trip[] = [
                        {
                            id: 'trip-demo-euro-asia',
                            name: 'Grand Intercontinental Expedition',
                            location: 'Paris, France',
                            startDate: '2025-06-01',
                            endDate: '2025-06-25',
                            status: 'Upcoming',
                            privacy: 'Public',
                            participants: [user.id || 'admin-1'],
                            transports: [
                                {
                                    id: 'tr-demo-1',
                                    itineraryId: 'itin-demo-1',
                                    type: 'One-Way',
                                    mode: 'Flight',
                                    provider: 'Air France',
                                    identifier: 'AF007',
                                    confirmationCode: 'AF7XYZ',
                                    origin: 'JFK',
                                    destination: 'CDG',
                                    originLat: 40.6413,
                                    originLng: -73.7781,
                                    destLat: 49.0097,
                                    destLng: 2.5479,
                                    departureDate: '2025-06-01',
                                    departureTime: '18:30',
                                    arrivalDate: '2025-06-02',
                                    arrivalTime: '08:00',
                                    travelClass: 'Business'
                                },
                                {
                                    id: 'tr-demo-2',
                                    itineraryId: 'itin-demo-2',
                                    type: 'One-Way',
                                    mode: 'Train',
                                    provider: 'Eurostar',
                                    identifier: 'ES9310',
                                    confirmationCode: 'EST931',
                                    origin: 'Paris',
                                    destination: 'Amsterdam',
                                    originLat: 48.8566,
                                    originLng: 2.3522,
                                    destLat: 52.3676,
                                    destLng: 4.9041,
                                    departureDate: '2025-06-06',
                                    departureTime: '10:20',
                                    arrivalDate: '2025-06-06',
                                    arrivalTime: '13:45',
                                    travelClass: 'First'
                                },
                                {
                                    id: 'tr-demo-3',
                                    itineraryId: 'itin-demo-3',
                                    type: 'One-Way',
                                    mode: 'Flight',
                                    provider: 'KLM',
                                    identifier: 'KL861',
                                    confirmationCode: 'KLM861',
                                    origin: 'AMS',
                                    destination: 'NRT',
                                    originLat: 52.3105,
                                    originLng: 4.7683,
                                    destLat: 35.7720,
                                    destLng: 140.3929,
                                    departureDate: '2025-06-12',
                                    departureTime: '14:40',
                                    arrivalDate: '2025-06-13',
                                    arrivalTime: '08:50',
                                    travelClass: 'Economy'
                                }
                            ]
                        }
                    ];
                    for (const trip of sampleTrips) {
                        await dataService.addTrip(trip);
                    }
                    const sampleVisited: VisitedItem[] = [
                        { id: 'v-demo-1', type: 'country', code: 'US', name: 'United States', residenceStatus: 'lived_current' },
                        { id: 'v-demo-2', type: 'country', code: 'FR', name: 'France', residenceStatus: 'visited' },
                        { id: 'v-demo-3', type: 'country', code: 'NL', name: 'Netherlands', residenceStatus: 'visited' },
                        { id: 'v-demo-4', type: 'country', code: 'JP', name: 'Japan', residenceStatus: 'visited' },
                        { id: 'v-demo-5', type: 'country', code: 'GB', name: 'United Kingdom', residenceStatus: 'lived_past' }
                    ];
                    for (const v of sampleVisited) {
                        await dataService.addVisited(v);
                    }
                }
                onLogin(user);
            } else {
                setError('Failed to initialize demo session');
            }
        } catch (e) {
            setError('Demo mode unavailable at this moment');
        } finally {
            setIsLoading(false);
        }
    };

    if (isCheckingSetup) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6 bg-light-bg dark:bg-dark-bg">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-light-text-secondary dark:text-dark-text-secondary">Checking Security Database...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/3 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/3 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>

            <GlassPanel className="w-full max-w-md z-10 wg-glass-card rounded-[28px] overflow-hidden shadow-2xl">
                <div className="p-8 text-center">
                    <img 
                        src="/app-icon.png" 
                        alt="WanderGrid" 
                        className="w-16 h-16 mx-auto rounded-2xl shadow-lg mb-6 object-contain" 
                    />
                    <h2 className="text-2xl font-black text-light-text dark:text-dark-text tracking-tight mb-2">
                        {mode === 'setup_admin' ? 'Initial System Setup' : mode === 'signin' ? 'Welcome Back' : 'Join WanderGrid'}
                    </h2>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">
                        {mode === 'setup_admin' 
                            ? 'Configure the primary Administrator account.' 
                            : mode === 'signin' 
                                ? 'Enter your credentials to manage coordinates.' 
                                : 'Start your journey with a new partner profile.'}
                    </p>
                </div>

                <div className="px-8 pb-8 space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {mode !== 'signin' && (
                            <div className="animate-fade-in">
                                <Input 
                                    name="name"
                                    label="Full Name" 
                                    placeholder={mode === 'setup_admin' ? 'Admin Administrator' : 'John Doe'} 
                                    value={formData.name}
                                    onChange={handleInput}
                                    required
                                />
                            </div>
                        )}
                        
                        <Input 
                            name="email"
                            label="Email Address" 
                            type="email"
                            placeholder={mode === 'setup_admin' ? 'admin@wandergrid.app' : 'you@example.com'} 
                            value={formData.email}
                            onChange={handleInput}
                            required
                        />
                        
                        <Input 
                            name="password"
                            label="Password" 
                            type="password"
                            placeholder="••••••••" 
                            value={formData.password}
                            onChange={handleInput}
                            required
                        />

                        {mode !== 'signin' && (
                            <div className="animate-fade-in">
                                <Input 
                                    name="confirmPassword"
                                    label="Confirm Password" 
                                    type="password"
                                    placeholder="••••••••" 
                                    value={formData.confirmPassword}
                                    onChange={handleInput}
                                    required
                                />
                            </div>
                        )}

                        {error && (
                            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold text-center animate-shake">
                                {error}
                            </div>
                        )}

                        <div className="pt-2">
                            <Button 
                                variant="primary" 
                                className="w-full py-4 text-sm shadow-xl shadow-blue-500/20 bg-gradient-to-r from-blue-600 to-indigo-600 font-bold" 
                                isLoading={isLoading}
                                type="submit"
                            >
                                {mode === 'setup_admin' 
                                    ? 'Provision Administrator Account' 
                                    : mode === 'signin' 
                                        ? 'Authorize Session' 
                                        : 'Enlist Profile'}
                            </Button>
                        </div>
                    </form>

                    {/* Show Demo Button */}
                    <div className="relative flex items-center gap-4 my-2">
                        <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                        <span className="text-2xs font-bold text-gray-400 uppercase tracking-widest">Or</span>
                        <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                    </div>

                    <Button 
                        variant="secondary" 
                        className="w-full py-3 text-xs uppercase tracking-widest font-black border-dashed border-2 min-h-[44px]" 
                        onClick={handleDemoLogin}
                        type="button"
                        icon={<RocketLaunch className="w-4 h-4" />}
                        aria-label="Auto-Setup & Demo Run"
                    >
                        Auto-Setup & Demo Run
                    </Button>

                    {mode !== 'setup_admin' && (
                        <div className="text-center mt-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
                                <button 
                                    type="button"
                                    onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
                                    className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                    {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                                </button>
                            </p>
                        </div>
                    )}
                </div>
            </GlassPanel>
            
            <div className="absolute bottom-6 text-center w-full">
                <p className="text-2xs font-bold text-gray-400 uppercase tracking-[0.2em] opacity-50">WanderGrid Systems v2.2</p>
            </div>
        </div>
    );
};
