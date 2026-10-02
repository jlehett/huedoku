import { useEffect, useRef, useState } from 'preact/hooks';
import { audio } from '../../audio/audio';
import { DIFFICULTY_LABEL, type Difficulty } from '../../engine/logic/types';
import type { Effects } from '../../motion/effects';
import { fx } from '../../motion/particles';
import { motion } from '../../motion/scheduler';
import { store } from '../app/store';
import { useApp } from '../app/useApp';
import { IconBack, IconBulb, IconErase, IconMenu, IconPause, IconPencil, IconPlay, IconRedo, IconUndo } from '../components/icons';
import { Logo } from '../components/Logo';
import { formatTime } from '../format';
import { BoardHost, type BoardApi } from './BoardHost';
import { HintPanel } from './HintPanel';
import { Pad } from './Pad';
import { ResultsCard } from './ResultsCard';

function Timer() {
  const [, tick] = useState(0);
  const hide = useApp((s) => s.meta.settings.hideTimer);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  if (hide) return null;
  return (
    <>
      <span class="dot" aria-hidden="true">•</span>
      <span class="time" aria-label="Time">{formatTime(store.elapsed())}</span>
    </>
  );
}

function Header() {
  const game = useApp((s) => s.game);
  if (!game) return null;
  const label = game.difficulty === 'custom' ? 'Custom' : DIFFICULTY_LABEL[game.difficulty as Difficulty];
  const mode = game.mode === 'daily' ? (game.archive ? 'Archive daily' : 'Daily puzzle') : 'Classic';
  return (
    <header class="game-head">
      <button class="icon-btn" aria-label="Back to home" onClick={() => store.quit()}>
        <IconBack />
      </button>
      <div class="title">
        <Logo height={44} />
        <p class="meta-line">
          <span class="mode">{mode}</span>
          <span class="dot" aria-hidden="true">•</span>
          <span>{label}</span>
          {game.mistakes > 0 && (
            <>
              <span class="dot" aria-hidden="true">•</span>
              <span class="mistakes" aria-label={`${game.mistakes} mistakes`}>
                {store.settings.mistakeLimit && !game.limitWaived ? `${game.mistakes}/3` : `${game.mistakes}`}✕
              </span>
            </>
          )}
          <Timer />
        </p>
      </div>
      <div class="head-actions">
        <button class="icon-btn round" aria-label="Pause" onClick={() => store.setPaused(true)}>
          <IconPause />
        </button>
        <button class="icon-btn" aria-label="Game menu" onClick={() => store.openSheet({ type: 'menu' })}>
          <IconMenu />
        </button>
      </div>
    </header>
  );
}

function Tools({ effects }: { effects: Effects | null }) {
  const game = useApp((s) => s.game);
  const left = useApp((s) => s.meta.settings.leftHanded);
  const hinting = useApp((s) => !!s.hint);
  if (!game) return null;
  const press = (e: Event, fn: () => void) => {
    effects?.pressButton(e.currentTarget as HTMLElement);
    fn();
  };
  const tools = [
    { id: 'undo', label: 'Undo', icon: <IconUndo />, on: () => store.undo(), disabled: !game.history.length },
    { id: 'redo', label: 'Redo', icon: <IconRedo />, on: () => store.redo(), disabled: !game.future.length },
    { id: 'erase', label: 'Erase', icon: <IconErase />, on: () => store.eraseSelected(), disabled: game.selected === null },
    { id: 'notes', label: 'Notes', icon: <IconPencil />, on: () => store.toggleNotesMode(), active: game.notesMode },
    { id: 'hint', label: 'Hint', icon: <IconBulb />, on: () => void store.requestHint(), active: hinting },
  ];
  const ordered = left ? [...tools].reverse() : tools;
  return (
    <div class="tools" role="toolbar" aria-label="Tools">
      {ordered.map((t) => (
        <button
          key={t.id}
          class={`tool${t.active ? ' active' : ''}${t.disabled ? ' disabled' : ''}`}
          data-fx={t.id}
          aria-pressed={t.id === 'notes' ? !!t.active : undefined}
          aria-label={t.id === 'notes' ? `Notes ${game.notesMode ? 'on' : 'off'}` : t.label}
          onClick={(e) => press(e, t.on)}
        >
          <span class="ico">{t.icon}</span>
          <span class="lbl">
            {t.label}
            {t.id === 'notes' && <em class="badge">{game.notesMode ? 'On' : 'Off'}</em>}
          </span>
        </button>
      ))}
    </div>
  );
}

function PauseCover() {
  const paused = useApp((s) => s.paused);
  const game = useApp((s) => s.game);
  if (!paused || !game) return null;
  return (
    <div class="pause-cover" role="dialog" aria-label="Paused">
      <p class="brush-title">Paused</p>
      <p class="sub">
        {formatTime(game.elapsedMs)} · {game.mistakes} mistake{game.mistakes === 1 ? '' : 's'}
      </p>
      <button class="play-big" aria-label="Resume" onClick={() => store.setPaused(false)}>
        <IconPlay size={34} />
      </button>
    </div>
  );
}

export function GameScreen() {
  const [api, setApi] = useState<BoardApi | null>(null);
  const padRef = useRef<{ button(d: number): HTMLElement | null } | null>(null);
  const status = useApp((s) => s.game?.status);
  const results = useApp((s) => s.results);
  const [finale, setFinale] = useState<{ skip: () => void } | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Solve: play the finale, then hand off to results (Classic) or the quilt (Daily).
  useEffect(() => {
    if (status !== 'solved' || !api || !results) return;
    setShowResults(false);
    const values = store.state.game!.values;
    const handle = api.effects.finale(api.view.el, values, () => {
      setFinale(null);
      if (results.mode === 'daily') store.finaleDone(api.view.el.getBoundingClientRect());
      else setShowResults(true);
    });
    setFinale(handle);
  }, [status, api, results?.mode]);

  // Keyboard support for tablets and desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.state;
      if (s.screen !== 'game' || s.sheets.length) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      audio.unlock();
      const g = s.game;
      if (!g) return;
      const k = e.key;
      if (finale) {
        finale.skip();
        return;
      }
      if (k === ' ' || k === 'p' || k === 'P') {
        e.preventDefault();
        store.setPaused(!s.paused);
        return;
      }
      if (s.paused) return;
      if (/^[1-9]$/.test(k)) {
        const d = Number(k);
        if (g.selected === null) store.select(40);
        store.input(d, e.shiftKey || e.altKey);
        e.preventDefault();
      } else if (k === 'Backspace' || k === 'Delete' || k === '0') {
        store.eraseSelected();
        e.preventDefault();
      } else if (k.startsWith('Arrow')) {
        const cur = g.selected ?? 40;
        let r = Math.floor(cur / 9), c = cur % 9;
        if (k === 'ArrowUp') r = (r + 8) % 9;
        if (k === 'ArrowDown') r = (r + 1) % 9;
        if (k === 'ArrowLeft') c = (c + 8) % 9;
        if (k === 'ArrowRight') c = (c + 1) % 9;
        store.select(r * 9 + c);
        audio.select();
        e.preventDefault();
      } else if (k === 'n' || k === 'N') store.toggleNotesMode();
      else if ((k === 'z' || k === 'Z') && !e.shiftKey) store.undo();
      else if (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey)) store.redo();
      else if (k === 'h' || k === 'H') void store.requestHint();
      else if (k === 'Escape') {
        if (s.hint) store.closeHint();
        else store.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finale]);

  // Finale is skippable with a tap anywhere.
  const skip = () => {
    finale?.skip();
  };

  useEffect(() => () => {
    motion.finishAll();
    fx.clear();
  }, []);

  return (
    <div class="screen game">
      <div class="splatter tr" />
      <div class="splatter bl" />
      <div class="splatter br" />
      <Header />
      <div class="game-body">
        <BoardHost onReady={setApi} padRef={padRef} />
        <PauseCover />
        <div class="controls">
          <Tools effects={api?.effects ?? null} />
          <Pad effects={api?.effects ?? null} padRef={padRef} />
        </div>
      </div>
      <HintPanel />
      {finale && <button class="finale-skip" aria-label="Skip celebration" onPointerDown={skip} />}
      {showResults && results && <ResultsCard results={results} />}
    </div>
  );
}
