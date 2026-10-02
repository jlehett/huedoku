import { useEffect, useRef, useState } from 'preact/hooks';
import { store, type AppState } from './store';

/** Subscribe to a slice of app state; re-renders only when the slice changes (shallow). */
export function useApp<T>(select: (s: AppState) => T): T {
  const [value, setValue] = useState(() => select(store.state));
  const selRef = useRef(select);
  selRef.current = select;
  const valRef = useRef(value);
  valRef.current = value;
  useEffect(() => {
    const check = () => {
      const next = selRef.current(store.state);
      if (!shallowEqual(next, valRef.current)) {
        valRef.current = next;
        setValue(() => next);
      }
    };
    check();
    return store.subscribe(check);
  }, []);
  return value;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

export { store };
