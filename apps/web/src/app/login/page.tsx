'use client';

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
      <div className={styles.backgroundWaves} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.pageLayout}>
        <section className={styles.loginCard} aria-labelledby="login-title">
          <a href="/" className={styles.brand} aria-label="Premium Retail home">
            <span className={styles.brandBadge}>P</span>
            <span className={styles.brandText}><strong>PremiumRetail</strong><small>Retail. Smarter.</small></span>
          </a>

          <div className={styles.loginContent}>
            <div className={styles.welcomePill}><i /> Welcome back</div>
            <h1 id="login-title">Welcome back</h1>
            <p className={styles.intro}>Sign in to continue to your retail operations workspace.</p>

            <form onSubmit={handleLogin} className={styles.form} noValidate>
              {error && <div className={styles.alertError} role="alert" aria-live="assertive">{error}</div>}
              {notice && <div className={styles.alertSuccess} role="status" aria-live="polite">{notice}</div>}

              <div className={styles.formGroup}>
                <label htmlFor="login-email">Email address</label>
                <div className={`${styles.inputWrap} ${errors.email ? styles.inputInvalid : ''}`}>
                  <span className={styles.fieldIcon} aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><rect x="2.8" y="4.2" width="14.4" height="11.6" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="m4 5.8 6 4.6 6-4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                  <input id="login-email" name="email" type="email" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setError(''); setErrors((current) => ({ ...current, email: undefined })); }} onBlur={handleEmailBlur} placeholder="you@company.com" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'login-email-error' : undefined} />
                </div>
                {errors.email && <p className={styles.fieldError} id="login-email-error">{errors.email}</p>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="login-password">Password</label>
                <div className={`${styles.inputWrap} ${errors.password ? styles.inputInvalid : ''}`}>
                  <span className={styles.fieldIcon} aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><rect x="3.5" y="8.5" width="13" height="9" rx="1.8" stroke="currentColor" strokeWidth="1.6"/><path d="M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M10 12v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></span>
                  <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} required minLength={8} maxLength={72} value={password} onChange={(event) => { setPassword(event.target.value); setError(''); setErrors((current) => ({ ...current, password: undefined })); }} onBlur={handlePasswordBlur} placeholder="Enter your password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'login-password-error' : undefined} />
                  <button className={styles.passwordToggle} type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                    {showPassword ? <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 3l14 14M8.6 8.7a2 2 0 0 0 2.7 2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M6.3 5.2A9.4 9.4 0 0 1 10 4.5c4.1 0 7.2 3.3 8.2 5.5a9.7 9.7 0 0 1-2.4 3.2M4.4 6.5A10.6 10.6 0 0 0 1.8 10c1 2.2 4.1 5.5 8.2 5.5 1 0 1.9-.2 2.7-.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> : <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M1.8 10S4.7 4.5 10 4.5 18.2 10 18.2 10 15.3 15.5 10 15.5 1.8 10 1.8 10Z" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.5"/></svg>}
                  </button>
                </div>
                {errors.password && <p className={styles.fieldError} id="login-password-error">{errors.password}</p>}
              </div>

              <button type="submit" disabled={busy} className={styles.submitBtn}>
                <span>{busy ? 'Signing in…' : 'Sign in'}</span>
                {!busy && <span className={styles.submitArrow} aria-hidden="true">→</span>}
              </button>
            </form>

            <label className={styles.rememberOption}>
              <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} />
              <span>Remember my email on this device</span>
            </label>
            <p className={styles.helpNote}>Need help signing in? Contact your administrator.</p>
          </div>

          <footer className={styles.cardFooter}>© {new Date().getFullYear()} Premium Retail <span>Secure retail operations</span></footer>
        </section>

        <section className={styles.visualPanel} aria-label="Premium Retail workspace preview">
          <div className={styles.visualCopy}>
            <div className={styles.platformPill}><span>✦</span> Retail Management Platform</div>
            <h2>Every part of your store,<br /><span>in one clear view.</span></h2>
            <p>Track sales. Manage inventory. Grow your business<br className={styles.desktopBreak} /> with more clarity and less effort.</p>
          </div>

          <div className={styles.dashboardPreview} aria-hidden="true">
            <div className={styles.previewHeader}>
              <span className={styles.previewBrand}>P</span>
              <strong>Operations overview</strong>
              <span className={styles.previewChevron}>⌄</span>
              <span className={styles.previewLive}><i /> Workspace preview</span>
            </div>
            <div className={styles.previewContent}>
              <nav className={styles.previewNav}>
                <span className={styles.navActive}><i>⌂</i></span><span><i>▥</i></span><span><i>⬡</i></span><span><i>◇</i></span><span><i>⚙</i></span>
              </nav>
              <div className={styles.previewMain}>
                <div className={styles.previewMainHeading}><strong>Retail store performance</strong><span>Today⌄</span></div>
                <div className={styles.metricGrid}>
                  <div className={styles.metricCard}><span>Net sales</span><strong>₹2,48,500</strong><small>↑ 12.5%</small><i className={styles.sparkOne}/></div>
                  <div className={styles.metricCard}><span>Orders</span><strong>1,204</strong><small>↑ 8.1%</small><i className={styles.sparkTwo}/></div>
                  <div className={styles.metricCard}><span>Active stores</span><strong>25</strong><small>↑ 0.0%</small><i className={styles.sparkThree}/></div>
                  <div className={styles.metricCard}><span>Avg. order value</span><strong>₹2,062</strong><small>↑ 6.4%</small><i className={styles.sparkFour}/></div>
                </div>
                <div className={styles.analyticsGrid}>
                  <div className={styles.salesChart}>
                    <div className={styles.chartHeading}><strong>Sales summary</strong><span>Last 7 days</span></div>
                    <div className={styles.chartBody}>
                      <div className={styles.axisLabels}><span>3K</span><span>2K</span><span>1K</span><span>0</span></div>
                      <svg viewBox="0 0 440 128" preserveAspectRatio="none" fill="none">
                        <path d="M0 18H440M0 52H440M0 86H440M0 120H440" stroke="#e8edf7" strokeWidth="1"/>
                        <path d="M0 105C34 100 44 77 79 84S122 102 157 78 203 92 237 63 282 82 315 51 369 63 405 27 426 35 440 19V128H0V105Z" fill="url(#loginChartFill)"/>
                        <path d="M0 105C34 100 44 77 79 84S122 102 157 78 203 92 237 63 282 82 315 51 369 63 405 27 426 35 440 19" stroke="#155eef" strokeWidth="3" strokeLinecap="round"/>
                        <circle cx="405" cy="27" r="4" fill="#fff" stroke="#155eef" strokeWidth="2.5"/>
                        <defs><linearGradient id="loginChartFill" x1="220" y1="19" x2="220" y2="128" gradientUnits="userSpaceOnUse"><stop stopColor="#155eef" stopOpacity=".2"/><stop offset="1" stopColor="#155eef" stopOpacity="0"/></linearGradient></defs>
                      </svg>
                    </div>
                    <div className={styles.chartDays}><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
                  </div>
                  <div className={styles.categoryCard}>
                    <strong>Top categories</strong>
                    <div className={styles.categoryBody}>
                      <div className={styles.categoryLegend}><span><i/>Electronics <b>36%</b></span><span><i/>Home & living <b>28%</b></span><span><i/>Fashion <b>20%</b></span><span><i/>Others <b>16%</b></span></div>
                      <div className={styles.donutChart}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.secureFoot}><span aria-hidden="true">♙</span> Your data is secure with us</div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className={styles.container}><div className={styles.loading}>Loading secure sign-in…</div></main>}><LoginForm /></Suspense>;
}
