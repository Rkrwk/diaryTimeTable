import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function hhmm(value) {
  return value ? value.slice(0, 5) : '';
}

// Display label for a profile: prefer display name, fall back to username.
function nameOf(p) {
  return p?.display_name || p?.username || 'Someone';
}

export default function Shared() {
  const { user } = useAuth();

  const [myCode, setMyCode] = useState('');
  const [outgoing, setOutgoing] = useState([]); // people I share with
  const [incoming, setIncoming] = useState([]); // people who share with me
  const [code, setCode] = useState('');
  const [permission, setPermission] = useState('view');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // read-only view of someone else's schedule
  const [viewing, setViewing] = useState(null); // { owner, activities }

  const load = useCallback(async () => {
    setLoading(true);
    const [meRes, outRes, inRes] = await Promise.all([
      supabase.from('profiles').select('share_code').eq('id', user.id).maybeSingle(),
      supabase
        .from('shares')
        .select('id, permission, viewer_id, profiles!shares_viewer_id_fkey (id, username, display_name)')
        .eq('owner_id', user.id),
      supabase
        .from('shares')
        .select('id, permission, owner_id, profiles!shares_owner_id_fkey (id, username, display_name)')
        .eq('viewer_id', user.id),
    ]);
    setMyCode(meRes.data?.share_code ?? '');
    setOutgoing(outRes.data ?? []);
    setIncoming(inRes.data ?? []);
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const publicLink = myCode ? `${window.location.origin}/view/${myCode}` : '';

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(myCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked; ignore silently
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // clipboard may be blocked; ignore silently
    }
  }

  async function shareWith(e) {
    e.preventDefault();
    setMessage('');
    const target = code.trim().toUpperCase();
    if (!target) return;
    setBusy(true);

    const { data: profile, error: lookupErr } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('share_code', target)
      .maybeSingle();

    if (lookupErr) {
      setBusy(false);
      setMessage(lookupErr.message);
      return;
    }
    if (!profile) {
      setBusy(false);
      setMessage('No one has that code. Double-check the 6 characters.');
      return;
    }
    if (profile.id === user.id) {
      setBusy(false);
      setMessage('That is your own code — no need to share with yourself.');
      return;
    }

    const { error } = await supabase.from('shares').upsert(
      { owner_id: user.id, viewer_id: profile.id, permission },
      { onConflict: 'owner_id,viewer_id' }
    );

    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setCode('');
    setMessage(`Shared with ${profile.username}.`);
    load();
  }

  async function updatePermission(id, newPermission) {
    const { error } = await supabase
      .from('shares')
      .update({ permission: newPermission })
      .eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  async function removeShare(id) {
    const { error } = await supabase.from('shares').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  async function viewSchedule(owner) {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('owner_id', owner.id)
      .is('entry_date', null)
      .order('day_type', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) {
      alert(error.message);
      return;
    }
    setViewing({ owner, activities: data ?? [] });
  }

  if (loading) return <p className="muted loading-state">Loading…</p>;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <p className="eyebrow">Access</p>
        <h1 className="display">Sharing</h1>
      </header>

      <section className="card stack">
        <h2 className="section-title">Your share code</h2>
        <p className="muted">
          Give this code to someone with an account, or send the link below to
          anyone — the link opens a read-only view with no login needed.
        </p>
        <div className="code-row">
          <span className="share-code">{myCode || '——————'}</span>
          <button type="button" className="btn" onClick={copyCode} disabled={!myCode}>
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
        {publicLink && (
          <div className="code-row">
            <span className="public-link">{publicLink}</span>
            <button type="button" className="btn" onClick={copyLink}>
              {linkCopied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 className="section-title">Give someone access</h2>
        <p className="muted">Enter their 6-character code and choose what they can do.</p>
        <form onSubmit={shareWith} className="share-form">
          <label className="field grow">
            <span>Their code</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              className="code-input"
              required
            />
          </label>
          <label className="field">
            <span>Permission</span>
            <select value={permission} onChange={(e) => setPermission(e.target.value)}>
              <option value="view">View</option>
              <option value="edit">Edit</option>
            </select>
          </label>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Sharing…' : 'Share'}
          </button>
        </form>
        {message && <p className="muted">{message}</p>}

        {outgoing.length > 0 && (
          <ul className="share-list">
            {outgoing.map((s) => {
              const p = s.profiles;
              return (
                <li key={s.id} className="share-row">
                  <div className="template-meta">
                    <span className="activity-title">{nameOf(p)}</span>
                    <span className="muted small">@{p?.username}</span>
                  </div>
                  <div className="share-actions">
                    <select
                      value={s.permission}
                      onChange={(e) => updatePermission(s.id, e.target.value)}
                    >
                      <option value="view">View</option>
                      <option value="edit">Edit</option>
                    </select>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => removeShare(s.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card stack">
        <h2 className="section-title">Shared with you</h2>
        {incoming.length === 0 ? (
          <p className="muted">No one has shared their schedule with you yet.</p>
        ) : (
          <ul className="share-list">
            {incoming.map((s) => {
              const p = s.profiles;
              return (
                <li key={s.id} className="share-row">
                  <div className="template-meta">
                    <span className="activity-title">{nameOf(p)}</span>
                    <span className="muted small">
                      @{p?.username} · {s.permission}
                    </span>
                  </div>
                  <button type="button" className="btn" onClick={() => viewSchedule(p)}>
                    View schedule
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {viewing && (
          <div className="card viewing-card">
            <div className="page-head">
              <p className="eyebrow">Read-only</p>
              <h3 className="section-title">{nameOf(viewing.owner)}&rsquo;s schedule</h3>
            </div>
            {viewing.activities.length === 0 ? (
              <p className="muted">No activities to show.</p>
            ) : (
              ['weekday', 'weekend'].map((dt) => {
                const rows = viewing.activities.filter((a) => a.day_type === dt);
                if (rows.length === 0) return null;
                return (
                  <div key={dt} className="stack">
                    <h4 className="muted small upper">{dt}</h4>
                    <ul className="template-list">
                      {rows.map((a) => (
                        <li key={a.id} className={`card template-row cat-${a.category}`}>
                          <div className="template-meta">
                            <span className="activity-title">{a.title}</span>
                            <span className="muted small">
                              {hhmm(a.planned_start)}–{hhmm(a.planned_end)} · {a.category}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
            <button type="button" className="link-btn" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
