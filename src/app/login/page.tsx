'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accessMessage, setAccessMessage] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccessMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'SUSPENDED' && data?.accessMessage) {
          setAccessMessage(data.accessMessage);
          setError(data.error || 'Your account is suspended.');
        } else {
          setError(data?.error || 'Login failed');
        }
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="glass-login-page">
      <section className="glass-login-card">
        <div className="glass-login-brand">
          <div className="glass-elephant-mark" aria-hidden="true">
            🐘
          </div>
          <h1>New Patriotic Party</h1>
          <p>Delegate Management System</p>
          <span className="glass-login-tag">NPP Portal</span>
        </div>

        <div className="glass-login-pane">
          <div className="glass-login-header">
            <h2>Account Login</h2>
            <p>Sign in to access role-based dashboards and actions.</p>
          </div>
          {error ? <div className="error">{error}</div> : null}
          {accessMessage ? (
            <div
              role="status"
              style={{
                marginBottom: '1rem',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: '#92400e',
                fontSize: '0.95rem',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Access temporarily restricted</strong>
              {accessMessage}
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="glass-login-form">
            <div className="form-group">
              <label>Username or email</label>
              <input
                className="input glass-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or your.email@example.com"
                autoComplete="username"
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                className="input glass-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary glass-login-btn" disabled={loading}>
                {loading ? 'Signing in…' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

