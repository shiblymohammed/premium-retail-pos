'use client';

import { ArrowRight, BarChart3, Eye, EyeOff, LockKeyhole, Mail, Package, ScanLine, Store } from 'lucide-react';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AuthSession,
  decodeJwt,
  getJwtExpirationMs,
  getRoleHomeRoute,
  getStoredSession,
  setStoredSession,
} from '@/lib/auth';
import styles from './login.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
const REMEMBERED_EMAIL_KEY = 'premium-retail-remembered-email';

type FieldErrors = { email?: string; password?: string };

function safeReturnPath(returnUrl: string | null, role: string) {
  if (!returnUrl || !returnUrl.startsWith('/') || returnUrl.startsWith('//')) return getRoleHomeRoute(role);
  try {
    const parsed = new URL(returnUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) return getRoleHomeRoute(role);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return getRoleHomeRoute(role);
  }
}

function responseMessage(body: unknown) {
  if (!body || typeof body !== 'object') return '';
  const candidate = body as { message?: unknown; error?: unknown };
  if (typeof candidate.message === 'string') return candidate.message;
  if (Array.isArray(candidate.message)) return candidate.message.filter((item) => typeof item === 'string').join(' ');
  if (typeof candidate.error === 'string') return candidate.error;
  return '';
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const existing = getStoredSession();
    if (existing?.accessToken && existing.user?.role) {
      router.replace(safeReturnPath(returnUrl, existing.user.role));
      return;
    }

    try {
      const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRememberEmail(true);
      }
    } catch {
      // Remembering an email is optional when browser storage is unavailable.
    }
  }, [router, returnUrl]);

  function validateEmail(value: string) {
    const normalized = value.trim();
    if (!normalized) return 'Enter your work email.';
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return 'Enter a valid email address.';
    return '';
  }

  function validatePassword(value: string) {
    if (!value) return 'Enter your password.';
    if (value.length < 8) return 'Password must be at least 8 characters.';
    if (value.length > 72) return 'Password must be 72 characters or fewer.';
    return '';
  }

  function handleEmailBlur() {
    const message = validateEmail(email);
    setErrors((current) => ({ ...current, email: message || undefined }));
  }

  function handlePasswordBlur() {
    const message = validatePassword(password);
    setErrors((current) => ({ ...current, password: message || undefined }));
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const nextErrors = { email: emailError || undefined, password: passwordError || undefined };
    setErrors(nextErrors);
    if (emailError || passwordError) {
      document.getElementById(emailError ? 'login-email' : 'login-password')?.focus();
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('We could not verify those sign-in details. Check your email and password, then try again.');
        }
        if (response.status === 429) throw new Error('There have been too many sign-in attempts. Wait a moment and try again.');
        throw new Error(responseMessage(payload) || 'Sign-in could not be completed. Please try again.');
      }

      const accessToken = payload?.data?.accessToken;
      const refreshToken = payload?.data?.refreshToken;
      if (typeof accessToken !== 'string') throw new Error('The sign-in service returned an incomplete response. Please try again.');

      const decoded = decodeJwt(accessToken);
      const expiresAt = getJwtExpirationMs(accessToken);
      if (!decoded?.role || !decoded.id || !decoded.email || !expiresAt) {
        throw new Error('The sign-in service returned an invalid session. Please try again.');
      }

      const user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        name: decoded.email.split('@')[0].replace(/[._-]/g, ' ').toUpperCase(),
        locationIds: decoded.locationIds || [],
      };
      const session: AuthSession = {
        accessToken,
        refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined,
        user,
        expiresAt,
      };

      setStoredSession(session);
      try {
        if (rememberEmail) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
        else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch {
        // Authentication succeeds even when optional email storage is blocked.
      }

      setNotice(`Welcome back, ${user.name}. Opening your workspace…`);
      const destination = safeReturnPath(returnUrl, user.role);
      window.setTimeout(() => window.location.replace(destination), 350);
    } catch (caught) {
      if (caught instanceof TypeError) {
        setError('We could not connect to the sign-in service. Check your connection and try again.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.container}>
      <div className={styles.pageLayout}>
        <section className={styles.loginCard} aria-labelledby="login-title">
          <a href="/login" className={styles.brand} aria-label="Premium Retail sign in">
            <span className={styles.brandBadge}><Store size={22} strokeWidth={1.8} aria-hidden="true" /></span>
            <strong>Premium Retail</strong>
          </a>

          <div className={styles.loginContent}>
            <h1 id="login-title">Welcome back</h1>
            <p className={styles.intro}>Sign in to your retail workspace.</p>

            <form onSubmit={handleLogin} className={styles.form} noValidate>
              {error && <div className={styles.alertError} role="alert" aria-live="assertive">{error}</div>}
              {notice && <div className={styles.alertSuccess} role="status" aria-live="polite">{notice}</div>}

              <div className={styles.formGroup}>
                <label htmlFor="login-email">Email address</label>
                <div className={`${styles.inputWrap} ${errors.email ? styles.inputInvalid : ''}`}>
                  <span className={styles.fieldIcon} aria-hidden="true"><Mail size={18} strokeWidth={1.8} aria-hidden="true" /></span>
                  <input id="login-email" name="email" type="email" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setError(''); setErrors((current) => ({ ...current, email: undefined })); }} onBlur={handleEmailBlur} placeholder="you@company.com" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'login-email-error' : undefined} />
                </div>
                {errors.email && <p className={styles.fieldError} id="login-email-error">{errors.email}</p>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="login-password">Password</label>
                <div className={`${styles.inputWrap} ${errors.password ? styles.inputInvalid : ''}`}>
                  <span className={styles.fieldIcon} aria-hidden="true"><LockKeyhole size={18} strokeWidth={1.8} aria-hidden="true" /></span>
                  <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} required minLength={8} maxLength={72} value={password} onChange={(event) => { setPassword(event.target.value); setError(''); setErrors((current) => ({ ...current, password: undefined })); }} onBlur={handlePasswordBlur} placeholder="Enter your password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'login-password-error' : undefined} />
                  <button className={styles.passwordToggle} type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                    {showPassword ? <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.8} aria-hidden="true" />}
                  </button>
                </div>
                {errors.password && <p className={styles.fieldError} id="login-password-error">{errors.password}</p>}
              </div>

              <button type="submit" disabled={busy} className={styles.submitBtn}>
                <span>{busy ? 'Signing in…' : 'Sign in'}</span>
                {!busy && <span className={styles.submitArrow} aria-hidden="true"><ArrowRight size="1em" className="inline-icon" aria-hidden="true" /></span>}
              </button>
            </form>

            <label className={styles.rememberOption}>
              <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} />
              <span>Remember my email on this device</span>
            </label>
            <p className={styles.helpNote}>Need help signing in? Contact your administrator.</p>
          </div>

          <footer className={styles.cardFooter}>© {new Date().getFullYear()} Premium Retail</footer>
        </section>

        <section className={styles.visualPanel} aria-label="Premium Retail features">
          <div className={styles.visualCopy}>
            <span className={styles.kicker}>PREMIUM RETAIL POS</span>
            <h2>Run your store<br />from one workspace.</h2>
          </div>
          <div className={styles.featureGrid}>
            <div className={styles.checkoutFeature}>
              <ScanLine size={28} strokeWidth={1.6} aria-hidden="true" />
              <div><strong>Checkout</strong><span>Scan, bill, and take payments</span></div>
            </div>
            <div className={styles.feature}>
              <Package size={21} strokeWidth={1.7} aria-hidden="true" />
              <strong>Stock & transfers</strong>
            </div>
            <div className={styles.feature}>
              <BarChart3 size={21} strokeWidth={1.7} aria-hidden="true" />
              <strong>Sales reports</strong>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className={styles.container}><div className={styles.loading}>Loading secure sign-in…</div></main>}><LoginForm /></Suspense>;
}
