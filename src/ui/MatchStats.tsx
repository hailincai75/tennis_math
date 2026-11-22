import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { formatSetScores, type ReplayResult } from '../domain/scoring';
import { computeMatchStats, type MatchStats as Stats } from '../domain/stats';
import type { Point } from '../domain/types';
import { describePoint, PLAYER_NAME, STATUS_LABEL, SURFACE_LABEL, type Names } from './labels';
import { LineChart, type ChartDatum } from './LineChart';
import { loadMatchView } from './matchData';
import { PointEditor } from './PointEditor';
import { ShareSheet } from './ShareSheet';
import { href } from './router';
import { formatStat, visibleSections } from './statRows';

function StatTable({ stats, names }: { stats: Stats; names: Names }) {
  return (
    <section className="card">
      <table className="stat-table">
        <thead>
          <tr>
            <th />
            <th className="elsa">{names.elsa}</th>
            <th className="opp">{names.opp}</th>
          </tr>
        </thead>
        {visibleSections(stats).map((sec) => (
          <tbody key={sec.title}>
            <tr className="section">
              <th colSpan={3}>{sec.title}</th>
            </tr>
            {sec.rows.map(({ row, elsa, opp, better }) => (
              <tr key={row.key}>
                <th>{row.label}</th>
                <td className={better === 'elsa' ? 'better' : ''}>{formatStat(elsa)}</td>
                <td className={better === 'opp' ? 'better' : ''}>{formatStat(opp)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}

function Momentum({ stats, r, names }: { stats: Stats; r: ReplayResult; names: Names }) {
  const data: ChartDatum[] = stats.momentum.map((m) => {
    const ctx = r.contexts[m.index];
    const lead = m.diff === 0 ? '持平' : `${m.diff > 0 ? names.elsa : names.opp} 多赢 ${Math.abs(m.diff)} 分`;
    return {
      x: m.index + 1,
      y: m.diff,
      tip: `第 ${m.index + 1} 分 · 第 ${ctx.setIndex + 1} 盘\n${names[m.winner]} 得分${m.breakPoint ? '（破发点）' : ''}\n${lead}`,
      marker: m.breakPoint ? m.winner : undefined,
    };
  });
  const separators = r.contexts
    .filter((c, i) => i > 0 && c.setIndex !== r.contexts[i - 1].setIndex)
    .map((c) => ({ x: c.index + 0.5, label: `第${c.setIndex + 1}盘` }));
  return (
    <section className="card">
      <h3 className="card-title">势头</h3>
      <p className="muted small">累计得分差（每赢一分 +1，每丢一分 −1）。圆点是破发点，颜色表示谁赢了那一分。</p>
      <LineChart
        data={data}
        zeroLine
        halfLabels={[`${names.elsa} 领先`, `${names.opp} 领先`]}
        separators={separators}
        yFormat={(y) => String(Math.abs(y))}
        ariaLabel="比赛势头图"
      />
      <div className="legend">
        <span>
          <i className="dot elsa" /> {names.elsa} 赢的破发点
        </span>
        <span>
          <i className="dot opp" /> {names.opp} 赢的破发点
        </span>
      </div>
    </section>
  );
}

function PointList({ points, r, names, onEdit }: { points: Point[]; r: ReplayResult; names: Names; onEdit: (p: Point) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <button className="link-row" onClick={() => setOpen(!open)}>
        <span className="card-title">逐分记录（{points.length} 分）</span>
        <span>{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <>
          <p className="muted small">点任意一分可以修改，后面的比分会自动重新计算。</p>
          {r.games.map((g) => {
            const gameScore = r.contexts[g.lastPoint];
            const gamesBefore = gameScore.score.games;
            return (
              <div key={g.index} className="game-block">
                <div className="game-head">
                  第 {g.setIndex + 1} 盘 · {g.isMatchTiebreak ? '抢十' : g.isTiebreak ? '抢七' : `${gamesBefore.elsa}-${gamesBefore.opp} 后`} ·{' '}
                  {names[g.server]} 发球
                  {g.winner && (
                    <span className={`tag ${g.winner === g.server ? '' : 'loss'}`}>
                      {names[g.winner]} {g.isTiebreak ? '赢' : g.winner === g.server ? '保发' : '破发'}
                    </span>
                  )}
                </div>
                {points.slice(g.firstPoint, g.lastPoint + 1).map((p) => {
                  const ctx = r.contexts[p.seq];
                  return (
                    <button key={p.id} className="point-row" onClick={() => onEdit(p)}>
                      <span className="pt-score">
                        {ctx.pointDisplay.elsa}-{ctx.pointDisplay.opp}
                      </span>
                      <span className={`pt-desc ${p.winner}`}>
                        {describePoint(p, names)}
                        {ctx.isBreakPoint && <b> · 破发点</b>}
                        {p.note && <em> · 📝 {p.note}</em>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

export function MatchStats({ id }: { id: string }) {
  const loaded = useLiveQuery(() => loadMatchView(id), [id]);
  const [editing, setEditing] = useState<Point | null>(null);
  const [sharing, setSharing] = useState(false);
  const stats = useMemo(
    () => (loaded?.kind === 'ok' ? computeMatchStats(loaded.data.points, loaded.data.replay) : null),
    [loaded],
  );

  if (loaded === undefined) return null;
  if (loaded.kind !== 'ok' || !stats) {
    return (
      <main>
        <div className="card">
          <p>{loaded.kind === 'missing' ? '找不到这场比赛。' : loaded.kind === 'error' ? `数据有问题：${loaded.message}` : ''}</p>
          <a className="button" href={href({ name: 'home' })}>
            返回首页
          </a>
        </div>
      </main>
    );
  }

  const { match: m, points, replay: r } = loaded.data;
  const names: Names = { elsa: PLAYER_NAME, opp: loaded.opponent?.name ?? '对手' };
  const namesEn: Names = { elsa: PLAYER_NAME, opp: loaded.opponent?.name ?? 'Opponent' };
  const result =
    m.status === 'completed'
      ? `${names[r.final.winner!]} 获胜`
      : m.status === 'retired'
        ? `${names[m.retiredSide!]} 退赛`
        : STATUS_LABEL[m.status];
  const meta = [m.date, m.event, m.round, m.surface && SURFACE_LABEL[m.surface]].filter(Boolean).join(' · ');

  return (
    <div className="page">
      <header className="live-head">
        <a href={href({ name: 'home' })}>‹ 首页</a>
        <span className="live-title">
          {names.elsa} vs {names.opp}
        </span>
        <span className="head-actions">
          {points.length > 0 && (
            <button className="link small-link" onClick={() => setSharing(true)}>
              分享
            </button>
          )}
          <a href={href({ name: 'match', id: m.id })}>{m.status === 'in_progress' ? '记分' : '比分牌'}</a>
        </span>
      </header>
      <main>
        <section className="card summary">
          <div className="summary-result">{result}</div>
          <div className="big-score">{formatSetScores(r.final.completedSets, r.final) || '0-0'}</div>
          <div className="muted">{meta}</div>
          <div className="muted small">
            共 {stats.totalPoints} 分
            {stats.detailedPoints < stats.totalPoints &&
              ` · 其中 ${stats.totalPoints - stats.detailedPoints} 分是快速记录（没有发球和结束方式）`}
          </div>
        </section>

        {points.length > 0 && (
          <>
            <StatTable stats={stats} names={names} />
            <Momentum stats={stats} r={r} names={names} />
            <PointList points={points} r={r} names={names} onEdit={setEditing} />
          </>
        )}
      </main>

      {sharing && (
        <ShareSheet match={m} replay={r} stats={stats} names={namesEn} onClose={() => setSharing(false)} />
      )}

      {editing && (
        <PointEditor
          point={editing}
          ctx={r.contexts[editing.seq]}
          names={names}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
