import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import {
  filterRecords,
  groupBy,
  insights,
  METRICS,
  metricByKey,
  metricOver,
  totals,
  trend,
  winLossComparison,
  type AnalysisFilter,
  type MatchRecord,
} from '../domain/analysis';
import type { Surface } from '../domain/types';
import { loadAllData } from './allData';
import { PLAYER_NAME, SURFACE_LABEL } from './labels';
import { LineChart } from './LineChart';
import { href } from './router';

type Range = 'all' | 'last5' | 'last10' | 'year';
const RANGE_LABEL: Record<Range, string> = { all: '全部', last5: '最近5场', last10: '最近10场', year: '今年' };

const fmt = (key: string, v: number | null) => {
  if (v === null) return '—';
  return metricByKey(key).kind === 'ratio' ? `${Math.round(v * 100)}%` : v.toFixed(1);
};

function toFilter(range: Range, surface: Surface | ''): AnalysisFilter {
  const f: AnalysisFilter = {};
  if (range === 'last5') f.last = 5;
  if (range === 'last10') f.last = 10;
  if (range === 'year') f.from = `${new Date().getFullYear()}-01-01`;
  if (surface) f.surface = surface;
  return f;
}

export function Insights({ records }: { records: MatchRecord[] }) {
  const list = insights(records);
  return (
    <section className="card">
      <h3 className="card-title">提示</h3>
      {list.length === 0 ? (
        <p className="muted small">数据还不够多。记满 6 场以上标准模式的比赛后，这里会自动给出变化和建议。</p>
      ) : (
        <ul className="insights">
          {list.map((i, k) => (
            <li key={k} className={`tone-${i.tone}`}>
              <span className="icon" aria-hidden>
                {i.tone === 'good' ? '▲' : i.tone === 'bad' ? '▼' : '●'}
              </span>
              {i.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TrendCard({ records }: { records: MatchRecord[] }) {
  const [key, setKey] = useState('firstServeIn');
  const m = metricByKey(key);
  const pts = trend(records, m);
  const isRatio = m.kind === 'ratio';
  return (
    <section className="card">
      <div className="row space">
        <h3 className="card-title">趋势</h3>
        <select className="compact" value={key} onChange={(e) => setKey(e.target.value)} aria-label="选择指标">
          {METRICS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      {pts.length < 2 ? (
        <p className="muted small">至少需要 2 场有这项数据的比赛。</p>
      ) : (
        <>
          <LineChart
            data={pts.map((p, i) => ({
              x: i + 1,
              y: isRatio ? p.value * 100 : p.value,
              tip: `${p.record.match.date} vs ${p.record.opponent?.name ?? '对手'}\n${p.record.score}${
                p.record.result ? (p.record.result === 'elsa' ? ' 胜' : ' 负') : ''
              }\n${m.label}：${fmt(key, p.value)}`,
              marker: p.record.result === 'elsa' ? 'elsa' : p.record.result === 'opp' ? 'opp' : 'neutral',
            }))}
            yDomain={isRatio ? [0, 100] : undefined}
            yFormat={(y) => (isRatio ? `${y}%` : String(y))}
            ariaLabel={`${m.label}趋势`}
          />
          <div className="legend">
            <span>
              <i className="dot elsa" /> 赢的比赛
            </span>
            <span>
              <i className="dot opp" /> 输的比赛
            </span>
            <span className="muted">从左到右按日期</span>
          </div>
        </>
      )}
    </section>
  );
}

function WinLoss({ records }: { records: MatchRecord[] }) {
  const rows = winLossComparison(records);
  if (!rows.length) return null;
  return (
    <section className="card">
      <h3 className="card-title">赢球 vs 输球</h3>
      <p className="muted small">{PLAYER_NAME} 在赢的比赛和输的比赛里的平均表现，差别越大越靠前。</p>
      <table className="stat-table">
        <thead>
          <tr>
            <th />
            <th>赢球时</th>
            <th>输球时</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.metric.key}>
              <th>{r.metric.label}</th>
              <td className={r.gap > 0 ? 'better' : ''}>{fmt(r.metric.key, r.inWins)}</td>
              <td className={r.gap < 0 ? 'better' : ''}>{fmt(r.metric.key, r.inLosses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Overall({ records }: { records: MatchRecord[] }) {
  return (
    <section className="card">
      <h3 className="card-title">整体数据</h3>
      <table className="stat-table">
        <thead>
          <tr>
            <th />
            <th className="elsa">{PLAYER_NAME}</th>
            <th className="opp">对手们</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const e = metricOver(m, records, 'elsa');
            const o = metricOver(m, records, 'opp');
            if (e === null && o === null) return null;
            return (
              <tr key={m.key}>
                <th>{m.label}</th>
                <td>{fmt(m.key, e)}</td>
                <td>{fmt(m.key, o)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function BySurface({ records }: { records: MatchRecord[] }) {
  const groups = groupBy(records, (r) => r.match.surface);
  if (groups.length < 2) return null;
  const pw = metricByKey('pointsWon');
  return (
    <section className="card">
      <h3 className="card-title">按场地</h3>
      <table className="stat-table">
        <thead>
          <tr>
            <th />
            <th>场数</th>
            <th>胜-负</th>
            <th>得分率</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <th>{SURFACE_LABEL[g.key as Surface]}</th>
              <td>{g.records.length}</td>
              <td>
                {g.wins}-{g.losses}
              </td>
              <td>{fmt('pointsWon', metricOver(pw, g.records))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Analysis() {
  const data = useLiveQuery(loadAllData, []);
  const [range, setRange] = useState<Range>('all');
  const [surface, setSurface] = useState<Surface | ''>('');
  if (!data) return null;

  const records = filterRecords(data.records, toFilter(range, surface));
  const t = totals(records);
  const decided = t.wins + t.losses;

  return (
    <main>
      <div className="filters">
        <div className="segmented">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <select value={surface} onChange={(e) => setSurface(e.target.value as Surface | '')} aria-label="场地">
          <option value="">所有场地</option>
          {Object.entries(SURFACE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {records.length === 0 ? (
        <section className="card empty">
          <h2>没有符合条件的比赛</h2>
          <p>
            先去 <a href={href({ name: 'new' })}>记一场比赛</a>，或者换个筛选条件。
          </p>
        </section>
      ) : (
        <>
          <section className="card tiles">
            <div className="tile">
              <div className="tile-value">
                {t.wins}-{t.losses}
              </div>
              <div className="tile-label">胜-负</div>
            </div>
            <div className="tile">
              <div className="tile-value">{decided ? `${Math.round((t.wins / decided) * 100)}%` : '—'}</div>
              <div className="tile-label">胜率</div>
            </div>
            <div className="tile">
              <div className="tile-value">{fmt('pointsWon', metricOver(metricByKey('pointsWon'), records))}</div>
              <div className="tile-label">总得分率</div>
            </div>
          </section>
          <Insights records={records} />
          <TrendCard records={records} />
          <WinLoss records={records} />
          <Overall records={records} />
          <BySurface records={records} />
          <p className="muted small center">共 {records.length} 场比赛</p>
        </>
      )}
    </main>
  );
}
