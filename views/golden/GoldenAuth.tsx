import React, { useState, useEffect } from 'react';
import { isFeatureEnabled } from '../../config/featureFlags';
import { RocketLaunch } from '@/components/ui/hugeicons';
import { dataService } from '../../services/mockDb';
import { User, Trip, VisitedItem } from '../../types';
import { GhButton } from '../../components/golden/Gh';
import { GhField } from '../../components/golden/GhField';
import { SunsetScene } from '../../components/golden/SunsetScene';

interface GoldenAuthProps {
    onLogin: (user: User) => void;
}

/** Golden Hour sign-in / setup screen. Data handling is copied from views/Auth.tsx. */
export const GoldenAuth: React.FC<GoldenAuthProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'signin' | 'signup' | 'setup_admin' | 'reset'>('signin');
    const [info, setInfo] = useState('');
    const [allowSignUp, setAllowSignUp] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        resetCode: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        dataService.getSetupStatus()
            .then(status => {
                setAllowSignUp(status.allowSelfRegistration);
                setMode(status.needsSetup ? 'setup_admin' : 'signin');
            })
            .catch(err => {
                console.error("Error checking system users roster:", err);
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

        setInfo('');
        try {
            if (mode === 'reset') {
                if (formData.password !== formData.confirmPassword) {
                    throw new Error("Passwords do not match");
                }
                if (formData.password.length < 8) {
                    throw new Error("Password must be at least 8 characters");
                }
                await dataService.resetPassword(formData.email, formData.resetCode, formData.password);
                setMode('signin');
                setFormData({ ...formData, password: '', confirmPassword: '', resetCode: '' });
                setInfo('Password updated. Sign in with your new password.');
            } else if (mode === 'signin') {
                const user = await dataService.login(formData.email, formData.password);
                if (user) {
                    onLogin(user);
                } else {
                    setError('Invalid credentials: the email or password is incorrect.');
                }
            } else if (mode === 'signup') {
                if (formData.password !== formData.confirmPassword) {
                    throw new Error("Passwords do not match");
                }
                if (formData.password.length < 8) {
                    throw new Error("Password must be at least 8 characters");
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
                if (formData.password.length < 8) {
                    throw new Error("Password must be at least 8 characters");
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
            const serverDemoUser = await dataService.demoLogin();
            if (serverDemoUser) {
                onLogin(serverDemoUser);
                return;
            }
            // Dev localStorage mode (no server): seed the demo locally.
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
                    user = await dataService.login(targetUser.email || '', targetUser.password || 'password');
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
                        { id: 'country_US', type: 'country', code: 'US', name: 'United States', residenceStatus: 'lived_current' },
                        { id: 'country_FR', type: 'country', code: 'FR', name: 'France', residenceStatus: 'visited' },
                        { id: 'country_NL', type: 'country', code: 'NL', name: 'Netherlands', residenceStatus: 'visited' },
                        { id: 'country_JP', type: 'country', code: 'JP', name: 'Japan', residenceStatus: 'visited' },
                        { id: 'country_GB-ENG', type: 'country', code: 'GB-ENG', name: 'England', residenceStatus: 'lived_past' }
                    ];
                    for (const v of sampleVisited) {
                        await dataService.addVisited(v);
                    }
                }
                onLogin(user);
            } else {
                setError('Could not start the demo. Please try again.');
            }
        } catch (e: any) {
            setError(e?.message || 'The demo is not available right now.');
        } finally {
            setIsLoading(false);
        }
    };

    const title = mode === 'setup_admin' ? "Let's set up camp" : mode === 'signin' ? 'Where next?' : mode === 'reset' ? 'Fresh start' : 'Join the trip';
    const subtitle = mode === 'setup_admin' ? 'Create the first admin account.' : mode === 'signin' ? 'Welcome back, traveller.' : mode === 'reset' ? 'Enter your reset code and a new password.' : 'Make your account and start planning.';
    const submitLabel = mode === 'setup_admin' ? 'Create admin account' : mode === 'reset' ? 'Set new password' : mode === 'signin' ? "Let's go" : 'Create account';
    const linkCls = 'font-bold text-sunset-coral hover:underline cursor-pointer min-h-[44px] px-2 inline-flex items-center';

    return (
        <main className="min-h-screen bg-sunset-cream dark:bg-sunset-night text-sunset-ink dark:text-white flex flex-col md:flex-row">
            <section className="relative h-56 md:h-auto md:flex-1 overflow-hidden">
                <SunsetScene className="absolute inset-0" />
                <div className="absolute left-5 top-5 md:left-10 md:top-10 flex items-center gap-3">
                    <img src="/app-icon-192.png" alt="WanderGrid" className="w-12 h-12 rounded-2xl object-contain" />
                    <span className="text-xl font-black tracking-tight text-sunset-ink dark:text-white">WanderGrid</span>
                </div>
                <p className="hidden md:block absolute left-10 bottom-10 text-5xl lg:text-6xl font-black tracking-tight text-sunset-ink max-w-sm leading-none">Plan it. Fly it. Remember it.</p>
            </section>

            <section className="flex-1 flex items-center justify-center p-5 sm:p-8 -mt-8 md:mt-0">
                <div className="w-full max-w-md rounded-3xl bg-white dark:bg-sunset-plum shadow-card p-6 sm:p-8">
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight">{title}</h1>
                    <p className="text-sm font-medium opacity-70 mt-1 mb-6">{subtitle}</p>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        {mode !== 'signin' && mode !== 'reset' && (
                            <GhField name="name" label="Your name" placeholder={mode === 'setup_admin' ? 'Admin Administrator' : 'Jane Doe'} value={formData.name} onChange={handleInput} required />
                        )}
                        <GhField name="email" label="Email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleInput} required />
                        {mode === 'reset' && (
                            <GhField name="resetCode" label="Reset code" placeholder="XXXXX-XXXXX" value={formData.resetCode} onChange={handleInput} autoComplete="one-time-code" required />
                        )}
                        <GhField name="password" label={mode === 'reset' ? 'New password' : 'Password'} type="password" placeholder="••••••••" value={formData.password} onChange={handleInput} required />
                        {mode === 'signin' && isFeatureEnabled('AUDIT_PASSWORD_RESET') && (
                            <div className="flex justify-end -mt-2">
                                <button type="button" onClick={() => { setMode('reset'); setError(''); setInfo(''); }} className={`${linkCls} text-xs`}>Forgot password?</button>
                            </div>
                        )}
                        {mode !== 'signin' && (
                            <GhField name="confirmPassword" label="Confirm password" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={handleInput} required />
                        )}

                        {info && <div role="status" className="rounded-2xl bg-sunset-teal text-sunset-ink text-sm font-semibold text-center p-3">{info}</div>}
                        {error && <div role="alert" className="rounded-2xl bg-sunset-coral text-white text-sm font-semibold text-center p-3">{error}</div>}

                        <GhButton type="submit" className={`w-full min-h-[52px] text-base ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                            {isLoading ? 'One moment…' : submitLabel}
                        </GhButton>
                    </form>

                    {mode === 'reset' && (
                        <div className="text-center mt-3">
                            <button type="button" onClick={() => { setMode('signin'); setError(''); }} className={`${linkCls} text-sm`}>Back to sign in</button>
                        </div>
                    )}

                    {mode !== 'reset' && (mode === 'setup_admin' || allowSignUp) && (
                        <GhButton variant="soft" onClick={handleDemoLogin} icon={<RocketLaunch className="w-4 h-4" />} label="Auto-Setup & Demo Run" className="w-full mt-4">
                            Auto-Setup & Demo Run
                        </GhButton>
                    )}

                    {mode !== 'setup_admin' && mode !== 'reset' && (allowSignUp || mode === 'signup') && (
                        <p className="text-sm text-center mt-4 opacity-90">
                            {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
                            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} className={linkCls}>
                                {mode === 'signin' ? 'Create an account' : 'Sign in'}
                            </button>
                        </p>
                    )}
                </div>
            </section>
        </main>
    );
};
