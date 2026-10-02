import { store } from '../app/store';
import { useApp } from '../app/useApp';
import { IconBulb, IconClose } from '../components/icons';
import { currentTheme } from '../theme';

export function HintPanel() {
  const hint = useApp((s) => s.hint);
  const notes = useApp((s) => s.game?.notes);
  if (!hint) return null;
  const r = hint.result;
  const pal = currentTheme()?.palette;
  const name = (d: number) => `${pal?.names[d - 1] ?? ''} ${d}`;
  const hasNoteElims = !!r.step?.eliminations.some((e) => notes && notes[e.cell] & (1 << (e.digit - 1)));
  return (
    <div class="hint-panel" role="dialog" aria-live="polite" aria-label="Hint">
      <div class="hint-head">
        <span class="hint-ico">
          <IconBulb size={20} />
        </span>
        <p class="hint-title">{r.kind === 'wrong' ? 'Check this first' : r.kind === 'none' ? 'Stuck' : hint.stage === 1 ? 'A nudge' : r.techniqueName}</p>
        <button class="icon-btn small" aria-label="Close hint" onClick={() => store.closeHint()}>
          <IconClose size={20} />
        </button>
      </div>
      {r.kind === 'step' && hint.stage === 1 ? (
        <>
          <p class="hint-text">
            Look at the highlighted area. A <b>{r.techniqueName?.toLowerCase()}</b> moves things forward here.
          </p>
          <div class="hint-actions">
            <button class="btn ghost" onClick={() => store.closeHint()}>
              I'll find it
            </button>
            <button class="btn primary" onClick={() => store.hintStage2()}>
              Show me
            </button>
          </div>
        </>
      ) : (
        <>
          <p class="hint-text">{r.sentence}</p>
          {r.followUp && <p class="hint-text follow">{r.followUp}</p>}
          <div class="hint-actions">
            {r.kind === 'wrong' && (
              <button class="btn primary" onClick={() => store.clearWrong()}>
                Clear {r.wrong!.length > 1 ? 'them' : 'it'}
              </button>
            )}
            {r.kind === 'step' && hasNoteElims && (
              <button class="btn ghost" onClick={() => store.applyHintNotes()}>
                Remove notes
              </button>
            )}
            {r.kind === 'step' && r.place && (
              <button class="btn primary" onClick={() => store.applyHintPlacement()}>
                <span class="swatch" style={{ background: `var(--fill-${r.place.digit})` }} />
                Place {name(r.place.digit)}
              </button>
            )}
            {r.kind === 'none' && (
              <button class="btn ghost" onClick={() => store.closeHint()}>
                OK
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
