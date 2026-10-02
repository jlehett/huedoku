import { useRef } from 'preact/hooks';
import { encodeShareCode } from '../../engine/codec';
import { store } from '../app/store';
import { useApp } from '../app/useApp';
import { IconBrush, IconCheck, IconGear, IconGrid, IconHelp, IconRestart, IconShare, IconWand, IconBack } from '../components/icons';
import { Sheet, useSheetClose } from '../components/Sheet';

export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return 'shared';
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function MenuSheet() {
  const ref = useRef<HTMLDivElement>(null);
  const close = useSheetClose(ref);
  const game = useApp((s) => s.game);
  const settings = useApp((s) => s.meta.settings);
  if (!game) return null;
  const item = (icon: preact.JSX.Element, label: string, sub: string | null, fn: () => void, danger = false) => (
    <button class={`menu-item${danger ? ' danger' : ''}`} onClick={fn}>
      <span class="ico">{icon}</span>
      <span class="txt">
        <span class="label">{label}</span>
        {sub && <span class="sub">{sub}</span>}
      </span>
    </button>
  );
  return (
    <Sheet title="Game" sheetRef={ref}>
      <div class="menu-list">
        {item(<IconBrush />, settings.inputMode === 'paint' ? 'Input: Paint (digit first)' : 'Input: Cell first', 'Tap to switch', () => {
          void store.updateSettings({ inputMode: settings.inputMode === 'paint' ? 'cell' : 'paint' });
        })}
        {item(<IconWand />, 'Fill in all notes', 'Every candidate, as one undo step', () => close(() => store.autoNotes()))}
        {item(<IconGrid />, 'Clear all notes', null, () => close(() => store.clearNotes()))}
        {item(<IconCheck />, 'Check board', 'Marks entries that do not match', () => close(() => store.checkBoard()))}
        {item(<IconShare />, 'Share this puzzle', 'As a short code', () =>
          close(async () => {
            const code = encodeShareCode(game.givens);
            const r = await shareText('Huedoku puzzle', `Try this Huedoku puzzle: ${code}`);
            if (r === 'copied') store.toast(`Copied ${code}`);
            else if (r === 'failed') store.toast(`Share code: ${code}`);
          }),
        )}
        {item(<IconHelp />, 'How to play', null, () => close(() => store.go('howto')))}
        {item(<IconGear />, 'Settings', null, () => close(() => store.go('settings')))}
        {item(<IconRestart />, 'Restart puzzle', 'Clears your entries, keeps the clock', () =>
          store.openSheet({ type: 'confirm', title: 'Restart this puzzle?', body: 'All your colors and notes on this board will be cleared.', ok: 'Restart', danger: true, action: () => store.restartGame() }),
        true)}
        {item(<IconBack />, 'Back to home', 'Your game is saved', () => close(() => store.quit()))}
      </div>
    </Sheet>
  );
}

export function ConfirmSheet({ title, body, ok, action, danger }: { title: string; body: string; ok: string; action: () => void; danger?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useSheetClose(ref);
  return (
    <Sheet title={title} sheetRef={ref} class="confirm">
      <p class="sheet-body">{body}</p>
      <div class="actions">
        <button class="btn ghost" onClick={() => close()}>
          Cancel
        </button>
        <button
          class={`btn ${danger ? 'danger' : 'primary'}`}
          onClick={() => {
            store.closeSheet();
            store.closeSheet();
            action();
          }}
        >
          {ok}
        </button>
      </div>
    </Sheet>
  );
}

export function FailedSheet() {
  const ref = useRef<HTMLDivElement>(null);
  const close = useSheetClose(ref);
  const game = useApp((s) => s.game);
  return (
    <Sheet title="Three mistakes" sheetRef={ref}>
      <p class="sheet-body">That's the limit you set. You can keep going without the limit for this puzzle, or start fresh.</p>
      <div class="actions">
        <button class="btn ghost" onClick={() => close(() => store.quit())}>
          Home
        </button>
        <button class="btn primary" onClick={() => close(() => store.waiveLimit())}>
          Keep going
        </button>
      </div>
      {game?.mode === 'classic' && game.difficulty !== 'custom' && (
        <button class="btn ghost wide" onClick={() => close(() => void store.newClassic(game.difficulty as never))}>
          New game
        </button>
      )}
    </Sheet>
  );
}
