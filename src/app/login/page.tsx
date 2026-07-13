'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Lock, Mail, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import Toast, { type ToastMessage } from '../../components/Toast';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useAuth } from '../../components/AuthProvider';

const loginSchema = z.object({
  email: z.string().email('Invalid school email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('oauth_error');
  const toastParam = searchParams.get('toast');
  const { login } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  useEffect(() => {
    if (oauthError) {
      const messages: Record<string, string> = {
        access_denied: 'Google authentication was cancelled.',
        invalid_state: 'Google sign-in session expired. Please try again.',
        oauth_failed: 'Google sign-in failed. Please try again or use email/password.',
        no_account: 'No account found for that Google email. Please sign up first.',
      };
      setToast({
        id: 'oauth-err',
        type: 'error',
        text: messages[oauthError] || `Google sign-in error: ${oauthError}`,
      });
    }
  }, [oauthError]);

  useEffect(() => {
    if (toastParam === 'password-updated') {
      setToast({ id: 'password-updated', type: 'success', text: 'Password updated successfully. Please sign in.' });
    }
  }, [toastParam]);

  const handleCloseToast = () => {
    setToast(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('oauth_error')) {
        url.searchParams.delete('oauth_error');
        window.history.replaceState({}, '', url.pathname);
      }
    }
  };

  const emailValidation = loginSchema.shape.email.safeParse(email);
  const passwordValidation = loginSchema.shape.password.safeParse(password);
  const emailTouched = email.length > 0;
  const passwordTouched = password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setToast({ id: 'err', type: 'error', text: result.error.errors[0].message });
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      localStorage.setItem('user_role', data.role);
      localStorage.setItem('user_id', data.user_id);

      login({
        id: data.user_id,
        email: data.email,
        name: data.name,
        role: data.role,
        school_id: data.school_id,
      });

      setLoginSuccess(true);
      setToast({ id: 'success', type: 'success', text: 'Sign in successful! Redirecting...' });

      const roleRedirect =
        data.role === 'admin' ? '/dashboard/admin'
        : data.role === 'teacher' ? '/dashboard/teacher'
        : '/dashboard/student';

      setTimeout(() => {
        router.push(roleRedirect);
      }, 1000);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to sign in. Check your email/password.' });
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background selection:bg-primary selection:text-white">
      {/* Brand Panel (45% Width) */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-[#312E81] via-[#3730A3] to-[#4F46E5] relative overflow-hidden flex-col justify-between p-12 text-white border-r border-border/10">
        {/* Subtle grid texture overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="absolute inset-0 bg-radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_60%) pointer-events-none" />

        {/* Wordmark logo */}
        <Link href="/" className="flex items-center gap-3 relative z-10 hover:opacity-80 transition-opacity w-fit">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-md">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Concentrate</span>
        </Link>

        {/* Testimonial and bullets */}
        <div className="space-y-12 relative z-10 my-auto">
          <div className="space-y-4">
            <h2 className="text-3xl font-extrabold tracking-tight leading-tight max-w-md">
              The modern workspace for academic excellence.
            </h2>
            <p className="text-white/70 text-sm max-w-sm leading-relaxed">
              Experience the school portal redesigned from the ground up for speed, clarity, and visual delight.
            </p>
          </div>

          <div className="space-y-3.5 border-l border-white/15 pl-5">
            <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
              <span className="text-indigo-300">✦</span> Interactive Rubric Grading
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
              <span className="text-indigo-300">✦</span> Real-time Course Analytics
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
              <span className="text-indigo-300">✦</span> Student Progress Tracking
            </div>
          </div>
        </div>

        {/* Testimonial Quote */}
        <div className="relative z-10 border-t border-white/10 pt-6">
          <p className="italic text-sm text-white/80 max-w-md font-medium leading-relaxed">
            &ldquo;The most intuitive course portal we&rsquo;ve ever used. Grading feels like magic and student engagement is at an all-time high.&rdquo;
          </p>
          <p className="text-xs font-bold text-white/60 mt-2.5 uppercase tracking-widest">
            — Dean of Studies, Concentrate Academy
          </p>
        </div>
      </div>

      {/* Form Panel (55% Width) */}
      <div className="w-full lg:w-[55%] flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-[400px] space-y-8 animate-fadeIn">
          <div className="flex flex-col items-center lg:items-start">
            {/* Logo visible on mobile */}
            <div className="lg:hidden flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary border border-primary/20 shadow-sm mb-4">
              <GraduationCap className="h-7 w-7" />
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-text-secondary text-center lg:text-left">
              New to our platform?{' '}
              <Link 
                href="/register" 
                className="font-bold text-primary hover:text-primary-hover transition-colors focus:underline focus:outline-none"
              >
                Create an account
              </Link>
            </p>
          </div>

          {loginSuccess ? (
            <Card hover={false} className="p-8 text-center space-y-4 border border-success/20 bg-surface">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto animate-pulse-soft" />
              <h3 className="text-lg font-bold text-text-primary">Welcome Back!</h3>
              <p className="text-xs text-text-secondary">Loading your personalized dashboard portal...</p>
            </Card>
          ) : (
            <Card hover={false} className="p-6 sm:p-8 shadow-sm relative border border-border bg-surface">
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  label="School Email Address"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={emailTouched && !emailValidation.success ? 'Invalid school email address' : undefined}
                  success={emailTouched && emailValidation.success}
                  icon={<Mail className="h-4 w-4" />}
                  placeholder="name@school.edu"
                  className="h-11 py-3"
                />

                <div className="space-y-2 relative">
                  <Input
                    id="password"
                    name="password"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={passwordTouched && !passwordValidation.success ? 'Password must be at least 8 characters long' : undefined}
                    success={passwordTouched && passwordValidation.success}
                    icon={<Lock className="h-4 w-4" />}
                    placeholder="••••••••"
                    className="pr-12 h-11 py-3"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[38px] text-text-tertiary hover:text-text-secondary transition-colors p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between text-sm pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0 focus:outline-none transition-all"
                    />
                    <span className="text-xs font-semibold text-text-secondary">Keep me signed in</span>
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-bold text-primary hover:text-primary-hover transition-colors focus:underline focus:outline-none"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    loading={loading}
                    className="w-full h-11 text-sm font-semibold rounded-lg shadow-sm"
                  >
                    Sign In
                  </Button>
                </div>
              </form>

              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <a
                href="/api/auth/google?intent=login"
                className="w-full h-11 flex items-center justify-center gap-2.5 rounded-lg border border-border-strong text-sm font-semibold text-text-primary hover:bg-primary-soft transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 010-4.18V7.07H2.18a11 11 0 000 9.85l3.66-2.83z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </a>
            </Card>
          )}
        </div>
      </div>

      <Toast message={toast} onClose={handleCloseToast} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-bold">Loading...</div>}>
      <LoginPageContent />
    </Suspense>
  );
}
