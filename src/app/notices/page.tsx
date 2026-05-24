'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/dashboard/AppShell';

type PollOption = { id: string; label: string; count: number; pct: number };

type Notice = {
  id: string;
  title: string;
  body: string;
  hasPoll: boolean;
  publishedAt: string;
  expiresAt: string | null;
  options: PollOption[];
  totalVotes: number;
  myOptionId: string | null;
  pollClosed: boolean;
};

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [votingId, setVotingId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [hasPoll, setHasPoll] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [pollOptions, setPollOptions] = useState(['Yes', 'No']);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/notices', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not load notices.');
        return;
      }
      setNotices(data.notices ?? []);
      setIsAdmin(Boolean(data.isAdmin));
    } catch {
      setError('Could not load notices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const vote = async (noticeId: string, optionId: string) => {
    setVotingId(noticeId);
    setError('');
    try {
      const res = await fetch(`/api/notices/${noticeId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Vote failed.');
        return;
      }
      if (data.notice) {
        setNotices((prev) => prev.map((n) => (n.id === noticeId ? data.notice : n)));
      } else {
        await load();
      }
    } finally {
      setVotingId(null);
    }
  };

  const createNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          hasPoll,
          expiresAt: expiresAt || null,
          options: hasPoll ? pollOptions.map((label) => ({ label })) : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not create notice.');
        return;
      }
      setShowCreate(false);
      setTitle('');
      setBody('');
      setHasPoll(false);
      setExpiresAt('');
      setPollOptions(['Yes', 'No']);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const archiveNotice = async (id: string) => {
    if (!window.confirm('Archive this notice? It will no longer show to users.')) return;
    const res = await fetch(`/api/notices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    if (res.ok) await load();
  };

  return (
    <AppShell activeHref="/notices">
      <div className="notice-poll-page">
        <header className="notice-poll-header">
          <div>
            <h1>Notices &amp; polls</h1>
            <p>Official announcements and quick polls for all portal users.</p>
          </div>
          {isAdmin ? (
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Cancel' : 'New notice'}
            </button>
          ) : null}
        </header>

        {error ? <div className="error">{error}</div> : null}

        {showCreate && isAdmin ? (
          <section className="notice-poll-create section">
            <h2 className="section-title">Create notice</h2>
            <form onSubmit={(e) => void createNotice(e)}>
              <div className="form-group">
                <label>Title</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea
                  className="input"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Expires (optional)</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <label className="ea-check-label" style={{ marginBottom: '0.75rem' }}>
                <input type="checkbox" checked={hasPoll} onChange={(e) => setHasPoll(e.target.checked)} />
                Include a poll
              </label>
              {hasPoll ? (
                <div className="notice-poll-options-edit">
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="form-group" style={{ marginBottom: '0.5rem' }}>
                      <label>Option {i + 1}</label>
                      <input
                        className="input"
                        value={opt}
                        onChange={(e) => {
                          const next = [...pollOptions];
                          next[i] = e.target.value;
                          setPollOptions(next);
                        }}
                        required
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPollOptions((p) => [...p, `Option ${p.length + 1}`])}
                  >
                    Add option
                  </button>
                </div>
              ) : null}
              <div className="form-actions" style={{ marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Publishing…' : 'Publish notice'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {loading ? (
          <p className="notice-poll-empty">Loading notices…</p>
        ) : notices.length === 0 ? (
          <p className="notice-poll-empty">No active notices right now.</p>
        ) : (
          <div className="notice-poll-list">
            {notices.map((n) => (
              <article key={n.id} className="notice-poll-card">
                <div className="notice-poll-card-head">
                  <h2>{n.title}</h2>
                  <time dateTime={n.publishedAt}>
                    {new Date(n.publishedAt).toLocaleString('en-GH', { timeZone: 'Africa/Accra' })}
                  </time>
                </div>
                <p className="notice-poll-body">{n.body}</p>
                {n.expiresAt ? (
                  <p className="notice-poll-meta">
                    {n.pollClosed ? 'Poll closed' : `Active until ${new Date(n.expiresAt).toLocaleString('en-GH', { timeZone: 'Africa/Accra' })}`}
                  </p>
                ) : null}

                {n.hasPoll && n.options.length > 0 ? (
                  <div className="notice-poll-vote-block">
                    <h3>Poll{n.totalVotes > 0 ? ` · ${n.totalVotes} vote${n.totalVotes === 1 ? '' : 's'}` : ''}</h3>
                    {n.myOptionId ? (
                      <p className="notice-poll-voted">You voted. Results update as others respond.</p>
                    ) : (
                      <p className="notice-poll-voted">Select one option to vote.</p>
                    )}
                    <ul className="notice-poll-options">
                      {n.options.map((o) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            className={`notice-poll-option${n.myOptionId === o.id ? ' selected' : ''}`}
                            disabled={votingId === n.id || n.pollClosed}
                            onClick={() => void vote(n.id, o.id)}
                          >
                            <span>{o.label}</span>
                            {n.myOptionId || n.totalVotes > 0 ? (
                              <span className="notice-poll-bar-wrap">
                                <span className="notice-poll-bar" style={{ width: `${o.pct}%` }} />
                                <span className="notice-poll-pct">{o.count} ({o.pct}%)</span>
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {isAdmin ? (
                  <div className="notice-poll-admin-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void archiveNotice(n.id)}>
                      Archive
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
