import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { todayISO, toISODate, dayTypeFor, mondayOf, firstOfMonth, monthMatrix, prettyShort, parseISO, fmtMins } from '../lib/dates';

function pct(done, planned) {
  return !planned ? 0 : Math.round((done / planned) * 100);
}
function goalPct(actual, target) {
  return !target ? 0 : Math.min(100, Math.round((actual / target) * 100));
}

export default function PublicView() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();

  const [code, setCode] = useState(codeParam ? codeParam.toUpperCase() : '');
  const [data, setData] = useState(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [day, setDay] = useState(null); // opened day detail

  const lookup = useCallback(async (raw) => {
    const clean = (raw || '').trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError('');
    setDay(null);

    const now = new Date();
    const monday = mondayOf(now);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { data: res, error: rpcErr } = await supabase.rpc('get_public_progress', {
      p_code: clean,
      p_today: todayISO(),
      p_day_type: dayTypeFor(now),
      p_week_start: toISODate(monday),
      p_week_end: toISODate(sunday),
      p_month_start: toISODate(firstOfMonth(now)),
      p_month_end: toISODate(monthEnd),
    });

    setLoading(false);
    setSearched(true);
    if (rpcErr) { setData(null); setError(rpcErr.message); return; }
    if (!res) { setData(null); setError('No schedule found for that code.'); return; }
    setData(res);
  }, []);

  useEffect(() => {
    if (codeParam) { setCode(codeParam.toUpperCase()); lookup(codeParam); }
  }, [codeParam, lookup]);

  function onSubmit(e) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    navigate(`/view/${clean}`);
    lookup(clean);
  }

  async function openDay(iso) {
    const { data: res } = await supabase.rpc('get_public_day', {
      p_code: code.trim().toUpperCase(),
      p_date: iso,
    });
    if (res) setDay(res);
  }

  const calMap = {};
  (data?.calendar ?? []).forEach((c) => { calMap[c.d] = c; });
  const weeks = monthMatrix(new Date());
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIv = todayISO();
  const curWeekStart = toISODate(mondayOf(new Date()));
  const curMonthStart = toISODate(firstOfMonth(new Date()));

  return (
    <div className="stack-lg">
      <header className="page-head">
        <p className="eyebrow">Shared progress</p>
        <h1 className="display">{data?.owner_name ? `${data.owner_name}’s record` : 'Check in on a schedule'}</h1>
      </header>

      <section className="card stack">
        <p className="muted">Enter a 6-character share code to see how someone&rsquo;s doing.</p>
        <form onSubmit={onSubmit} className="share-form">
          <label className="field grow">
            <span>Share code</span>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123" maxLength={6} autoCapitalize="characters" autoCorrect="off" className="code-input" required />
          </label>
          <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Loading…' : 'Check'}</button>
        </form>
        {error && <p className="muted">{error}</p>}
      </section>

      {data && (
        <>
          <div className="stat-duo">
            <div className="card stat-card">
              <p className="big-stat sm">{pct(data.week?.done, data.week?.planned)}%</p>
              <p className="muted small">This week · {data.week?.done ?? 0}/{data.week?.planned ?? 0}</p>
            </div>
            <div className="card stat-card">
              <p className="big-stat sm">{pct(data.month?.done, data.month?.planned)}%</p>
              <p className="muted small">This month · {data.month?.done ?? 0}/{data.month?.planned ?? 0}</p>
            </div>
          </div>

          {data.goals?.length > 0 && (
            <section className="card stack">
              <h2 className="section-title">Goals</h2>
              {data.goals.map((g, i) => {
                const targetUnit = g.metric === 'hours' ? Number(g.target) * 60 : Number(g.target);
                const pct = !targetUnit ? 0 : Math.min(100, Math.round((Number(g.actual) / targetUnit) * 100));
                const label = g.metric === 'hours'
                  ? `${fmtMins(Number(g.actual))} of ${g.target}h`
                  : `${Number(g.actual)} of ${g.target} done`;
                return (
                  <div key={i} className="stack goal-mini">
                    <div className="goal-head"><span className="activity-title">{g.title}</span><span className="muted small">{g.period} · {pct}%</span></div>
                    <div className="goal-bar"><div className="goal-fill" style={{ width: `${pct}%` }} /></div>
                    <p className="muted small">{label}</p>
                  </div>
                );
              })}
            </section>
          )}

          {(data.reflections?.daily || data.reflections?.weekly || data.reflections?.monthly) && (
            <section className="card stack">
              <h2 className="section-title">Reflections</h2>
              {data.reflections.daily && (<div className="stack-tight"><p className="eyebrow">Today</p><p className="reflection-text">{data.reflections.daily}</p></div>)}
              {data.reflections.weekly && (<div className="stack-tight"><p className="eyebrow">This week</p><p className="reflection-text">{data.reflections.weekly}</p></div>)}
              {data.reflections.monthly && (<div className="stack-tight"><p className="eyebrow">This month</p><p className="reflection-text">{data.reflections.monthly}</p></div>)}
            </section>
          )}

          <section className="stack">
            <h2 className="section-title">This month</h2>
            <div className="cal">
              <div className="cal-head">{dow.map((d) => <span key={d} className="cal-dow">{d}</span>)}</div>
              {weeks.map((week, wi) => (
                <div key={wi} className="cal-row">
                  {week.map((d, di) => {
                    if (!d) return <span key={di} className="cal-cell empty" />;
                    const iso = toISODate(d);
                    const c = calMap[iso] || { done: 0, planned: 0 };
                    const ratio = c.planned ? c.done / c.planned : 0;
                    const lvl = c.done === 0 ? 0 : ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : 1;
                    return (
                      <button key={di} type="button" className={`cal-cell lvl-${lvl} ${iso === todayIv ? 'is-today' : ''}`} onClick={() => openDay(iso)}>
                        <span className="cal-date">{d.getDate()}</span>
                        <span className="cal-score">{c.done}/{c.planned}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          {day && (
            <section className="card stack viewing-card">
              <div className="page-head">
                <p className="eyebrow">{prettyShort(parseISO(day.date))}</p>
                <h3 className="section-title">Day detail</h3>
              </div>
              {(!day.activities || day.activities.length === 0) ? (
                <p className="muted">Nothing recorded this day.</p>
              ) : (
                <ul className="activity-list">
                  {day.activities.map((a, i) => (
                    <li key={i} className={`card activity cat-${a.category} ${a.completed ? 'is-done' : ''}`}>
                      <div className="activity-top">
                        <span className={`check readonly ${a.completed ? 'checked' : ''}`}>{a.completed ? '✓' : ''}</span>
                        <div className="activity-meta">
                          <span className="activity-title">{a.title}</span>
                          <span className="muted small">
                            Planned {a.planned_start || '—'}–{a.planned_end || '—'}
                            {(a.actual_start || a.actual_end) && <>{' · actual '}{a.actual_start || '—'}–{a.actual_end || '—'}</>}
                          </span>
                        </div>
                      </div>
                      {a.note && <p className="view-note">{a.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {day.week_start !== curWeekStart && day.week_reflection && (
                <div className="stack-tight">
                  <p className="eyebrow">Week of {day.week_start}</p>
                  <p className="reflection-text">{day.week_reflection}</p>
                </div>
              )}
              {day.month_start !== curMonthStart && day.month_reflection && (
                <div className="stack-tight">
                  <p className="eyebrow">{parseISO(day.month_start).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
                  <p className="reflection-text">{day.month_reflection}</p>
                </div>
              )}
              <button type="button" className="link-btn" onClick={() => setDay(null)}>Close</button>
            </section>
          )}

          <section className="stack">
            <div className="page-head">
              <p className="eyebrow">Today</p>
              <h2 className="section-title">{(data.today ?? []).filter((a) => a.completed).length}/{(data.today ?? []).length} done</h2>
            </div>
            {(data.today ?? []).length === 0 ? (
              <p className="muted">No activities scheduled for today.</p>
            ) : (
              <ul className="activity-list">
                {data.today.map((a, i) => (
                  <li key={i} className={`card activity cat-${a.category} ${a.completed ? 'is-done' : ''}`}>
                    <div className="activity-top">
                      <span className={`check readonly ${a.completed ? 'checked' : ''}`}>{a.completed ? '✓' : ''}</span>
                      <div className="activity-meta">
                        <span className="activity-title">{a.title}</span>
                        <span className="muted small">
                          Planned {a.planned_start}–{a.planned_end}
                          {(a.actual_start || a.actual_end) && <>{' · actual '}{a.actual_start || '—'}–{a.actual_end || '—'}</>}
                        </span>
                      </div>
                    </div>
                    {a.note && <p className="view-note">{a.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {searched && !data && !error && <p className="muted">Nothing to show.</p>}
      <p className="muted small">Have an account? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
