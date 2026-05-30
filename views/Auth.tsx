import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '../components/ui';
import { dataService } from '../services/mockDb';
import { User } from '../types';

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
                // Attempt standard default login
                user = await dataService.login('admin@wandergrid.app', 'password');
                if (!user) {
                    user = allUsers[0];
                }
            }
            
            if (user) {
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
            <div className="flex min-h-screen items-center justify-center p-6 bg-slate-900">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Checking Security Database...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/3 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/3 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>

            <Card className="w-full max-w-md z-10 !bg-white/80 dark:!bg-gray-900/80 backdrop-blur-3xl shadow-2xl border border-white/50 dark:border-white/10" noPadding>
                <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-lg mb-6 text-3xl">
                        <span>🏔️</span>
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-2">
                        {mode === 'setup_admin' ? 'Initial System Setup' : mode === 'signin' ? 'Welcome Back' : 'Join WanderGrid'}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
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
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Or</span>
                        <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                    </div>

                    <Button 
                        variant="secondary" 
                        className="w-full py-3 text-xs uppercase tracking-widest font-black border-dashed border-2" 
                        onClick={handleDemoLogin}
                        type="button"
                        icon={<span className="material-icons-outlined text-sm">rocket_launch</span>}
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
                                    className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                                </button>
                            </p>
                        </div>
                    )}
                </div>
            </Card>
            
            <div className="absolute bottom-6 text-center w-full">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] opacity-50">WanderGrid Systems v2.2</p>
            </div>
        </div>
    );
};
