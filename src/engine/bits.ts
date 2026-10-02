/** 9-bit candidate masks: bit (d - 1) set means digit d is possible. */

export const ALL = 0x1ff;

export const POP = new Uint8Array(512);
/** Lowest digit (1..9) in mask, 0 for empty mask. */
export const LOW = new Uint8Array(512);
/** Digits in a mask, precomputed for every mask. */
export const DIGITS: number[][] = [];

for (let m = 0; m < 512; m++) {
  let p = 0;
  const ds: number[] = [];
  for (let d = 0; d < 9; d++) if (m & (1 << d)) { p++; ds.push(d + 1); }
  POP[m] = p;
  LOW[m] = ds.length ? ds[0] : 0;
  DIGITS.push(ds);
}

export const bit = (d: number) => 1 << (d - 1);
export const has = (mask: number, d: number) => (mask & (1 << (d - 1))) !== 0;
