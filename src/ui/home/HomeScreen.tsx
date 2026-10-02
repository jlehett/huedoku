import { DIFFICULTY_LABEL, type Difficulty } from '../../engine/logic/types';
import { store } from '../app/store';
import { useApp } from '../app/useApp';
import { IconGear, IconHelp, IconPlay, IconStats } from '../components/icons';
import { Logo } from '../components/Logo';
import { formatTime } from '../format';

export function ClassicCard() {
  useApp((s) => s.games);
  const cont = store.continuable();
  return (
    <section class="card classic-card" aria-label="Classic">
      <div class="card-head">
        <h2 class="card-title">Classic</h2>
        <p class="card-sub">Five grades, from singles to chains</p>
      </div>
      <div class="card-actions">
        {cont && (
          <button class="btn primary grow" onClick={() => store.continueSlot(cont.slot)}>
            <IconPlay size={18} />
            <span>
              Continue <small>{DIFFICULTY_LABEL[cont.game.difficulty as Difficulty] ?? 'Custom'} · {formatTime(cont.game.elapsedMs)}</small>
            </span>
          </button>
        )}
        <button class={`btn ${cont ? 'ghost' : 'primary'} grow`} onClick={() => store.openSheet({ type: 'newGame' })}>
          New game
        </button>
      </div>
    </section>
  );
}

export function HomeNav() {
  return (
    <nav class="home-nav" aria-label="More">
      <button class="nav-btn" onClick={() => store.go('stats')}>
        <IconStats />
        <span>Stats</span>
      </button>
      <button class="nav-btn" onClick={() => store.go('howto')}>
        <IconHelp />
        <span>How to play</span>
      </button>
      <button class="nav-btn" onClick={() => store.go('settings')}>
        <IconGear />
        <span>Settings</span>
      </button>
    </nav>
  );
}

export function HomeScreen() {
  return (
    <div class="screen home">
      <div class="splatter tr" />
      <div class="splatter bl" />
      <div class="splatter tl" />
      <div class="home-scroll">
        <header class="home-head">
          <Logo height={86} />
        </header>
        <ClassicCard />
        <HomeNav />
      </div>
    </div>
  );
}
