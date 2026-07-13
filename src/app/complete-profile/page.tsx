'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, BookOpen, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import Toast, { type ToastMessage } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useAuth } from '../../components/AuthProvider';

const completeProfileSchema = z.object({
  role: z.enum(['student', 'teacher']),
  school_id: z.string().uuid('Please select a valid school'),
});

export default function CompleteProfilePage() {
  const router = useRouter();
  const { login } = useAuth();

  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [schoolId, setSchoolId] = useState('');
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = { role, school_id: schoolId };
    const result = completeProfileSchema.safeParse(payload);
    if (!result.success) {
      setToast({ id: 'err', type: 'error', text: result.error.errors[0].message });
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save your profile');
      }

      login({
        id: data.user_id,
        email: data.email,
        name: data.name,
        role: data.role,
        school_id: data.school_id,
      });

      setProfileSaved(true);
      setToast({ id: 'success', type: 'success', text: 'Profile saved! Redirecting...' });

      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to save your profile' });
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background selection:bg-primary selection:text-white">
      {/* Brand Panel (45% Width) */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-[#312E81] via-[#3730A3] to-[#4F46E5] relative overflow-hidden flex-col justify-between p-12 text-white border-r border-border/10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="absolute inset-0 bg-radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_60%) pointer-events-none" />

        <Link href="/" className="flex items-center gap-3 relative z-10 hover:opacity-80 transition-opacity w-fit">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-md">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Concentrate</span>
        </Link>

        <div className="space-y-12 relative z-10 my-auto">
          <div className="space-y-4">
            <h2 className="text-3xl font-extrabold tracking-tight leading-tight max-w-md">
              One last step.
            </h2>
            <p className="text-white/70 text-sm max-w-sm leading-relaxed">
              Tell us how you&rsquo;ll be using Concentrate so we can set up the right workspace for you.
            </p>
          </div>
        </div>

        <div className="relative z-10 border-t border-white/10 pt-6">
          <p className="italic text-sm text-white/80 max-w-md font-medium leading-relaxed">
            &ldquo;The most intuitive course portal we&rsquo;ve ever used.&rdquo;
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
            <div className="lg:hidden flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary border border-primary/20 shadow-sm mb-4">
              <GraduationCap className="h-7 w-7" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-primary">
              Complete your profile
            </h1>
            <p className="mt-2 text-sm text-text-secondary text-center lg:text-left">
              Just a couple of details before you get started.
            </p>
          </div>

          {profileSaved ? (
            <Card hover={false} className="p-8 text-center space-y-4 border border-success/20 bg-surface">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto animate-pulse-soft" />
              <h3 className="text-lg font-bold text-text-primary">You&rsquo;re all set!</h3>
              <p className="text-xs text-text-secondary">Loading your personalized dashboard portal...</p>
            </Card>
          ) : (
            <Card hover={false} className="p-6 sm:p-8 shadow-sm relative border border-border bg-surface">
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
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
                    {schools.map((s) => (
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
                    Continue
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
