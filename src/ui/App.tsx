import { useEffect, useRef } from 'preact/hooks';
import { fx } from '../motion/particles';
import { motion } from '../motion/scheduler';
import { DUR, EASE } from '../motion/tokens';
import { store } from './app/store';
import { useApp } from './app/useApp';
import { GameScreen } from './game/GameScreen';
import { HomeScreen } from './home/HomeScreen';
import { ConfirmSheet, FailedSheet, MenuSheet } from './sheets/MenuSheet';
import { NewGameSheet } from './sheets/NewGameSheet';
import { Toast, LoadingVeil, UpdatePrompt } from './components/Overlays';

function Sheets() {
  const sheets = useApp((s) => s.sheets);
  return (
    <>
      {sheets.map((sh, k) => {
        switch (sh.type) {
          case 'newGame':
            return <NewGameSheet key={k} />;
          case 'menu':
            return <MenuSheet key={k} />;
          case 'confirm':
            return <ConfirmSheet key={k} {...sh} />;
          case 'failed':
            return <FailedSheet key={k} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function ScreenHost() {
  const screen = useApp((s) => s.screen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.firstElementChild;
    if (!el) return;
    if (motion.reduced) motion.play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fade, channel: 'screen' });
    else motion.play(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: DUR.screen, easing: EASE.out, channel: 'screen' });
  }, [screen]);
  let node = null;
  switch (screen) {
    case 'game':
      node = <GameScreen />;
      break;
    default:
      node = <HomeScreen />;
  }
  return (
    <div class="screen-host" ref={ref}>
      {node}
    </div>
  );
}

export function App() {
  const ready = useApp((s) => s.ready);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) fx.attach(canvasRef.current);
  }, []);
  return (
    <>
      {ready && <ScreenHost />}
      {ready && <Sheets />}
      <canvas class="fx-canvas" ref={canvasRef} aria-hidden="true" />
      <LoadingVeil />
      <UpdatePrompt />
      <Toast />
    </>
  );
}

export { store };
