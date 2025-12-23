
import React, { useState } from 'react';
import { Card, Button, Input } from '../components/ui';
import { dataService } from '../services/mockDb';
import { User } from '../types';

interface AuthProps {
    onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

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
                    setError('Invalid credentials. Try admin@wandergrid.app / password');
                }
            } else {
                if (formData.password !== formData.confirmPassword) {
                    throw new Error("Passwords do not match");
                }
                const user = await dataService.register(formData.name, formData.email, formData.password);
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
            // Try default admin credentials first
            let user = await dataService.login('admin@wandergrid.app', 'password');
            
            // If not found (e.g. data cleared or user deleted), get the first available user
            if (!user) {
                const allUsers = await dataService.getUsers();
                if (allUsers.length > 0) {
                    user = allUsers[0];
                } else {
                    // Create a fresh demo user if database is completely empty
                    user = await dataService.register('Demo User', 'demo@wandergrid.app', 'demo');
                }
            }
            
            if (user) {
                onLogin(user);
            } else {
                setError('Failed to initialize demo session');
            }
        } catch (e) {
            setError('Demo mode unavailable');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements inherited from App body, but we add some floating elements */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>

            <Card className="w-full max-w-md z-10 !bg-white/80 dark:!bg-gray-900/80 backdrop-blur-3xl shadow-2xl border border-white/50 dark:border-white/10" noPadding>
                <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 mb-6">
                        <span className="text-3xl font-bold text-white">W</span>
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-2">
                        {mode === 'signin' ? 'Welcome Back' : 'Join WanderGrid'}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                        {mode === 'signin' ? 'Enter your coordinates to continue.' : 'Start your journey with a new account.'}
                    </p>
                </div>

                <div className="px-8 pb-8 space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {mode === 'signup' && (
                            <div className="animate-fade-in">
                                <Input 
                                    name="name"
                                    label="Full Name" 
                                    placeholder="John Doe" 
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
                            placeholder="you@example.com" 
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

                        {mode === 'signup' && (
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
                                className="w-full py-4 text-sm shadow-xl shadow-blue-500/20" 
                                isLoading={isLoading}
                                type="submit"
                            >
                                {mode === 'signin' ? 'Sign In' : 'Create Account'}
                            </Button>
                        </div>
                    </form>

                    {/* Demo Button & Divider */}
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
                        Enter Demo Mode
                    </Button>

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
                </div>
            </Card>
            
            <div className="absolute bottom-6 text-center w-full">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] opacity-50">WanderGrid Systems v2.1</p>
            </div>
        </div>
    );
};
