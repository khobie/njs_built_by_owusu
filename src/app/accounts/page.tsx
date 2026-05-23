'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/dashboard/AppShell';
import { needsEaPortalAreaAssignment } from '@/lib/ea-portal-user-roles';
import { isAdminRole } from '@/lib/roles';
import { creatableRolesForActor, userRoleLabel } from '@/lib/user-role-labels';
import { formatAccessRestoreTime, isCurrentlySuspended } from '@/lib/user-suspension';

type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'FORM_ISSUER'
  | 'VETTING_PANEL'
  | 'EA_PORTAL_ADMIN'
  | 'EA_FORM_ISSUER'
  | 'EA_VETTING_PANEL'
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
  suspendedUntil: string | null;
  electoralAreas: { areaCode: string }[];
  eaPortalAreas: { eaPortalAreaId: string }[];
}

export default function AccountsPage() {
  const [meRole, setMeRole] = useState<Role | ''>('');
  const [meId, setMeId] = useState('');
  const [meEmail, setMeEmail] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [eaPortalAreasList, setEaPortalAreasList] = useState<EaPortalAreaOption[]>([]);
  const [error, setError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
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
  const creatableRoles = useMemo(
    () => (meRole ? creatableRolesForActor(meRole) : []),
    [meRole],
  );
  const [areaCodes, setAreaCodes] = useState<string[]>([]);
  const [eaPortalAreaIds, setEaPortalAreaIds] = useState<string[]>([]);

  const [assignModalUser, setAssignModalUser] = useState<UserRow | null>(null);
  const [assignModalIds, setAssignModalIds] = useState<string[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  const [vettingAssignUser, setVettingAssignUser] = useState<UserRow | null>(null);
  const [vettingAssignCodes, setVettingAssignCodes] = useState<string[]>([]);
  const [vettingAssignSaving, setVettingAssignSaving] = useState(false);

  const [suspendUser, setSuspendUser] = useState<UserRow | null>(null);
  const [suspendUntilInput, setSuspendUntilInput] = useState('');
  const [suspendSaving, setSuspendSaving] = useState(false);

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
      setMeId(s.user.id || '');
      setMeEmail(s.user.email || '');
      if (uRes.ok) {
        const raw: unknown[] = await uRes.json();
        setUsers(
          raw.map((row) => {
            const u = row as UserRow;
            return {
              ...u,
              suspendedUntil: u.suspendedUntil ?? null,
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

  useEffect(() => {
    if (creatableRoles.length > 0 && !creatableRoles.includes(role)) {
      setRole(creatableRoles[0] as Role);
    }
  }, [creatableRoles, role]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setCreateSuccess('');
    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters.');
      setSaving(false);
      return;
    }
    if (role === 'VETTING_PANEL' && areaCodes.length === 0) {
      setError('Vetting panel members must be assigned at least one nomination electoral area.');
      setSaving(false);
      return;
    }
    if (needsEaPortalAreaAssignment(role) && eaPortalAreaIds.length === 0) {
      setError('This EA portal role must be assigned to at least one electoral area.');
      setSaving(false);
      return;
    }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          areaCodes: role === 'VETTING_PANEL' ? areaCodes : [],
          eaPortalAreaIds: needsEaPortalAreaAssignment(role) ? eaPortalAreaIds : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to create user');
        return;
      }
      setCreateSuccess(`Account created for ${data.email ?? email}.`);
      setName('');
      setEmail('');
      setPassword('');
      setRole((creatableRoles[0] ?? 'VETTING_PANEL') as Role);
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

  const openVettingAssign = (u: UserRow) => {
    setVettingAssignUser(u);
    setVettingAssignCodes(u.electoralAreas.map((x) => x.areaCode));
  };

  const toggleVettingAssignCode = (code: string) => {
    setVettingAssignCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const saveVettingAssignments = async () => {
    if (!vettingAssignUser) return;
    if (vettingAssignCodes.length === 0) {
      setError('Select at least one nomination electoral area.');
      return;
    }
    setVettingAssignSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${vettingAssignUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaCodes: vettingAssignCodes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string })?.error || 'Failed to update vetting areas.');
        return;
      }
      setVettingAssignUser(null);
      await load();
    } finally {
      setVettingAssignSaving(false);
    }
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

  const openSuspendModal = (u: UserRow) => {
    setError('');
    setSuspendUser(u);
    const defaultUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    defaultUntil.setMinutes(0, 0, 0);
    defaultUntil.setHours(defaultUntil.getHours() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    setSuspendUntilInput(
      `${defaultUntil.getFullYear()}-${pad(defaultUntil.getMonth() + 1)}-${pad(defaultUntil.getDate())}T${pad(defaultUntil.getHours())}:${pad(defaultUntil.getMinutes())}`,
    );
  };

  const saveSuspension = async () => {
    if (!suspendUser) return;
    setSuspendSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${suspendUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspendUntil: suspendUntilInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Failed to suspend account.');
        return;
      }
      setSuspendUser(null);
      setCreateSuccess(`Account suspended until access is restored for ${suspendUser.email}.`);
      await load();
    } finally {
      setSuspendSaving(false);
    }
  };

  const unsuspendAccount = async (u: UserRow) => {
    const ok = window.confirm(`Remove suspension for ${u.name} (${u.email})? They can sign in immediately.`);
    if (!ok) return;
    setError('');
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unsuspend: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { error?: string }).error || 'Failed to remove suspension.');
      return;
    }
    setCreateSuccess(`Suspension removed for ${u.email}.`);
    await load();
  };

  const userStatusLabel = (u: UserRow) => {
    if (!u.isActive) return 'Inactive';
    if (u.suspendedUntil && isCurrentlySuspended(new Date(u.suspendedUntil))) {
      return `Suspended until ${formatAccessRestoreTime(new Date(u.suspendedUntil))}`;
    }
    return 'Active';
  };

  const clearAccount = async (u: UserRow) => {
    if (u.id === meId) {
      setError('You cannot clear your own account while signed in.');
      return;
    }
    const ok = window.confirm(
      `Clear account for ${u.name} (${u.email})?\n\nThis will deactivate the user and remove all vetting and EA portal area assignments. The login record is kept so you can reactivate or reassign later.`,
    );
    if (!ok) return;
    setError('');
    setCreateSuccess('');
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearAccount: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { error?: string }).error || 'Failed to clear account.');
      return;
    }
    setCreateSuccess(`Account cleared for ${u.email}.`);
    await load();
  };

  const deleteAccount = async (u: UserRow) => {
    if (u.id === meId) {
      setError('You cannot delete your own account while signed in.');
      return;
    }
    const ok = window.confirm(
      `Permanently delete ${u.name} (${u.email})?\n\nThis cannot be undone. Any EA portal forms they issued will be reassigned to your admin account.`,
    );
    if (!ok) return;
    setError('');
    setCreateSuccess('');
    const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { error?: string }).error || 'Failed to delete account.');
      return;
    }
    const reassigned = (data as { reassignedForms?: number }).reassignedForms ?? 0;
    setCreateSuccess(
      reassigned > 0
        ? `Deleted ${u.email}. ${reassigned} EA form(s) reassigned to you.`
        : `Deleted ${u.email}.`,
    );
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
        {createSuccess ? (
          <div
            style={{ marginBottom: '0.75rem', color: 'var(--accent-success, #15803d)' }}
            role="status"
          >
            {createSuccess}
          </div>
        ) : null}
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
              <h2 className="section-title" style={{ marginBottom: '1rem' }}>Create user account</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Nomination system roles (form issuing / vetting), EA portal roles, and system admins.
                Scoped roles must be linked to electoral areas on creation.
              </p>
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
                    <input
                      className="input"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
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
                        if (!needsEaPortalAreaAssignment(r)) setEaPortalAreaIds([]);
                      }}
                    >
                      <optgroup label="System">
                        {creatableRoles
                          .filter((r) => ['SUPER_ADMIN', 'ADMIN'].includes(r))
                          .map((r) => (
                            <option key={r} value={r}>
                              {userRoleLabel(r)}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Nomination system">
                        {creatableRoles
                          .filter((r) => ['FORM_ISSUER', 'VETTING_PANEL'].includes(r))
                          .map((r) => (
                            <option key={r} value={r}>
                              {userRoleLabel(r)}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="EA portal">
                        {creatableRoles
                          .filter((r) =>
                            [
                              'EA_PORTAL_ADMIN',
                              'EA_FORM_ISSUER',
                              'EA_VETTING_PANEL',
                              'EA_OFFICER',
                              'EA_DATA_ENTRY',
                            ].includes(r),
                          )
                          .map((r) => (
                            <option key={r} value={r}>
                              {userRoleLabel(r)}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>
                  {role === 'VETTING_PANEL' ? (
                    <div className="form-group">
                      <label>Nomination electoral areas (required)</label>
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
                {needsEaPortalAreaAssignment(role) ? (
                  <div className="form-group">
                    <label>EA Portal electoral areas</label>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                      Form issuers and vetting panel members only see delegates in these areas. Pick at least one.
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
                        <td title={u.role}>{userRoleLabel(u.role)}</td>
                        <td>{u.electoralAreas.map((a) => a.areaCode).join(', ') || '—'}</td>
                        <td style={{ maxWidth: '14rem', fontSize: '0.85rem', verticalAlign: 'top' }}>{portalNamesForUser(u)}</td>
                        <td style={{ maxWidth: '14rem', fontSize: '0.85rem' }}>{userStatusLabel(u)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => void toggleActive(u)}>
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={() => void changePassword(u)}>
                              Change Password
                            </button>
                            {u.role === 'VETTING_PANEL' ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => openVettingAssign(u)}
                              >
                                Vetting areas
                              </button>
                            ) : null}
                            {needsEaPortalAreaAssignment(u.role) ? (
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEaPortalAssign(u)}>
                                EA areas
                              </button>
                            ) : null}
                            {u.id !== meId ? (
                              <>
                                {u.suspendedUntil && isCurrentlySuspended(new Date(u.suspendedUntil)) ? (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => void unsuspendAccount(u)}
                                  >
                                    Unsuspend
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => openSuspendModal(u)}
                                  >
                                    Suspend
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => void clearAccount(u)}
                                >
                                  Clear account
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => void deleteAccount(u)}
                                >
                                  Delete
                                </button>
                              </>
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

      {vettingAssignUser ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vetting-assign-title"
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
            if (!vettingAssignSaving) setVettingAssignUser(null);
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
            <h3 id="vetting-assign-title" style={{ marginTop: 0 }}>
              Nomination vetting areas — {vettingAssignUser.name}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              This user only vets candidates in the selected nomination electoral areas.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.35rem' }}>
              {areas.map((a) => (
                <label key={a.code} style={{ fontSize: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={vettingAssignCodes.includes(a.code)}
                    onChange={() => toggleVettingAssignCode(a.code)}
                    disabled={vettingAssignSaving}
                  />
                  {a.name} ({a.code})
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={vettingAssignSaving}
                onClick={() => setVettingAssignUser(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={vettingAssignSaving}
                onClick={() => void saveVettingAssignments()}
              >
                {vettingAssignSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {suspendUser ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspend-user-title"
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
            if (!suspendSaving) setSuspendUser(null);
          }}
        >
          <div
            style={{
              background: 'var(--surface, #fff)',
              padding: '1.25rem',
              borderRadius: '10px',
              maxWidth: '28rem',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="suspend-user-title" style={{ marginTop: 0 }}>
              Suspend account — {suspendUser.name}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              The user cannot sign in until the time below. They will see a message telling them when
              they can access the site again.
            </p>
            <div className="form-group">
              <label>Can access site again at</label>
              <input
                className="input"
                type="datetime-local"
                value={suspendUntilInput}
                onChange={(e) => setSuspendUntilInput(e.target.value)}
                disabled={suspendSaving}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={suspendSaving}
                onClick={() => setSuspendUser(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-danger" disabled={suspendSaving} onClick={() => void saveSuspension()}>
                {suspendSaving ? 'Suspending…' : 'Suspend account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
