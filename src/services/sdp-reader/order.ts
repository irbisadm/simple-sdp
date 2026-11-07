/**
 * Line order of RFC 8866 §5. Lines with the same rank may repeat only if listed in
 * the corresponding REPEATABLE set. `t=`/`r=`/`z=` (time descriptions) are handled separately.
 */
export const SESSION_ORDER: Record<string, number> = {
  v: 0, o: 1, s: 2, i: 3, u: 4, e: 5, p: 6, c: 7, b: 8, t: 9, r: 10, z: 11, k: 12, a: 13,
};
export const SESSION_REPEATABLE = new Set(['e', 'p', 'b', 'a']);
export const MEDIA_ORDER: Record<string, number> = {m: 0, i: 1, c: 2, b: 3, k: 4, a: 5};
export const MEDIA_REPEATABLE = new Set(['b', 'a']);

export const ORDER_HINT = {
  session: 'v o s i u e p c b t r z k a',
  media: 'm i c b k a',
};
