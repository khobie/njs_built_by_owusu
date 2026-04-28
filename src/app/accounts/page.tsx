'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/dashboard/AppShell';

type Role = 'ADMIN' | 'FORM_ISSUER' | 'VETTING_PANEL';

interface Area {
  id: string;
  code: string;
  name: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  electoralAreas: { areaCode: string }[];
}

export default function AccountsPage() {
  const [meRole, setMeRole] = useState<Role | ''>('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('VETTING_PANEL');
  const [areaCodes, setAreaCodes] = useState<string[]>([]);

  const areaCodeSet = useMemo(() => new Set(areaCodes), [areaCodes]);

  const load = async () => {
    setError('');
    try {
      const [sRes, uRes, aRes] = await Promise.all([
        fetch('/api/auth/session'),
        fetch('/api/users'),
        fetch('/api/electoral-areas'),
      ]);
      const s = await sRes.json();
      if (!sRes.ok || s?.user?.role !== 'ADMIN') {
        setError('Only Admin can access account management.');
        return;
      }
      setMeRole(s.user.role);
      if (uRes.ok) setUsers(await uRes.json());
      if (aRes.ok) setAreas(await aRes.json());
    } catch {
      setError('Failed to load account portal data.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, areaCodes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to create user');
        return;
      }
      setName('');
      setEmail('');
      setPassword('');
      setRole('VETTING_PANEL');
      setAreaCodes([]);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleArea = (code: string) => {
    setAreaCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleActive = async (u: UserRow) => {
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    await load();
  };

  return (
    <AppShell activeHref="/accounts">
      <div className="app-main-inner">
        <header className="dashboard-page-header">
          <div>
            <h1>Accounts</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', fontSize: '0.9rem' }}>
              Authentication, role assignment, and electoral-area access controls.
            </p>
          </div>
        </header>
        {error ? <div className="error">{error}</div> : null}
        {meRole === 'ADMIN' ? (
          <>
            <section className="section" style={{ marginBottom: '1rem' }}>
              <h2 className="section-title" style={{ marginBottom: '1rem' }}>Create User Account</h2>
              <form onSubmit={createUser}>
                <div className="grid-3">
                  <div className="form-group">
                    <label>Name</label>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label>Role</label>
                    <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                      <option value="ADMIN">Admin</option>
                      <option value="FORM_ISSUER">Form Issuer</option>
                      <option value="VETTING_PANEL">Vetting Panel</option>
                    </select>
                  </div>
                  {role === 'VETTING_PANEL' ? (
                    <div className="form-group">
                      <label>Electoral Area Assignment</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.35rem' }}>
                        {areas.map((a) => (
                          <label key={a.code} style={{ fontSize: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <input
                              type="checkbox"
                              checked={areaCodeSet.has(a.code)}
                              onChange={() => toggleArea(a.code)}
                            />
                            {a.name} ({a.code})
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </section>

            <section className="section">
              <h2 className="section-title" style={{ marginBottom: '1rem' }}>Existing Users</h2>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Areas</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>{u.role}</td>
                        <td>{u.electoralAreas.map((a) => a.areaCode).join(', ') || '—'}</td>
                        <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => void toggleActive(u)}>
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
