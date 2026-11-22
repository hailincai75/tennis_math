import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { repo } from '../db';
import { FORMAT_PRESETS, type RecordingMode, type Side, type Surface } from '../domain/types';
import { PLAYER_NAME, SURFACE_LABEL, todayLocal } from './labels';
import { href, navigate } from './router';

const NEW_OPPONENT = '__new__';

export function NewMatch() {
  const opponents = useLiveQuery(() => repo.listOpponents(), []);
  const [opponentId, setOpponentId] = useState('');
  const [newName, setNewName] = useState('');
  const [hand, setHand] = useState<'' | 'R' | 'L'>('');
  const [date, setDate] = useState(todayLocal);
  const [presetKey, setPresetKey] = useState('bo3mtb');
  const [noAd, setNoAd] = useState(FORMAT_PRESETS.bo3mtb.format.noAd);
  const [firstServer, setFirstServer] = useState<Side>('elsa');
  const [surface, setSurface] = useState<Surface | ''>('hard');
  const [event, setEvent] = useState('');
  const [round, setRound] = useState('');
  const [mode, setMode] = useState<RecordingMode>('standard');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Default to "new opponent" when there are none yet.
  const selected = opponentId || (opponents && opponents.length === 0 ? NEW_OPPONENT : '');
  const isNew = selected === NEW_OPPONENT;
  const oppLabel = isNew ? newName.trim() || '对手' : (opponents?.find((o) => o.id === selected)?.name ?? '对手');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!selected) return setError('请选择对手');
    if (isNew && !newName.trim()) return setError('请输入新对手的名字');
    setSaving(true);
    try {
      const oppId = isNew ? (await repo.addOpponent({ name: newName, ...(hand ? { hand } : {}) })).id : selected;
      const match = await repo.createMatch({
        date,
        opponentId: oppId,
        format: { ...FORMAT_PRESETS[presetKey].format, noAd },
        firstServer,
        recordingMode: mode,
        ...(surface ? { surface } : {}),
        ...(event.trim() ? { event: event.trim() } : {}),
        ...(round.trim() ? { round: round.trim() } : {}),
      });
      navigate({ name: 'match', id: match.id }, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <main>
      <form className="card form" onSubmit={submit}>
        <label>
          对手
          <select value={selected} onChange={(e) => setOpponentId(e.target.value)}>
            <option value="" disabled>
              选择对手…
            </option>
            {opponents?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value={NEW_OPPONENT}>＋ 新对手</option>
          </select>
        </label>

        {isNew && (
          <div className="row">
            <label className="grow">
              新对手名字
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="姓名" autoFocus />
            </label>
            <label>
              持拍手
              <select value={hand} onChange={(e) => setHand(e.target.value as '' | 'R' | 'L')}>
                <option value="">不确定</option>
                <option value="R">右手</option>
                <option value="L">左手</option>
              </select>
            </label>
          </div>
        )}

        <label>
          赛制
          <select
            value={presetKey}
            onChange={(e) => {
              setPresetKey(e.target.value);
              setNoAd(FORMAT_PRESETS[e.target.value].format.noAd);
            }}
          >
            {Object.entries(FORMAT_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={noAd} onChange={(e) => setNoAd(e.target.checked)} />
          金球（40-40 一分定胜负）
        </label>

        <fieldset className="segmented">
          <legend>先发球</legend>
          {(['elsa', 'opp'] as const).map((s) => (
            <button
              type="button"
              key={s}
              className={firstServer === s ? 'on' : ''}
              onClick={() => setFirstServer(s)}
            >
              {s === 'elsa' ? PLAYER_NAME : oppLabel}
            </button>
          ))}
        </fieldset>

        <fieldset className="segmented">
          <legend>记录方式</legend>
          <button type="button" className={mode === 'standard' ? 'on' : ''} onClick={() => setMode('standard')}>
            标准（发球 + 结束方式）
          </button>
          <button type="button" className={mode === 'quick' ? 'on' : ''} onClick={() => setMode('quick')}>
            快速（只记谁赢）
          </button>
        </fieldset>

        <div className="row">
          <label className="grow">
            日期
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            场地
            <select value={surface} onChange={(e) => setSurface(e.target.value as Surface | '')}>
              <option value="">—</option>
              {Object.entries(SURFACE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label className="grow">
            赛事（可选）
            <input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="例如 冬季公开赛" />
          </label>
          <label className="narrow">
            轮次
            <input value={round} onChange={(e) => setRound(e.target.value)} placeholder="R16" />
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="row">
          <a className="button secondary" href={href({ name: 'home' })}>
            取消
          </a>
          <button className="primary grow" type="submit" disabled={saving}>
            开始记分
          </button>
        </div>
      </form>
    </main>
  );
}
