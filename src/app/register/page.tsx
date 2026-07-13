'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Lock, Mail, User, Eye, EyeOff, CheckCircle2, BookOpen } from 'lucide-react';
import { z } from 'zod';
import Toast, { type ToastMessage } from '../../components/Toast';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useAuth } from '../../components/AuthProvider';

const registerSchema = z.object({
  name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Invalid school email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  role: z.enum(['student', 'teacher']),
  school_id: z.string().uuid('Please select a valid school'),
});

function getPasswordStrengthScore(password: string): number {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('oauth_error');
  const { login } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [schoolId, setSchoolId] = useState('');
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  useEffect(() => {
    if (oauthError) {
      const messages: Record<string, string> = {
        access_denied: 'Google authentication was cancelled.',
        invalid_state: 'Google sign-up session expired. Please try again.',
        oauth_failed: 'Google sign-up failed. Please try again or use email/password.',
      };
      setToast({
        id: 'oauth-err',
        type: 'error',
        text: messages[oauthError] || `Google sign-up error: ${oauthError}`,
      });
    }
  }, [oauthError]);

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

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    try {
      const res = await fetch('/api/auth/schools');
      if (res.ok) {
        const data = await res.json();
        setSchools(data);
        if (data.length > 0) {
          setSchoolId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load schools catalog', e);
    }
  };

  const nameValidation = registerSchema.shape.name.safeParse(name);
  const emailValidation = registerSchema.shape.email.safeParse(email);
  const passwordValidation = registerSchema.shape.password.safeParse(password);

  const nameTouched = name.length > 0;
  const emailTouched = email.length > 0;
  const passwordTouched = password.length > 0;

  const score = getPasswordStrengthScore(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Direct validation on values inside the submit handler to prevent stale state issues
    const payload = { name, email, password, role, school_id: schoolId };
    const result = registerSchema.safeParse(payload);
    
    if (!result.success) {
      setToast({ id: 'err', type: 'error', text: result.error.errors[0].message });
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account');
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

      setRegisterSuccess(true);
      setToast({ id: 'success', type: 'success', text: 'Account created! Redirecting...' });

      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to register account' });
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background selection:bg-primary selection:text-white">
      {/* Brand Panel (45% Width) */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-[#312E81] via-[#3730A3] to-[#4F46E5] relative overflow-hidden flex-col justify-between p-12 text-white border-r border-border/10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="absolute inset-0 bg-radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_60%) pointer-events-none" />

        {/* Wordmark logo */}
        <Link href="/login" className="flex items-center gap-3 relative z-10 hover:opacity-80 transition-opacity w-fit">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-md">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Concentrate</span>
        </Link>

        {/* Testimonial and bullets */}
        <div className="space-y-12 relative z-10 my-auto">
          <div className="space-y-4">
            <h2 className="text-3xl font-extrabold tracking-tight leading-tight max-w-md">
              Start your learning journey in seconds.
            </h2>
            <p className="text-white/70 text-sm max-w-sm leading-relaxed">
              Create an account to join classes, collaborate with instructors, and keep track of all assignments.
            </p>
          </div>

          <div className="space-y-3.5 border-l border-white/15 pl-5">
            <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
              <span className="text-indigo-300">✦</span> Easy Class Enrollment via Code
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
              <span className="text-indigo-300">✦</span> Personalized Rubric Feedback
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
              <span className="text-indigo-300">✦</span> Secure School-Scoped Workspaces
            </div>
          </div>
        </div>

        {/* Quote */}
        <div className="relative z-10 border-t border-white/10 pt-6">
          <p className="italic text-sm text-white/80 max-w-md font-medium leading-relaxed">
            &ldquo;We migrated our entire department to Concentrate in a single weekend. The student response was immediately positive.&rdquo;
          </p>
          <p className="text-xs font-bold text-white/60 mt-2.5 uppercase tracking-widest">
            — Computer Science Dept, Concentrate Academy
          </p>
        </div>
      </div>

      {/* Form Panel (55% Width) */}
      <div className="w-full lg:w-[55%] flex items-center justify-center px-6 py-12 sm:px-12 overflow-y-auto">
        <div className="w-full max-w-[480px] space-y-8 animate-fadeIn py-6">
          <div className="flex flex-col items-center lg:items-start">
            {/* Logo visible on mobile */}
            <div className="lg:hidden flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary border border-primary/20 shadow-sm mb-4">
              <GraduationCap className="h-7 w-7" />
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-text-secondary text-center lg:text-left">
              Already have an account?{' '}
              <Link 
                href="/login" 
                className="font-bold text-primary hover:text-primary-hover transition-colors focus:underline focus:outline-none"
              >
                Sign in here
              </Link>
            </p>
          </div>

          {registerSuccess ? (
            <Card hover={false} className="p-8 text-center space-y-4 border border-success/20 bg-surface">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto animate-pulse-soft" />
              <h3 className="text-lg font-bold text-text-primary">Account Created!</h3>
              <p className="text-xs text-text-secondary">Setting up your personalized workspace dashboard...</p>
            </Card>
          ) : (
            <Card hover={false} className="p-6 sm:p-8 shadow-sm relative border border-border bg-surface">
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                
                <Input
                  id="name"
                  name="name"
                  type="text"
                  label="Full Name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={nameTouched && !nameValidation.success ? 'Full name is required' : undefined}
                  success={nameTouched && nameValidation.success}
                  icon={<User className="h-4 w-4" />}
                  placeholder="John Doe"
                  className="h-11 py-3"
                />

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
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={passwordTouched && !passwordValidation.success ? 'Password must be at least 8 characters long' : undefined}
                    success={passwordTouched && passwordValidation.success}
                    icon={<Lock className="h-4 w-4" />}
                    placeholder="Minimum 8 characters"
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

                  {/* 4-Segment Password Strength Meter */}
                  {passwordTouched && score > 0 && (
                    <div className="mt-2 animate-fadeIn space-y-1">
                      <div className="flex gap-1.5 h-1.5 w-full">
                        {[1, 2, 3, 4].map((seg) => (
                          <div 
                            key={seg}
                            className={`flex-1 h-full rounded-full transition-all duration-300 ${
                              seg <= score 
                                ? score === 1 ? 'bg-red-500' 
                                  : score === 2 ? 'bg-amber-500' 
                                  : score === 3 ? 'bg-indigo-400' 
                                  : 'bg-emerald-500'
                                : 'bg-border/60 dark:bg-dark-border/40'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                        {score === 1 && '❌ Weak password'}
                        {score === 2 && '⚠️ Fair password'}
                        {score === 3 && '✨ Good password'}
                        {score === 4 && '✅ Strong password'}
                      </p>
                    </div>
                  )}
                </div>

                {/* School Selection */}
                <div className="space-y-1">
                  <label htmlFor="school" className="block text-xs font-bold text-text-primary mb-2 uppercase tracking-wider">
                    Select Your School *
                  </label>
                  <select
                    id="school"
                    name="school_id"
                    value={schoolId}
                    onChange={(e) => setSchoolId(e.target.value)}
                    className="block w-full rounded-lg border-2 border-border bg-surface py-2.5 px-3 text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all cursor-pointer"
                  >
                    {schools.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Role selection Cards */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-text-primary mb-2 uppercase tracking-wider">
                    I am registering as a *
                  </label>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('student')}
                      className={`flex items-start gap-3.5 p-3 rounded-lg border-2 text-left transition-all hover:bg-primary-soft/10 focus:outline-none ${
                        role === 'student'
                          ? 'border-primary bg-primary-soft/30 dark:bg-primary-soft/10 shadow-sm'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${role === 'student' ? 'bg-primary text-white' : 'bg-primary-soft text-primary'}`}>
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-text-primary">Student</div>
                        <div className="text-[11px] text-text-secondary mt-0.5">Enrolls in classes and submits assignments</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRole('teacher')}
                      className={`flex items-start gap-3.5 p-3 rounded-lg border-2 text-left transition-all hover:bg-primary-soft/10 focus:outline-none ${
                        role === 'teacher'
                          ? 'border-primary bg-primary-soft/30 dark:bg-primary-soft/10 shadow-sm'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${role === 'teacher' ? 'bg-primary text-white' : 'bg-primary-soft text-primary'}`}>
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-text-primary">Teacher</div>
                        <div className="text-[11px] text-text-secondary mt-0.5">Manages courses, builds assignments, and grades</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    loading={loading}
                    className="w-full h-11 text-sm font-semibold rounded-lg shadow-sm"
                  >
                    Create Account
                  </Button>
                </div>

                <div className="flex items-center gap-3 my-5">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <a
                  href="/api/auth/google?intent=register"
                  className="w-full h-11 flex items-center justify-center gap-2.5 rounded-lg border border-border-strong text-sm font-semibold text-text-primary hover:bg-primary-soft transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 010-4.18V7.07H2.18a11 11 0 000 9.85l3.66-2.83z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Sign up with Google
                </a>
              </form>
            </Card>
          )}
        </div>
      </div>

      <Toast message={toast} onClose={handleCloseToast} />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-bold">Loading...</div>}>
      <RegisterPageContent />
    </Suspense>
  );
}
