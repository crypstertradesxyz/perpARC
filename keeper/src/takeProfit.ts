export const FIRST_TP_MULTIPLE = 1.3;
export const TP_STEP = 0.1;
export const TP_CLOSE_FRACTION = 0.1;

export interface TakeProfitState {
  contributedMarginUsd: number;
  completedMilestones: number;
  /** Capital snapshot used to price the active milestone. Later top-ups must not move this goalpost. */
  activeMilestoneBasisUsd?: number;
  /** Hyperliquid withdrawable value released by completed reduce-only TPs. */
  realizedTpProceedsUsd?: number;
}

export interface TakeProfitDecision {
  equityMultiple: number;
  triggerMultiple: number;
  closeSizeBase: number;
  currentProfitUsd: number;
  requiredProfitUsd: number;
}

export interface TakeProfitProgress {
  currentEquityUsd: number;
  currentEquityMultiple: number;
  triggerEquityUsd: number;
  triggerMultiple: number;
  remainingEquityUsd: number;
  estimatedTriggerPrice: number;
  distanceFromMarkPct: number;
  progressPct: number;
  ready: boolean;
  currentProfitUsd: number;
  requiredProfitUsd: number;
  milestoneBasisUsd: number;
}

export function nextTriggerMultiple(completedMilestones: number): number {
  return Number((FIRST_TP_MULTIPLE + completedMilestones * TP_STEP).toFixed(10));
}

/**
 * Builds the same milestone view used by the executor, from the live
 * position. The trigger price is an estimate (linear perpetual PnL before
 * fees/funding), while the equity trigger itself is authoritative.
 */
export function takeProfitProgress(
  state: TakeProfitState,
  currentEquityUsd: number,
  absoluteSizeBase: number,
  markPrice: number,
  isLong: boolean
): TakeProfitProgress | null {
  if (!(state.contributedMarginUsd > 0) || !(absoluteSizeBase > 0) || !(markPrice > 0)) return null;
  const triggerMultiple = nextTriggerMultiple(state.completedMilestones);
  const milestoneBasisUsd = state.activeMilestoneBasisUsd && state.activeMilestoneBasisUsd > 0
    ? state.activeMilestoneBasisUsd
    : state.contributedMarginUsd;
  const currentProfitUsd = currentEquityUsd - state.contributedMarginUsd;
  const requiredProfitUsd = milestoneBasisUsd * (triggerMultiple - 1);
  const currentEquityMultiple = 1 + currentProfitUsd / milestoneBasisUsd;
  // Contributions made after a milestone begins raise live equity and tracked
  // capital equally. Only profit closes the frozen dollar requirement.
  const triggerEquityUsd = state.contributedMarginUsd + requiredProfitUsd;
  const remainingEquityUsd = Math.max(0, triggerEquityUsd - currentEquityUsd);
  const estimatedTriggerPrice = markPrice + (isLong ? 1 : -1) * remainingEquityUsd / absoluteSizeBase;
  const distanceFromMarkPct = Math.abs(estimatedTriggerPrice / markPrice - 1) * 100;
  // Show progress through this milestone's profit band, not equity / target:
  // 1.00x is 0%, and the active milestone (1.30x, 1.40x...) is 100%.
  const progressPct = Number(Math.max(0, Math.min(100, currentProfitUsd / requiredProfitUsd * 100)).toFixed(8));
  return {
    currentEquityUsd,
    currentEquityMultiple,
    triggerEquityUsd,
    triggerMultiple,
    remainingEquityUsd,
    estimatedTriggerPrice,
    distanceFromMarkPct,
    progressPct,
    ready: currentProfitUsd + 1e-9 >= requiredProfitUsd,
    currentProfitUsd,
    requiredProfitUsd,
    milestoneBasisUsd,
  };
}

export function evaluateTakeProfit(
  state: TakeProfitState,
  positionEquityUsd: number,
  absoluteSizeBase: number
): TakeProfitDecision | null {
  if (!(state.contributedMarginUsd > 0) || !(positionEquityUsd > 0) || !(absoluteSizeBase > 0)) return null;
  const triggerMultiple = nextTriggerMultiple(state.completedMilestones);
  const milestoneBasisUsd = state.activeMilestoneBasisUsd && state.activeMilestoneBasisUsd > 0
    ? state.activeMilestoneBasisUsd
    : state.contributedMarginUsd;
  const currentProfitUsd = positionEquityUsd - state.contributedMarginUsd;
  const requiredProfitUsd = milestoneBasisUsd * (triggerMultiple - 1);
  const equityMultiple = 1 + currentProfitUsd / milestoneBasisUsd;
  if (currentProfitUsd + 1e-9 < requiredProfitUsd) return null;
  return { equityMultiple, triggerMultiple, closeSizeBase: absoluteSizeBase * TP_CLOSE_FRACTION, currentProfitUsd, requiredProfitUsd };
}
