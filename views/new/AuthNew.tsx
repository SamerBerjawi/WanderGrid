import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { isFeatureEnabled } from '../../config/featureFlags';
import { dataService } from '../../services/mockDb';
import { startDemo } from '../../services/authDemo';
import type { User as AppUser } from '../../types';
import { cn } from '../../utils/cn';
import '../../components/new/new.css';
import ParticleButton, { type ParticleButtonStatus } from '../../components/kokonutui/particle-button';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import SwitchButton from '../../components/kokonutui/switch-button';
import { RpField, RP_FIELD } from '../../components/new/fields';
import { RpIconButton } from '../../components/new/ui';
import {
    ArrowLeft, CheckCircle, Envelope, Eye, EyeSlash, Key, Lock, RocketLaunch, SignIn, User, UserAdd, WarningCircle, X,
    type Icon,
} from '../../components/ui/hugeicons';

/**
 * AuthNew: sign in, register, first-run administrator setup, password reset and the demo run
 * (UI_UX_DESIGN_REFERENCE.md §5.2 row 13). Same data calls as Auth.tsx, through `dataService`.
 */

type Mode = 'signin' | 'signup' | 'setup_admin' | 'reset';
type Fields = { name: string; email: string; password: string; confirmPassword: string; resetCode: string };

interface AuthNewProps {
    onLogin: (user: AppUser) => void;
    isDark: boolean;
    onThemeChange: (theme: 'light' | 'dark') => void;
    /** Signed in and looking at the page: nothing is sent and nobody is signed out. */
    preview?: boolean;
    onClosePreview?: () => void;
}

const COPY: Record<Mode, { title: string; hint: string; submit: string; pending: string; done: string }> = {
    signin: { title: 'Welcome back', hint: 'Sign in with your email and password.', submit: 'Sign in', pending: 'Signing in', done: 'Welcome' },
    signup: { title: 'Create account', hint: 'Start planning your trips.', submit: 'Create account', pending: 'Creating', done: 'Welcome' },
    setup_admin: { title: 'Set up WanderGrid', hint: 'This account will be the administrator.', submit: 'Create administrator', pending: 'Creating', done: 'Welcome' },
    reset: { title: 'Reset password', hint: 'Ask an administrator for a reset code in Settings, then choose a new password.', submit: 'Set new password', pending: 'Saving', done: 'Saved' },
};

const PASSWORD_MIN = 8;
const LEAVE_MS = 700;

const LinkButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, ...rest }) => (
    <button
        type="button"
        className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-rp-ink outline-none transition-colors hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted',
            className
        )}
        {...rest}
    />
);

const AuthInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { icon: Icon; id: string; trailing?: React.ReactNode }> = ({ icon: IconC, id, trailing, className, ...rest }) => (
    <div className="relative">
        <IconC size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-rp-muted" />
        <input id={id} className={cn(RP_FIELD, 'rounded-full bg-rp-inset pl-10', trailing ? 'pr-12' : 'pr-4', className)} {...rest} />
        {trailing ? <div className="absolute top-1/2 right-0 -translate-y-1/2">{trailing}</div> : null}
    </div>
);

export const AuthNew: React.FC<AuthNewProps> = ({ onLogin, isDark, onThemeChange, preview = false, onClosePreview }) => {
    const reduced = useReducedMotion();
    const [mode, setMode] = useState<Mode>('signin');
    const [allowSignUp, setAllowSignUp] = useState(true);
    const [form, setForm] = useState<Fields>({ name: '', email: '', password: '', confirmPassword: '', resetCode: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [status, setStatus] = useState<ParticleButtonStatus>('idle');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
    useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

    // The form shows at once; if the server reports an empty workspace it becomes the administrator setup (PERF-001).
    useEffect(() => {
        let alive = true;
        dataService.getSetupStatus()
            .then(s => {
                if (!alive) return;
                setAllowSignUp(s.allowSelfRegistration);
                if (s.needsSetup) setMode('setup_admin');
                else if (!s.allowSelfRegistration) setMode(m => (m === 'signup' ? 'signin' : m));
            })
            .catch(err => console.error('Error checking system users roster:', err));
        return () => { alive = false; };
    }, []);

    const copy = COPY[mode];
    const busy = status === 'pending' || status === 'success';
    const isRegistering = mode === 'signup' || mode === 'setup_admin';
    const confirms = mode !== 'signin';
    const canSwitch = allowSignUp && (mode === 'signin' || mode === 'signup');
    const showDemo = mode !== 'reset' && (mode === 'setup_admin' || allowSignUp);

    const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(f => ({ ...f, [key]: e.target.value }));
        setError('');
    };
    const goTo = (next: Mode) => { setMode(next); setError(''); setInfo(''); setStatus('idle'); };

    const fail = (message: string) => {
        setError(message);
        setStatus('error');
        later(() => setStatus('idle'), 3200);
    };

    const enter = (user: AppUser) => {
        setStatus('success');
        later(() => onLogin(user), reduced ? 0 : LEAVE_MS);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setError('');
        setInfo('');
        if (preview) {
            setStatus('success');
            setInfo('Preview only. Nothing was sent.');
            later(() => setStatus('idle'), 1600);
            return;
        }
        setStatus('pending');
        try {
            if (confirms) {
                if (form.password !== form.confirmPassword) throw new Error('Passwords do not match');
                if (form.password.length < PASSWORD_MIN) throw new Error(`Password must be at least ${PASSWORD_MIN} characters`);
            }
            if (mode === 'reset') {
                await dataService.resetPassword(form.email, form.resetCode, form.password);
                setForm(f => ({ ...f, password: '', confirmPassword: '', resetCode: '' }));
                setStatus('success');
                later(() => { goTo('signin'); setInfo('Password updated. Sign in with your new password.'); }, reduced ? 0 : 900);
            } else if (mode === 'signin') {
                const user = await dataService.login(form.email, form.password);
                if (user) enter(user);
                else fail('The email or password is incorrect.');
            } else {
                if (!form.name.trim() || !form.email.trim()) throw new Error('Name and email are required');
                enter(await dataService.register(form.name, form.email, form.password, mode === 'setup_admin' ? 'Admin' : 'Partner'));
            }
        } catch (err) {
            fail(err instanceof Error ? err.message : 'Authentication failed');
        }
    };

    const demoUser = useRef<AppUser | null>(null);
    const handleDemo = async () => {
        setError('');
        setInfo('');
        if (preview) { setInfo('Preview only. Nothing was sent.'); return; }
        demoUser.current = await startDemo();
    };

    const tabs = [
        { id: 'signin', title: 'Sign in', icon: SignIn },
        { id: 'signup', title: 'Register', icon: UserAdd },
    ];

    return (
        <MotionConfig reducedMotion="user">
            <div className="rp-root rp-canvas-glow fixed inset-0 overflow-y-auto bg-rp-canvas font-rp text-rp-ink antialiased">
                <div className="mx-auto flex min-h-full w-full max-w-[1680px] flex-col px-1 pb-[calc(16px+env(safe-area-inset-bottom,0px))] sm:px-4">
                    <header className="flex items-center justify-between gap-3 px-2 pt-[calc(12px+env(safe-area-inset-top,0px))] sm:px-0">
                        <div className="flex min-h-11 items-center gap-2.5 rounded-full bg-rp-surface py-1.5 pr-4 pl-1.5 rp-shadow-soft">
                            <span className="flex size-8 items-center justify-center rounded-[10px] bg-rp-ink text-sm font-semibold text-rp-on-ink">W</span>
                            <span className="text-base font-medium">WanderGrid</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {preview ? (
                                <>
                                    <span className="inline-flex min-h-8 items-center rounded-full bg-rp-mustard px-3 text-xs font-medium text-rp-on-mustard" role="status">Preview</span>
                                    {onClosePreview ? (
                                        <RpIconButton label="Close preview" className="rp-shadow-soft" onClick={onClosePreview}><X size={18} /></RpIconButton>
                                    ) : null}
                                </>
                            ) : null}
                            <SwitchButton showLabel={false} className="rp-shadow-soft" theme={isDark ? 'dark' : 'light'} onThemeChange={onThemeChange} />
                        </div>
                    </header>

                    <main className="flex flex-1 items-center justify-center py-6">
                        <motion.section
                            aria-labelledby="auth-title"
                            initial={reduced ? false : { opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                            className="w-full rounded-rp-card bg-rp-surface p-5 rp-shadow-rest sm:max-w-md sm:p-8"
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={mode}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                >
                                    <h1 id="auth-title" className="text-3xl leading-tight font-medium tracking-tight">{copy.title}</h1>
                                    <p className="mt-1.5 text-sm text-rp-muted">{copy.hint}</p>
                                </motion.div>
                            </AnimatePresence>

                            {canSwitch ? (
                                <div className="-m-3 mt-3 overflow-x-auto p-3 [scrollbar-width:none]">
                                    <SwipeTabs
                                        items={tabs}
                                        value={mode}
                                        onChange={id => goTo(id as Mode)}
                                        panels={false}
                                        stretch
                                        label="Account"
                                        listClassName="bg-rp-inset"
                                        activeColor="bg-rp-ink"
                                        activeTextColor="text-rp-on-ink"
                                    />
                                </div>
                            ) : null}

                            <form onSubmit={handleSubmit} noValidate={false} className="mt-3 flex flex-col">
                                {isRegistering ? (
                                    <RpField label="Full name">
                                        {id => <AuthInput id={id} icon={User} name="name" autoComplete="name" required value={form.name} onChange={set('name')} placeholder="Alex Morgan" />}
                                    </RpField>
                                ) : null}
                                <RpField label="Email">
                                    {id => <AuthInput id={id} icon={Envelope} name="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" />}
                                </RpField>
                                {mode === 'reset' ? (
                                    <RpField label="Reset code">
                                        {id => <AuthInput id={id} icon={Key} name="resetCode" autoComplete="one-time-code" required value={form.resetCode} onChange={set('resetCode')} placeholder="XXXXX-XXXXX" />}
                                    </RpField>
                                ) : null}
                                <RpField label={mode === 'reset' ? 'New password' : 'Password'}>
                                    {id => (
                                        <AuthInput
                                            id={id}
                                            icon={Lock}
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                            required
                                            minLength={confirms ? PASSWORD_MIN : undefined}
                                            value={form.password}
                                            onChange={set('password')}
                                            placeholder="••••••••"
                                            trailing={
                                                <RpIconButton
                                                    label={showPassword ? 'Hide password' : 'Show password'}
                                                    tone="ghost"
                                                    pressed={false}
                                                    onClick={() => setShowPassword(v => !v)}
                                                >
                                                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                                                </RpIconButton>
                                            }
                                        />
                                    )}
                                </RpField>
                                {confirms ? (
                                    <RpField label="Confirm password">
                                        {id => <AuthInput id={id} icon={Lock} name="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" />}
                                    </RpField>
                                ) : null}

                                {mode === 'signin' && isFeatureEnabled('AUDIT_PASSWORD_RESET') ? (
                                    <div className="flex justify-end">
                                        <LinkButton onClick={() => goTo('reset')}>Forgot password?</LinkButton>
                                    </div>
                                ) : null}

                                <div aria-live="polite" className="empty:hidden">
                                    {error ? (
                                        <p role="alert" className="mt-2 flex items-start gap-2 rounded-rp-inset bg-rp-inset px-3.5 py-2.5 text-sm text-rp-ink">
                                            <WarningCircle size={18} aria-hidden="true" className="mt-px shrink-0 text-rp-rust" />{error}
                                        </p>
                                    ) : null}
                                    {info ? (
                                        <p role="status" className="mt-2 flex items-start gap-2 rounded-rp-inset bg-rp-green px-3.5 py-2.5 text-sm text-rp-paper">
                                            <CheckCircle size={18} aria-hidden="true" className="mt-px shrink-0" />{info}
                                        </p>
                                    ) : null}
                                </div>

                                <ParticleButton
                                    type="submit"
                                    status={status}
                                    pendingLabel={copy.pending}
                                    successLabel={copy.done}
                                    errorLabel="Try again"
                                    className="mt-4 !w-full"
                                >
                                    {copy.submit}
                                </ParticleButton>
                            </form>

                            {mode === 'reset' ? (
                                <div className="mt-2 flex justify-center">
                                    <LinkButton onClick={() => goTo('signin')}><ArrowLeft size={16} aria-hidden="true" />Back to sign in</LinkButton>
                                </div>
                            ) : null}

                            {showDemo ? (
                                <>
                                    <div className="my-4 flex items-center gap-3" aria-hidden="true">
                                        <span className="h-px flex-1 bg-rp-line" />
                                        <span className="text-xs text-rp-muted">or</span>
                                        <span className="h-px flex-1 bg-rp-line" />
                                    </div>
                                    <ParticleButton
                                        variant="inset"
                                        className="!w-full"
                                        disabled={busy}
                                        pendingLabel="Starting demo"
                                        successLabel="Ready"
                                        errorLabel="Try again"
                                        icon={<RocketLaunch size={16} aria-hidden="true" />}
                                        onClick={handleDemo}
                                        onSuccess={() => { if (demoUser.current) enter(demoUser.current); }}
                                        onError={err => setError(err instanceof Error ? err.message : 'The demo is not available right now.')}
                                    >
                                        Auto-setup &amp; demo run
                                    </ParticleButton>
                                </>
                            ) : null}
                        </motion.section>
                    </main>
                </div>
            </div>
        </MotionConfig>
    );
};
