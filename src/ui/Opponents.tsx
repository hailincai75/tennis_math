import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { repo } from '../db';
import { headToHead, metricByKey, metricOver, type MatchRecord } from '../domain/analysis';
import type { Opponent } from '../domain/types';
import { Insights, TrendCard } from './Analysis';
import { loadAllData } from './allData';
import { errorText } from './matchData';
import { PLAYER_NAME } from './labels';
import { href, navigate } from './router';

const HAND_LABEL = { R: '右手', L: '左手' } as const;

export function Opponents() {
  const data = useLiveQuery(loadAllData, []);
  if (!data) return null;
  const h2h = headToHead(data.opponents, data.records);
  return (
    <main>
      {h2h.length === 0 ? (
        <section className="card empty">
          <h2>还没有对手</h2>
          <p>新建比赛时会自动加入对手。</p>
        </section>
      ) : (
        <ul className="match-list">
          {h2h.map((h) => (
            <li key={h.opponent.id}>
              <a className="match-row" href={href({ name: 'opponent', id: h.opponent.id })}>
                <div className="match-main">
                  <div className="match-title">{h.opponent.name}</div>
                  <div className="match-meta">
                    {[h.opponent.hand && HAND_LABEL[h.opponent.hand], h.opponent.utr && `UTR ${h.opponent.utr}`, h.opponent.club]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                </div>
                <div className="match-side">
                  <div className="match-score">
                    {h.wins}-{h.losses}
                  </div>
                  <span className="tag">{h.lastDate ? `最近 ${h.lastDate}` : '没有比赛'}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function EditOpponent({ opponent, canDelete }: { opponent: Opponent; canDelete: boolean }) {
  const [name, setName] = useState(opponent.name);
  const [hand, setHand] = useState<'' | 'R' | 'L'>(opponent.hand ?? '');
  const [utr, setUtr] = useState(opponent.utr?.toString() ?? '');
  const [club, setClub] = useState(opponent.club ?? '');
  const [notes, setNotes] = useState(opponent.notes ?? '');
  const [msg, setMsg] = useState('');

  async function save() {
    const u = utr.trim() ? Number(utr) : undefined;
    if (u !== undefined && (Number.isNaN(u) || u < 0 || u > 17)) return setMsg('UTR 应该是 0-16.5 之间的数字');
    try {
      await repo.updateOpponent(opponent.id, {
        name,
        hand: hand || undefined,
        utr: u,
        club: club.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setMsg('已保存');
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  async function remove() {
    if (!confirm(`删除对手 ${opponent.name}？`)) return;
    try {
      await repo.deleteOpponent(opponent.id);
      navigate({ name: 'opponents' }, true);
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  return (
    <details className="card">
      <summary className="card-title">对手资料</summary>
      <div className="form">
        <label>
          名字
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row">
          <label className="grow">
            持拍手
            <select value={hand} onChange={(e) => setHand(e.target.value as '' | 'R' | 'L')}>
              <option value="">不确定</option>
              <option value="R">右手</option>
              <option value="L">左手</option>
            </select>
          </label>
          <label className="grow">
            UTR
            <input inputMode="decimal" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="可选" />
          </label>
        </div>
        <label>
          俱乐部 / 学校
          <input value={club} onChange={(e) => setClub(e.target.value)} placeholder="可选" />
        </label>
        <label>
          备注（打法、习惯…）
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="例如：反手弱，喜欢放小球" />
        </label>
        {msg && <p className="muted">{msg}</p>}
        <div className="row">
          {canDelete && (
            <button className="danger" onClick={remove}>
              删除
            </button>
          )}
          <button className="primary grow" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </details>
  );
}

function MatchList({ records }: { records: MatchRecord[] }) {
  return (
    <ul className="match-list">
      {[...records].reverse().map((r) => (
        <li key={r.match.id}>
          <a
            className="match-row"
            href={href({ name: r.match.status === 'in_progress' ? 'match' : 'stats', id: r.match.id })}
          >
            <div className="match-main">
              <div className="match-title">{r.match.date}</div>
              <div className="match-meta">{[r.match.event, r.match.round].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <div className="match-side">
              <div className="match-score">{r.score}</div>
              {r.result && <span className={`tag ${r.result === 'elsa' ? 'win' : 'loss'}`}>{r.result === 'elsa' ? '胜' : '负'}</span>}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function OpponentDetail({ id }: { id: string }) {
  const data = useLiveQuery(loadAllData, []);
  if (!data) return null;
  const opponent = data.opponents.find((o) => o.id === id);
  if (!opponent) {
    return (
      <main>
        <div className="card">
          <p>找不到这个对手。</p>
          <a className="button" href={href({ name: 'opponents' })}>
            返回对手列表
          </a>
        </div>
      </main>
    );
  }
  const h = headToHead([opponent], data.records)[0];
  const keys = ['pointsWon', 'firstServeIn', 'secondServeWon', 'ueRate', 'breakPointsSaved', 'breakPointsConverted'];
  const played = h.records.filter((r) => r.stats.totalPoints > 0);

  return (
    <main>
      <section className="card summary">
        <div className="summary-result">
          {PLAYER_NAME} vs {opponent.name}
        </div>
        <div className="big-score">
          {h.wins}-{h.losses}
        </div>
        <div className="muted">共 {h.records.length} 场</div>
        {opponent.notes && <p className="note-box">📝 {opponent.notes}</p>}
      </section>

      {played.length > 0 && (
        <section className="card">
          <h3 className="card-title">对这个对手</h3>
          <table className="stat-table">
            <thead>
              <tr>
                <th />
                <th className="elsa">{PLAYER_NAME}</th>
                <th className="opp">{opponent.name}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const m = metricByKey(k);
                const e = metricOver(m, played, 'elsa');
                const o = metricOver(m, played, 'opp');
                if (e === null && o === null) return null;
                const f = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
                return (
                  <tr key={k}>
                    <th>{m.label}</th>
                    <td>{f(e)}</td>
                    <td>{f(o)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {played.length >= 2 && <TrendCard records={played} />}
      {played.length >= 6 && <Insights records={played} />}

      <MatchList records={h.records} />
      <EditOpponent key={opponent.id} opponent={opponent} canDelete={h.records.length === 0} />
    </main>
  );
}
