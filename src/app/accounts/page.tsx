'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/dashboard/AppShell';
import { isAdminRole } from '@/lib/roles';

type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'FORM_ISSUER'
  | 'VETTING_PANEL'
  | 'EA_PORTAL_ADMIN'
  | 'EA_OFFICER'
  | 'EA_DATA_ENTRY';

interface EaPortalAreaOption {
  id: string;
  name: string;
  region: string;
  district: string;
}

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
  eaPortalAreas: { eaPortalAreaId: string }[];
}

export default function AccountsPage() {
  const [meRole, setMeRole] = useState<Role | ''>('');
  const [meEmail, setMeEmail] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [eaPortalAreasList, setEaPortalAreasList] = useState<EaPortalAreaOption[]>([]);
  const [error, setError] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingOwnPassword, setSavingOwnPassword] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('VETTING_PANEL');
  const [areaCodes, setAreaCodes] = useState<string[]>([]);
  const [eaPortalAreaIds, setEaPortalAreaIds] = useState<string[]>([]);

  const [assignModalUser, setAssignModalUser] = useState<UserRow | null>(null);
  const [assignModalIds, setAssignModalIds] = useState<string[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  const areaCodeSet = useMemo(() => new Set(areaCodes), [areaCodes]);
  const eaPortalAreaIdSet = useMemo(() => new Set(eaPortalAreaIds), [eaPortalAreaIds]);

  const load = async () => {
    setError('');
    try {
      const [sRes, uRes, aRes, epRes] = await Promise.all([
        fetch('/api/auth/session'),
        fetch('/api/users'),
        fetch('/api/electoral-areas'),
        fetch('/api/ea-portal/areas'),
      ]);
      const s = await sRes.json();
      if (!sRes.ok || !isAdminRole(s?.user?.role)) {
        setError('Only Admin can access account management.');
        return;
      }
      setMeRole(s.user.role);
      setMeEmail(s.user.email || '');
      if (uRes.ok) {
        const raw: unknown[] = await uRes.json();
        setUsers(
          raw.map((row) => {
            const u = row as UserRow;
            return {
              ...u,
              eaPortalAreas: u.eaPortalAreas ?? [],
              electoralAreas: u.electoralAreas ?? [],
            };
          }),
        );
      }
      if (aRes.ok) setAreas(await aRes.json());
      if (epRes.ok) {
        const raw: unknown[] = await epRes.json();
        setEaPortalAreasList(
          raw.map((row) => {
            const r = row as { id: string; name: string; region: string; district: string };
            return { id: r.id, name: r.name, region: r.region, district: r.district };
          }),
        );
      }
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
    if (role === 'EA_OFFICER' && eaPortalAreaIds.length === 0) {
      setError('Electoral Area Officers must be assigned to at least one EA portal area.');
      setSaving(false);
      return;
    }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          areaCodes: role === 'VETTING_PANEL' ? areaCodes : [],
          eaPortalAreaIds: role === 'EA_OFFICER' ? eaPortalAreaIds : [],
        }),
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
      setEaPortalAreaIds([]);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const changeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.trim().length < 6) {
      setPasswordMsg({ type: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword.trim() !== confirmNewPassword.trim()) {
      setPasswordMsg({ type: 'err', text: 'New password and confirmation do not match.' });
      return;
    }
    setSavingOwnPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword: newPassword.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMsg({ type: 'err', text: data?.error || 'Failed to change password.' });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordMsg({ type: 'ok', text: 'Your password has been updated.' });
    } finally {
      setSavingOwnPassword(false);
    }
  };

  const toggleArea = (code: string) => {
    setAreaCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleEaPortalArea = (id: string) => {
    setEaPortalAreaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const portalNamesForUser = (u: UserRow): string => {
    const ids = new Set(u.eaPortalAreas.map((x) => x.eaPortalAreaId));
    const labels = eaPortalAreasList.filter((a) => ids.has(a.id)).map((a) => a.name);
    return labels.length ? labels.join(', ') : '—';
  };

  const openEaPortalAssign = (u: UserRow) => {
    setAssignModalUser(u);
    setAssignModalIds(u.eaPortalAreas.map((x) => x.eaPortalAreaId));
  };

  const toggleAssignModalArea = (id: string) => {
    setAssignModalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const savePortalAssignments = async () => {
    if (!assignModalUser) return;
    if (assignModalIds.length === 0) {
      setError('Select at least one EA portal area for this officer.');
      return;
    }
    setAssignSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${assignModalUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eaPortalAreaIds: assignModalIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string })?.error || 'Failed to update EA portal assignments.');
        return;
      }
      setAssignModalUser(null);
      await load();
    } finally {
      setAssignSaving(false);
    }
  };

  const toggleActive = async (u: UserRow) => {
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    await load();
  };

  const changePassword = async (u: UserRow) => {
    const nextPassword = window.prompt(`Enter new password for ${u.name}:`);
    if (!nextPassword) return;
    if (nextPassword.trim().length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setError('');
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: nextPassword.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || 'Failed to change password.');
      return;
    }
    alert(`Password updated for ${u.name}.`);
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
        {isAdminRole(meRole) ? (
          <>
            <section className="section" style={{ marginBottom: '1rem' }}>
              <h2 className="section-title" style={{ marginBottom: '1rem' }}>Change your password</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Signed in as {meEmail || '—'}
              </p>
              {passwordMsg ? (
                <div className={passwordMsg.type === 'err' ? 'error' : undefined} style={passwordMsg.type === 'ok' ? { marginBottom: '0.75rem', color: 'var(--accent-success, #15803d)' } : { marginBottom: '0.75rem' }}>
                  {passwordMsg.text}
                </div>
              ) : null}
              <form onSubmit={changeOwnPassword}>
                <div className="grid-3">
                  <div className="form-group">
                    <label>Current password</label>
                    <input
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>New password</label>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="form-group">
                    <label>Confirm new password</label>
                    <input
                      className="input"
                      type="password"
                      autoComplete="new-password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={savingOwnPassword}>
                    {savingOwnPassword ? 'Updating…' : 'Update my password'}
                  </button>
                </div>
              </form>
            </section>

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
                    <select
                      className="select"
                      value={role}
                      onChange={(e) => {
                        const r = e.target.value as Role;
                        setRole(r);
                        if (r !== 'VETTING_PANEL') setAreaCodes([]);
                        if (r !== 'EA_OFFICER') setEaPortalAreaIds([]);
                      }}
                    >
                      <option value="SUPER_ADMIN">Super Admin</option>
                      <option value="ADMIN">Admin</option>
                      <option value="FORM_ISSUER">Form Issuer</option>
                      <option value="VETTING_PANEL">Vetting Panel</option>
                      <option value="EA_PORTAL_ADMIN">EA Portal Admin</option>
                      <option value="EA_OFFICER">Electoral Area Officer</option>
                      <option value="EA_DATA_ENTRY">EA Data Entry Officer</option>
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
                {role === 'EA_OFFICER' ? (
                  <div className="form-group">
                    <label>EA Portal areas (separate from delegate vetting areas)</label>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                      Officers only see records linked to these portal electoral areas. Pick at least one.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.35rem' }}>
                      {eaPortalAreasList.map((a) => (
                        <label key={a.id} style={{ fontSize: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={eaPortalAreaIdSet.has(a.id)}
                            onChange={() => toggleEaPortalArea(a.id)}
                          />
                          {a.name} · {a.district}, {a.region}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
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
                      <th>Vetting areas</th>
                      <th>EA Portal</th>
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
                        <td style={{ maxWidth: '14rem', fontSize: '0.85rem', verticalAlign: 'top' }}>{portalNamesForUser(u)}</td>
                        <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => void toggleActive(u)}>
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={() => void changePassword(u)}>
                              Change Password
                            </button>
                            {u.role === 'EA_OFFICER' ? (
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEaPortalAssign(u)}>
                                EA portal areas
                              </button>
                            ) : null}
                          </div>
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

      {assignModalUser ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ea-portal-assign-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => {
            if (!assignSaving) setAssignModalUser(null);
          }}
        >
          <div
            style={{
              background: 'var(--surface, #fff)',
              padding: '1.25rem',
              borderRadius: '10px',
              maxWidth: '36rem',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="ea-portal-assign-title" style={{ marginTop: 0 }}>
              EA portal areas — {assignModalUser.name}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              This officer only sees portal records assigned to the electoral areas you select here.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.35rem' }}>
              {eaPortalAreasList.map((a) => (
                <label key={a.id} style={{ fontSize: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={assignModalIds.includes(a.id)}
                    onChange={() => toggleAssignModalArea(a.id)}
                    disabled={assignSaving}
                  />
                  {a.name} · {a.district}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-secondary" disabled={assignSaving} onClick={() => setAssignModalUser(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={assignSaving} onClick={() => void savePortalAssignments()}>
                {assignSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
