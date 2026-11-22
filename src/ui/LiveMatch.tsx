import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { repo } from '../db';
import type { PointContext, ReplayResult } from '../domain/scoring';
import { formatSetScores } from '../domain/scoring';
import type { Match, PointDetails, RallyLength, Side } from '../domain/types';
import { describePoint, PLAYER_NAME, situationLabel, type Names } from './labels';
import { detailsOf, loadMatchView } from './matchData';
import { backInput, START, stepInput, type InputAction, type InputState, type RallyEnding } from './pointInput';
import { href, navigate } from './router';
import { Sheet } from './Sheet';
import { useWakeLock } from './useWakeLock';

// ---------------------------------------------------------------------------

function Scoreboard({ r, names }: { r: ReplayResult; names: Names }) {
  const next = r.next;
  const sets = r.final.completedSets;
  const showGames = next && !next.isMatchTiebreak;
  return (
    <table className="scoreboard">
      <tbody>
        {(['elsa', 'opp'] as const).map((side) => (
          <tr key={side} className={side}>
            <th>
              <span className={`serve-dot${next?.server === side ? ' on' : ''}`} aria-label={next?.server === side ? '发球' : undefined} />
              {names[side]}
            </th>
            {sets.map((s, i) => (
              <td key={i} className={`set${s.winner === side ? ' won' : ''}`}>
                {s.matchTiebreak && s.tiebreak ? s.tiebreak[side] : s.games[side]}
                {s.tiebreak && !s.matchTiebreak && s.winner !== side && <sup>{s.tiebreak[side]}</sup>}
              </td>
            ))}
            {showGames && <td className="set current">{r.final.games[side]}</td>}
            {next && <td className="points">{next.pointDisplay[side]}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SituationLine({ ctx, names }: { ctx: PointContext | null; names: Names }) {
  const label = ctx && situationLabel(ctx, names);
  return <div className={`situation${label ? ' on' : ''}`}>{label ?? ' '}</div>;
}

// ---------------------------------------------------------------------------

interface InputProps {
  ctx: PointContext;
  names: Names;
  mode: Match['recordingMode'];
  input: InputState;
  rally: RallyLength | null;
  onRally: (r: RallyLength | null) => void;
  onAction: (a: InputAction) => void;
  onQuick: (winner: Side) => void;
}

const RALLY_LABEL: Record<RallyLength, string> = { short: '短 1-4', medium: '中 5-8', long: '长 9+' };
const RALLY_ENDINGS: { ending: RallyEnding; label: string; cls: string }[] = [
  { ending: 'winner', label: '制胜分', cls: 'good' },
  { ending: 'unforced_error', label: '非受迫失误', cls: 'bad' },
  { ending: 'forced_error', label: '受迫失误', cls: 'meh' },
];

function InputPanel({ ctx, names, mode, input, rally, onRally, onAction, onQuick }: InputProps) {
  if (mode === 'quick') {
    return (
      <div className="input quick">
        <p className="prompt">{names[ctx.server]} 发球 · 这一分谁赢？</p>
        <div className="grid2 tall">
          <button className="side-elsa" onClick={() => onQuick('elsa')}>
            {names.elsa} 得分
          </button>
          <button className="side-opp" onClick={() => onQuick('opp')}>
            {names.opp} 得分
          </button>
        </div>
      </div>
    );
  }

  if (input.step === 'rally') {
    return (
      <div className="input">
        <p className="prompt">
          {input.firstServeIn ? '一发进' : '二发进'} · 这一分怎么结束？
        </p>
        <div className="chips" role="group" aria-label="回合长度（可选）">
          {(Object.keys(RALLY_LABEL) as RallyLength[]).map((k) => (
            <button key={k} className={rally === k ? 'on' : ''} onClick={() => onRally(rally === k ? null : k)}>
              {RALLY_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="grid2 endings">
          {(['elsa', 'opp'] as const).map((side) => (
            <div key={side} className={`col side-${side}`}>
              <div className="col-head">{names[side]}</div>
              {RALLY_ENDINGS.map((e) => (
                <button key={e.ending} className={e.cls} onClick={() => onAction({ type: 'end', ending: e.ending, endedBy: side })}>
                  {e.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const first = input.step === 'first';
  return (
    <div className="input">
      <p className="prompt">
        {names[ctx.server]} 发球 · {first ? '一发' : '二发'}
      </p>
      <div className="grid2 tall">
        <button className="good" onClick={() => onAction({ type: 'serve', result: 'in' })}>
          {first ? '一发进' : '二发进'}
        </button>
        <button className="bad" onClick={() => onAction({ type: 'serve', result: first ? 'fault' : 'double_fault' })}>
          {first ? '一发失误' : '双误'}
        </button>
      </div>
      <div className="grid2">
        <button className="secondary" onClick={() => onAction({ type: 'serve', result: 'ace' })}>
          ACE
        </button>
        <button className="secondary" onClick={() => onAction({ type: 'serve', result: 'service_winner' })}>
          发球直接得分
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

export function LiveMatch({ id }: { id: string }) {
  const loaded = useLiveQuery(() => loadMatchView(id), [id]);
  const [input, setInput] = useState<InputState>(START);
  const [rally, setRally] = useState<RallyLength | null>(null);
  const [toast, setToast] = useState('');
  const [sheet, setSheet] = useState<null | 'menu' | 'note'>(null);
  const [noteText, setNoteText] = useState('');
  const busy = useRef(false);

  const ok = loaded?.kind === 'ok' ? loaded : null;
  const match = ok?.data.match;
  const pointCount = ok?.data.points.length ?? 0;
  useWakeLock(match?.status === 'in_progress');

  // A new or removed point starts a fresh input sequence.
  useEffect(() => {
    setInput(START);
    setRally(null);
  }, [pointCount]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loaded === undefined) return null;
  if (loaded.kind !== 'ok') {
    return (
      <main>
        <div className="card">
          <p>{loaded.kind === 'missing' ? '找不到这场比赛，可能已经被删除。' : `数据有问题：${loaded.message}`}</p>
          <a className="button" href={href({ name: 'home' })}>
            返回首页
          </a>
        </div>
      </main>
    );
  }

  const { data, opponent } = loaded;
  const m = data.match;
  const r = data.replay;
  const names: Names = { elsa: PLAYER_NAME, opp: opponent?.name ?? '对手' };
  const last = data.points[data.points.length - 1];

  async function run(fn: () => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  }

  const commit = (details: PointDetails) =>
    run(() => repo.addPoint(m.id, rally ? { ...details, rallyLength: rally } : details));

  function onAction(a: InputAction) {
    if (!r.next) return;
    const out = stepInput(input, a, r.next.server);
    if ('commit' in out) commit(out.commit);
    else setInput(out.state);
  }

  function onUndo() {
    const back = backInput(input);
    if (back) {
      setInput(back);
      return;
    }
    if (!last) return;
    run(async () => {
      await repo.undoLastPoint(m.id);
      setToast(`已撤销：${describePoint(last, names)}`);
    });
  }

  function openNote() {
    if (!last) return setToast('还没有记分，备注会加在上一分上');
    setNoteText(last.note ?? '');
    setSheet('note');
  }

  function saveNote() {
    if (!last) return;
    const note = noteText.trim();
    run(async () => {
      await repo.updatePoint(last.id, { ...detailsOf(last), note: note || undefined });
      setSheet(null);
    });
  }

  function endMatch(status: 'retired' | 'abandoned', side?: Side) {
    run(async () => {
      await repo.endMatch(m.id, status, side);
      setSheet(null);
    });
  }

  function toggleMode() {
    run(async () => {
      await repo.updateMatchInfo(m.id, { recordingMode: m.recordingMode === 'quick' ? 'standard' : 'quick' });
      setSheet(null);
    });
  }

  function deleteMatch() {
    if (!confirm(`删除这场比赛和全部 ${data.points.length} 分记录？删除后无法恢复。`)) return;
    run(async () => {
      await repo.deleteMatch(m.id);
      navigate({ name: 'home' }, true);
    });
  }

  const finished = m.status !== 'in_progress';
  const setScores = formatSetScores(r.final.completedSets);

  return (
    <div className="live">
      <header className="live-head">
        <a href={href({ name: 'home' })} aria-label="返回首页">
          ‹ 首页
        </a>
        <span className="live-title">
          {names.elsa} vs {names.opp}
        </span>
        <span className="head-actions">
          <a href={href({ name: 'stats', id: m.id })}>统计</a>
          <button className="link" onClick={() => setSheet('menu')} aria-label="菜单">
            ⋯
          </button>
        </span>
      </header>

      <Scoreboard r={r} names={names} />
      <SituationLine ctx={r.next} names={names} />

      {toast && <div className="toast" role="status">{toast}</div>}

      {finished ? (
        <div className="card result">
          {m.status === 'completed' ? (
            <>
              <h2>{names[r.final.winner!]} 获胜</h2>
              <p className="big-score">{setScores}</p>
            </>
          ) : (
            <>
              <h2>{m.status === 'retired' ? `${names[m.retiredSide!]} 退赛` : '比赛中止'}</h2>
              <p className="big-score">{formatSetScores(r.final.completedSets, r.final) || '0-0'}</p>
              <button className="primary" onClick={() => run(() => repo.resumeMatch(m.id))}>
                恢复记分
              </button>
            </>
          )}
          <a className="button primary" href={href({ name: 'stats', id: m.id })}>
            查看统计
          </a>
          <p className="muted">共 {data.points.length} 分</p>
        </div>
      ) : (
        r.next && (
          <InputPanel
            ctx={r.next}
            names={names}
            mode={m.recordingMode}
            input={input}
            rally={rally}
            onRally={setRally}
            onAction={onAction}
            onQuick={(winner) => commit({ winner })}
          />
        )
      )}

      <div className="last-point">
        {last ? (
          <>
            上一分：{describePoint(last, names)}
            {last.note && <span className="note-mark"> · 📝 {last.note}</span>}
          </>
        ) : (
          '还没有记分'
        )}
      </div>

      <footer className="live-foot">
        <button className="secondary" onClick={onUndo} disabled={m.status !== 'completed' && finished}>
          ↶ {input.step !== 'first' && !finished ? '返回' : '撤销'}
        </button>
        <button className="secondary" onClick={openNote} disabled={!last}>
          📝 备注
        </button>
      </footer>

      {sheet === 'note' && (
        <Sheet title="给上一分加备注" onClose={() => setSheet(null)}>
          <p className="muted">{last && describePoint(last, names)}</p>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="例如：对手开始放慢节奏、Elsa 腿抽筋…"
            autoFocus
          />
          <div className="row">
            <button className="secondary" onClick={() => setSheet(null)}>
              取消
            </button>
            <button className="primary grow" onClick={saveNote}>
              保存
            </button>
          </div>
        </Sheet>
      )}

      {sheet === 'menu' && (
        <Sheet title="比赛选项" onClose={() => setSheet(null)}>
          <div className="menu">
            {m.status === 'in_progress' && (
              <>
                <button className="secondary" onClick={toggleMode}>
                  切换到{m.recordingMode === 'quick' ? '标准记录（发球 + 结束方式）' : '快速记录（只记谁赢）'}
                </button>
                <button className="secondary" onClick={() => endMatch('retired', 'opp')}>
                  {names.opp} 退赛
                </button>
                <button className="secondary" onClick={() => endMatch('retired', 'elsa')}>
                  {names.elsa} 退赛
                </button>
                <button className="secondary" onClick={() => endMatch('abandoned')}>
                  比赛中止（下雨、时间到…）
                </button>
              </>
            )}
            <button className="danger" onClick={deleteMatch}>
              删除这场比赛
            </button>
            <button className="secondary" onClick={() => setSheet(null)}>
              关闭
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
