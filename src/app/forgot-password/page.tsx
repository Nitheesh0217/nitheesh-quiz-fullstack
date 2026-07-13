'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import Toast, { type ToastMessage } from '../../components/Toast';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid school email address'),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const emailValidation = forgotPasswordSchema.shape.email.safeParse(email);
  const emailTouched = email.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = forgotPasswordSchema.safeParse({ email });
    if (!result.success) {
      setToast({ id: 'err', type: 'error', text: result.error.errors[0].message });
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.status === 429) {
        const data = await res.json();
        throw new Error(data.error || 'Too many attempts. Please try again later.');
      }

      // The API always returns 200 regardless of whether the email exists,
      // to avoid revealing which addresses are registered users.
      setSubmitted(true);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
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
              Forgot your password? No problem.
            </h2>
            <p className="text-white/70 text-sm max-w-sm leading-relaxed">
              We&rsquo;ll email you a secure link to choose a new one. It expires in 30 minutes for your security.
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
              Reset your password
            </h1>
            <p className="mt-2 text-sm text-text-secondary text-center lg:text-left">
              Remembered it after all?{' '}
              <Link
                href="/login"
                className="font-bold text-primary hover:text-primary-hover transition-colors focus:underline focus:outline-none"
              >
                Back to sign in
              </Link>
            </p>
          </div>

          {submitted ? (
            <Card hover={false} className="p-8 text-center space-y-4 border border-success/20 bg-surface">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto animate-pulse-soft" />
              <h3 className="text-lg font-bold text-text-primary">Check your email</h3>
              <p className="text-xs text-text-secondary">
                If an account exists for <span className="font-semibold">{email}</span>, a password reset link is on its way. It expires in 30 minutes.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </Card>
          ) : (
            <Card hover={false} className="p-6 sm:p-8 shadow-sm relative border border-border bg-surface">
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <p className="text-xs text-text-secondary -mt-1">
                  Enter the email address associated with your account and we&rsquo;ll send you a link to reset your password.
                </p>

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

                <div className="pt-2">
                  <Button
                    type="submit"
                    loading={loading}
                    className="w-full h-11 text-sm font-semibold rounded-lg shadow-sm"
                  >
                    Send reset link
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
