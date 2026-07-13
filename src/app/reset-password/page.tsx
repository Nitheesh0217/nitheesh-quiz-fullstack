'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Lock, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { z } from 'zod';
import Toast, { type ToastMessage } from '../../components/Toast';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';

const resetPasswordSchema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters long'),
});

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);

  const passwordValidation = resetPasswordSchema.shape.new_password.safeParse(newPassword);
  const passwordTouched = newPassword.length > 0;
  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setToast({ id: 'err', type: 'error', text: 'This link is missing its reset token.' });
      return;
    }

    const result = resetPasswordSchema.safeParse({ new_password: newPassword });
    if (!result.success) {
      setToast({ id: 'err', type: 'error', text: result.error.errors[0].message });
      return;
    }

    if (!passwordsMatch) {
      setToast({ id: 'err', type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400) {
          setLinkExpired(true);
          return;
        }
        throw new Error(data.error || 'Failed to reset password');
      }

      setResetSuccess(true);
      setToast({ id: 'success', type: 'success', text: 'Password updated successfully!' });

      setTimeout(() => {
        router.push('/login?toast=password-updated');
      }, 1200);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to reset password' });
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
              Choose a new password.
            </h2>
            <p className="text-white/70 text-sm max-w-sm leading-relaxed">
              Once updated, you&rsquo;ll be signed out everywhere else and asked to sign in again.
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
              Set a new password
            </h1>
          </div>

          {linkExpired ? (
            <Card hover={false} className="p-8 text-center space-y-4 border border-danger/20 bg-surface">
              <XCircle className="h-12 w-12 text-danger mx-auto" />
              <h3 className="text-lg font-bold text-text-primary">This link has expired.</h3>
              <p className="text-xs text-text-secondary">
                Reset links are only valid for 30 minutes and can only be used once.
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover transition-colors"
              >
                Request a new one
              </Link>
            </Card>
          ) : resetSuccess ? (
            <Card hover={false} className="p-8 text-center space-y-4 border border-success/20 bg-surface">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto animate-pulse-soft" />
              <h3 className="text-lg font-bold text-text-primary">Password updated!</h3>
              <p className="text-xs text-text-secondary">Redirecting you to sign in...</p>
            </Card>
          ) : (
            <Card hover={false} className="p-6 sm:p-8 shadow-sm relative border border-border bg-surface">
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                {!token && (
                  <p className="text-xs text-danger font-semibold">
                    This link is missing its reset token. Please use the link from your email exactly as sent.
                  </p>
                )}

                <div className="space-y-2 relative">
                  <Input
                    id="new_password"
                    name="new_password"
                    label="New Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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
                </div>

                <Input
                  id="confirm_password"
                  name="confirm_password"
                  label="Confirm New Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  error={confirmTouched && !passwordsMatch ? 'Passwords do not match' : undefined}
                  success={confirmTouched && passwordsMatch && passwordValidation.success}
                  icon={<Lock className="h-4 w-4" />}
                  placeholder="Re-enter your new password"
                  className="h-11 py-3"
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    loading={loading}
                    className="w-full h-11 text-sm font-semibold rounded-lg shadow-sm"
                  >
                    Update password
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-bold">Loading...</div>}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
