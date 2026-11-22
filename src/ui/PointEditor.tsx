import { useState } from 'react';
import { repo } from '../db';
import type { PointContext } from '../domain/scoring';
import { SERVE_ENDINGS, type Point, type PointDetails, type PointEnding, type RallyLength, type Side } from '../domain/types';
import { ENDING_LABEL, type Names } from './labels';
import { errorText } from './matchData';
import { Sheet } from './Sheet';

type Serve = 'first' | 'second' | 'unknown';

const ENDINGS: PointEnding[] = ['winner', 'unforced_error', 'forced_error', 'ace', 'service_winner', 'double_fault'];
const RALLY: { k: RallyLength | null; label: string }[] = [
  { k: null, label: '不记' },
  { k: 'short', label: '短 1-4' },
  { k: 'medium', label: '中 5-8' },
  { k: 'long', label: '长 9+' },
];

export function PointEditor({
  point,
  ctx,
  names,
  onClose,
}: {
  point: Point;
  ctx: PointContext;
  names: Names;
  onClose: () => void;
}) {
  const [detailed, setDetailed] = useState(!!point.ending);
  const [winner, setWinner] = useState<Side>(point.winner);
  const [serve, setServe] = useState<Serve>(
    point.firstServeIn === undefined ? 'unknown' : point.firstServeIn ? 'first' : 'second',
  );
  const [ending, setEnding] = useState<PointEnding>(point.ending ?? 'winner');
  const [endedBy, setEndedBy] = useState<Side>(point.endedBy ?? point.winner);
  const [rally, setRally] = useState<RallyLength | null>(point.rallyLength ?? null);
  const [note, setNote] = useState(point.note ?? '');
  const [error, setError] = useState('');

  const serveEnding = SERVE_ENDINGS.has(ending);
  const effectiveEndedBy = serveEnding ? ctx.server : endedBy;
  const effectiveServe: Serve = ending === 'double_fault' ? 'second' : serve;

  async function save() {
    const details: PointDetails = detailed
      ? { ending, endedBy: effectiveEndedBy }
      : { winner };
    if (effectiveServe !== 'unknown') details.firstServeIn = effectiveServe === 'first';
    if (rally) details.rallyLength = rally;
    if (point.stroke) details.stroke = point.stroke;
    if (note.trim()) details.note = note.trim();
    try {
      await repo.updatePoint(point.id, details);
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const seg = <T extends string | boolean | null>(value: T, set: (v: T) => void, opts: { k: T; label: string; disabled?: boolean }[]) => (
    <div className="segmented">
      {opts.map((o) => (
        <button
          type="button"
          key={String(o.k)}
          className={value === o.k ? 'on' : ''}
          disabled={o.disabled}
          onClick={() => set(o.k)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <Sheet title={`修改第 ${point.seq + 1} 分`} onClose={onClose}>
      <p className="muted">
        {names[ctx.server]} 发球 · 比分 {ctx.pointDisplay.elsa}-{ctx.pointDisplay.opp}
      </p>
      {seg(detailed, setDetailed, [
        { k: true, label: '详细' },
        { k: false, label: '只记谁赢' },
      ])}

      {detailed ? (
        <>
          <label className="field">
            结束方式
            <select value={ending} onChange={(e) => setEnding(e.target.value as PointEnding)}>
              {ENDINGS.map((k) => (
                <option key={k} value={k}>
                  {ENDING_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            最后一拍是谁打的
            {seg(effectiveEndedBy, setEndedBy, [
              { k: 'elsa', label: names.elsa, disabled: serveEnding && ctx.server !== 'elsa' },
              { k: 'opp', label: names.opp, disabled: serveEnding && ctx.server !== 'opp' },
            ])}
          </div>
        </>
      ) : (
        <div className="field">
          谁赢
          {seg(winner, setWinner, [
            { k: 'elsa', label: names.elsa },
            { k: 'opp', label: names.opp },
          ])}
        </div>
      )}

      <div className="field">
        发球
        {seg(effectiveServe, setServe, [
          { k: 'first', label: '一发进', disabled: ending === 'double_fault' && detailed },
          { k: 'second', label: '二发' },
          { k: 'unknown', label: '不记', disabled: ending === 'double_fault' && detailed },
        ])}
      </div>
      <div className="field">
        回合长度
        {seg(rally, setRally, RALLY)}
      </div>
      <label className="field">
        备注
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="secondary" onClick={onClose}>
          取消
        </button>
        <button className="primary grow" onClick={save}>
          保存
        </button>
      </div>
    </Sheet>
  );
}
