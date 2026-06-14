import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { fmtMins } from '../lib/dates';
import { loadGoalActual, goalTargetUnit, goalPctOf } from '../lib/goalProgress';

const emptyForm = { title: '', period_type: 'weekly', metric: 'hours', target: '' };

function progressLabel(goal, actual) {
  if (goal.metric === 'hours') return `${fmtMins(actual)} of ${goal.target}h`;
  return `${actual} of ${goal.target} done`;
}

export default function Goals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [actuals, setActuals] = useState({}); // goalId -> actual
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true });
    const list = data ?? [];
    setGoals(list);
    const entries = await Promise.all(
      list.map(async (g) => [g.id, await loadGoalActual(supabase, user.id, g)])
    );
    setActuals(Object.fromEntries(entries));
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addGoal(e) {
    e.preventDefault();
    const target = parseFloat(form.target);
    if (!form.title.trim() || !Number.isFinite(target) || target <= 0) return;
    setBusy(true);
    const { error } = await supabase.from('goals').insert({
      owner_id: user.id,
      title: form.title.trim(),
      period_type: form.period_type,
      metric: form.metric,
      target,
    });
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setForm(emptyForm);
    load();
  }

  async function removeGoal(id) {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  return (
    <div className="stack-lg">
      <header className="page-head">
        <p className="eyebrow">Targets</p>
        <h1 className="display">Goals</h1>
      </header>

      <form onSubmit={addGoal} className="card add-form">
        <h2 className="section-title">Add a goal</h2>
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Exercise" required />
          </label>
          <label className="field">
            <span>Period</span>
            <select value={form.period_type} onChange={(e) => setForm({ ...form, period_type: e.target.value })}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="field">
            <span>Measure</span>
            <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
              <option value="hours">Total hours</option>
              <option value="count">Times completed</option>
            </select>
          </label>
          <label className="field">
            <span>Target ({form.metric === 'hours' ? 'hours' : 'times'})</span>
            <input type="number" min="0" step={form.metric === 'hours' ? '0.5' : '1'} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="0" required />
          </label>
        </div>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add goal'}</button>
      </form>

      {loading ? (
        <p className="muted loading-state">Loading…</p>
      ) : goals.length === 0 ? (
        <p className="muted">No goals yet. Add one above, then tag activities to it on the Today page.</p>
      ) : (
        <ul className="goal-list">
          {goals.map((g) => {
            const actual = actuals[g.id] ?? 0;
            const pct = goalPctOf(actual, g);
            return (
              <li key={g.id} className="card stack goal-card">
                <div className="goal-head">
                  <div className="template-meta">
                    <span className="activity-title">{g.title}</span>
                    <span className="muted small">{g.period_type} · {g.metric === 'hours' ? 'hours' : 'completions'}</span>
                  </div>
                  <button type="button" className="link-btn danger" onClick={() => removeGoal(g.id)}>Remove</button>
                </div>
                <div className="goal-bar"><div className="goal-fill" style={{ width: `${pct}%` }} /></div>
                <p className="muted small">{progressLabel(g, actual)} ({pct}%) · this {g.period_type === 'weekly' ? 'week' : 'month'}</p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="muted small">Tip: assign a goal to an activity when you add it on the Today page — every time you complete or log time on that activity, it counts here.</p>
    </div>
  );
}
