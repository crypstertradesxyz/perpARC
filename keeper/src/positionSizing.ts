/**
 * SPEC.md "Position lifecycle" top-up sizing rule:
 *
 *   "at each top-up, read current mark price and current position equity
 *   (margin + unrealized PnL) from Hyperliquid, then add exactly enough
 *   size so the position's leverage snaps back to the creator's target
 *   multiple at that price."
 *
 * Pure math, no network — deliberately kept separate from hyperliquid.ts so
 * it can be tested without touching Hyperliquid's API.
 */

export interface TopUpInput {
  /** current mark price of the underlying asset, USD */
  markPrice: number;
  /** current position equity: margin + unrealized PnL, USD */
  currentEquity: number;
  /** current position size, in base-asset units (e.g. BTC), always >= 0 — direction is tracked separately via isLong */
  currentSizeBase: number;
  /** new capital being deposited this top-up (bridged from the fee sweep), USD */
  addedMargin: number;
  /** creator's chosen leverage multiple, fixed at launch */
  targetLeverage: number;
}

export interface TopUpResult {
  /** base-asset units to add to the position, same direction as the existing position. 0 if no top-up is needed. */
  additionalSizeBase: number;
  newEquity: number;
  currentNotional: number;
  targetNotional: number;
}

export function computeTopUp(input: TopUpInput): TopUpResult {
  const { markPrice, currentEquity, currentSizeBase, addedMargin, targetLeverage } = input;

  if (!(markPrice > 0)) throw new Error(`markPrice must be positive, got ${markPrice}`);
  if (!(targetLeverage > 0)) throw new Error(`targetLeverage must be positive, got ${targetLeverage}`);
  if (currentSizeBase < 0) throw new Error(`currentSizeBase must be non-negative, got ${currentSizeBase}`);
  if (addedMargin < 0) throw new Error(`addedMargin must be non-negative, got ${addedMargin}`);

  const newEquity = currentEquity + addedMargin;
  const currentNotional = currentSizeBase * markPrice;
  const targetNotional = newEquity * targetLeverage;
  const additionalNotional = targetNotional - currentNotional;

  // Top-ups only ever ADD size. SPEC.md: "no active rebalancing" between
  // top-ups — if leverage is already at or above target after adding margin
  // alone (e.g. the position ran up a lot since the last top-up), there's
  // nothing to add. Reducing would mean partially closing, which is TP's
  // job (SPEC.md "Take-profit / buyback", trigger rule still TBD), not a
  // top-up's.
  const additionalSizeBase = additionalNotional > 0 ? additionalNotional / markPrice : 0;

  return { additionalSizeBase, newEquity, currentNotional, targetNotional };
}

/** Effective leverage of a position — for logging/alerting, not used in the sizing decision itself. */
export function computeLeverage(sizeBase: number, markPrice: number, equity: number): number {
  if (equity <= 0) return Infinity;
  return (sizeBase * markPrice) / equity;
}
