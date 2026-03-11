/**
 * Compliance & jurisdiction gating for Battle Trade.
 *
 * CORE PRINCIPLE: Paper trading is ALWAYS available everywhere. No geofencing
 * for paper/practice mode. Geofencing only applies to real-money features.
 * The platform auto-detects jurisdiction and switches mode accordingly.
 *
 * Three tiers of features:
 * 1. OPEN — paper trading, no regulation (available everywhere, never blocked)
 * 2. GATED — real money (credits/prizes), needs basic KYC + jurisdiction allows it
 * 3. RESTRICTED — copy trading / exchange connection, needs full KYC + jurisdiction check
 *
 * Jurisdiction classification:
 * - GREEN: crypto-friendly, minimal regulation (Cayman, Dubai, Singapore, Malta, El Salvador)
 * - YELLOW: regulated but possible (EU/MiCA, UK/FCA, Japan, Korea, Australia)
 * - RED: restricted or banned (US without license, China, India restrictions)
 *           → Auto-falls back to paper trading mode. Users can still play.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeatureTier = 'open' | 'gated' | 'restricted'

export type JurisdictionStatus = 'green' | 'yellow' | 'red'

export interface JurisdictionConfig {
  status: JurisdictionStatus
  max_leverage: number
  copy_trading_allowed: boolean
  real_money_allowed: boolean
  entry_fee_allowed: boolean
  kyc_required_for: FeatureTier
  notes: string
}

export interface KYCStatus {
  profile_id: string
  level: 'none' | 'basic' | 'full'
  provider: string | null          // e.g. 'sumsub', 'onfido'
  provider_ref: string | null      // external verification ID
  verified_at: string | null
  country_code: string | null
  is_accredited: boolean           // qualified investor
  rejected_reason: string | null
}

export interface ComplianceCheck {
  allowed: boolean
  reason: string | null
  required_action: 'none' | 'kyc_basic' | 'kyc_full' | 'geo_blocked' | 'upgrade_account'
}

// ---------------------------------------------------------------------------
// Jurisdiction database
// ---------------------------------------------------------------------------

const JURISDICTIONS: Record<string, JurisdictionConfig> = {
  // GREEN — crypto-friendly
  KY: { status: 'green', max_leverage: 100, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'restricted', notes: 'Cayman Islands — minimal regulation' },
  AE: { status: 'green', max_leverage: 100, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'restricted', notes: 'UAE/Dubai VARA — crypto-friendly' },
  SG: { status: 'green', max_leverage: 50, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Singapore MAS — regulated but open' },
  MT: { status: 'green', max_leverage: 50, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Malta — gaming license covers competitions' },
  SV: { status: 'green', max_leverage: 100, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'restricted', notes: 'El Salvador — Bitcoin standard' },
  BS: { status: 'green', max_leverage: 100, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'restricted', notes: 'Bahamas — offshore exemption' },
  VG: { status: 'green', max_leverage: 100, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'restricted', notes: 'BVI — offshore' },
  BM: { status: 'green', max_leverage: 100, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'restricted', notes: 'Bermuda — digital asset framework' },
  PA: { status: 'green', max_leverage: 100, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'restricted', notes: 'Panama — no crypto regulation' },

  // YELLOW — regulated, possible with compliance
  DE: { status: 'yellow', max_leverage: 2, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Germany — BaFin, MiCA applies' },
  FR: { status: 'yellow', max_leverage: 2, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'France — AMF, MiCA applies' },
  GB: { status: 'yellow', max_leverage: 2, copy_trading_allowed: false, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'UK — FCA, no crypto derivatives for retail' },
  JP: { status: 'yellow', max_leverage: 2, copy_trading_allowed: false, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Japan — FSA, strict leverage limits' },
  KR: { status: 'yellow', max_leverage: 1, copy_trading_allowed: false, real_money_allowed: true, entry_fee_allowed: false, kyc_required_for: 'gated', notes: 'Korea — no leveraged crypto trading' },
  AU: { status: 'yellow', max_leverage: 2, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Australia — ASIC, derivatives regulated' },
  CA: { status: 'yellow', max_leverage: 1, copy_trading_allowed: false, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Canada — CSA, restricted crypto' },
  BR: { status: 'yellow', max_leverage: 10, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Brazil — CVM, new crypto framework' },
  MX: { status: 'yellow', max_leverage: 10, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Mexico — fintech law applies' },

  // RED — restricted
  US: { status: 'red', max_leverage: 1, copy_trading_allowed: false, real_money_allowed: false, entry_fee_allowed: false, kyc_required_for: 'gated', notes: 'US — SEC/CFTC, money transmission, state-by-state. Paper trading ONLY until licensed.' },
  CN: { status: 'red', max_leverage: 0, copy_trading_allowed: false, real_money_allowed: false, entry_fee_allowed: false, kyc_required_for: 'gated', notes: 'China — all crypto trading banned' },
  IN: { status: 'red', max_leverage: 1, copy_trading_allowed: false, real_money_allowed: false, entry_fee_allowed: false, kyc_required_for: 'gated', notes: 'India — 30% crypto tax, restrictive' },
  RU: { status: 'red', max_leverage: 0, copy_trading_allowed: false, real_money_allowed: false, entry_fee_allowed: false, kyc_required_for: 'gated', notes: 'Russia — sanctions, restricted' },
  NG: { status: 'yellow', max_leverage: 10, copy_trading_allowed: true, real_money_allowed: true, entry_fee_allowed: true, kyc_required_for: 'gated', notes: 'Nigeria — SEC, emerging framework' },
}

// Default for unlisted countries — treat as yellow, moderate restrictions
const DEFAULT_JURISDICTION: JurisdictionConfig = {
  status: 'yellow',
  max_leverage: 10,
  copy_trading_allowed: true,
  real_money_allowed: true,
  entry_fee_allowed: true,
  kyc_required_for: 'gated',
  notes: 'Default — moderate restrictions',
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/** Get jurisdiction config for a country code (ISO 3166-1 alpha-2) */
export function getJurisdiction(countryCode: string | null): JurisdictionConfig {
  if (!countryCode) return DEFAULT_JURISDICTION
  return JURISDICTIONS[countryCode.toUpperCase()] ?? DEFAULT_JURISDICTION
}

/** Check if a feature is allowed for a given KYC status and country */
export function checkFeatureAccess(
  feature: FeatureTier,
  kyc: KYCStatus,
  countryCode: string | null,
): ComplianceCheck {
  const jurisdiction = getJurisdiction(countryCode)

  // Open features are always allowed
  if (feature === 'open') {
    return { allowed: true, reason: null, required_action: 'none' }
  }

  // Check if country blocks this feature entirely
  if (feature === 'gated' && !jurisdiction.real_money_allowed) {
    return {
      allowed: false,
      reason: `Real money features are not available in your region. ${jurisdiction.notes}`,
      required_action: 'geo_blocked',
    }
  }

  if (feature === 'restricted') {
    if (!jurisdiction.copy_trading_allowed) {
      return {
        allowed: false,
        reason: `Copy trading is not available in your region. ${jurisdiction.notes}`,
        required_action: 'geo_blocked',
      }
    }
  }

  // Check KYC requirements
  const requiredFor = jurisdiction.kyc_required_for
  if (feature === 'gated' && (requiredFor === 'gated' || requiredFor === 'open')) {
    if (kyc.level === 'none') {
      return {
        allowed: false,
        reason: 'Basic identity verification required for this feature.',
        required_action: 'kyc_basic',
      }
    }
  }

  if (feature === 'restricted') {
    if (kyc.level !== 'full') {
      return {
        allowed: false,
        reason: 'Full identity verification required for copy trading and exchange connections.',
        required_action: 'kyc_full',
      }
    }
  }

  return { allowed: true, reason: null, required_action: 'none' }
}

/** Get the effective max leverage for a country */
export function getMaxLeverage(countryCode: string | null, lobbyLeverage: number = 10): number {
  const jurisdiction = getJurisdiction(countryCode)
  return Math.min(jurisdiction.max_leverage, lobbyLeverage)
}

/** Check if entry fees are allowed */
export function canChargeEntryFee(countryCode: string | null): boolean {
  return getJurisdiction(countryCode).entry_fee_allowed
}

/** Check if copy trading is allowed */
export function canCopyTrade(countryCode: string | null): boolean {
  return getJurisdiction(countryCode).copy_trading_allowed
}

/** Classify a feature into its tier */
export function getFeatureTier(feature: string): FeatureTier {
  const OPEN_FEATURES = [
    'paper_trading', 'spectate', 'chat', 'leaderboard', 'practice_mode',
    'sabotage', 'predictions_internal', 'broadcast', 'profile',
  ]
  const GATED_FEATURES = [
    'credit_purchase', 'entry_fee', 'prize_payout', 'real_money_deposit',
    'real_money_withdrawal',
  ]
  const RESTRICTED_FEATURES = [
    'copy_trading', 'exchange_connect', 'verified_trading', 'history_import',
    'real_order_execution',
  ]

  if (OPEN_FEATURES.includes(feature)) return 'open'
  if (GATED_FEATURES.includes(feature)) return 'gated'
  if (RESTRICTED_FEATURES.includes(feature)) return 'restricted'
  return 'gated' // default to gated for unknown features
}

/** Get all features available in a jurisdiction */
export function getAvailableFeatures(countryCode: string | null, kycLevel: KYCStatus['level']): string[] {
  const jurisdiction = getJurisdiction(countryCode)
  const features: string[] = []

  // Open features always available — NEVER geofenced
  features.push('paper_trading', 'spectate', 'chat', 'leaderboard', 'practice_mode', 'sabotage', 'predictions_internal', 'broadcast', 'profile')

  // Gated features
  if (jurisdiction.real_money_allowed && (kycLevel === 'basic' || kycLevel === 'full')) {
    features.push('credit_purchase', 'prize_payout')
    if (jurisdiction.entry_fee_allowed) features.push('entry_fee')
    features.push('real_money_deposit', 'real_money_withdrawal')
  }

  // Restricted features
  if (jurisdiction.copy_trading_allowed && kycLevel === 'full') {
    features.push('copy_trading', 'exchange_connect', 'verified_trading', 'history_import')
  }

  return features
}

// ---------------------------------------------------------------------------
// Auto-mode detection
// ---------------------------------------------------------------------------

export type LobbyMode = 'paper' | 'real' | 'verified'

export interface ModeDecision {
  mode: LobbyMode
  reason: string
  real_money_available: boolean
  max_leverage: number
  paper_always_available: true  // always true — paper is never blocked
}

/**
 * Auto-detect what mode a user should be in based on their jurisdiction.
 * Paper trading is ALWAYS available. Real money is jurisdiction-gated.
 * This lets the platform auto-switch without blocking any user from playing.
 */
export function autoDetectMode(
  countryCode: string | null,
  kycLevel: KYCStatus['level'] = 'none',
  requestedMode: LobbyMode = 'real',
): ModeDecision {
  const jurisdiction = getJurisdiction(countryCode)

  // Paper is always available everywhere
  if (requestedMode === 'paper') {
    return {
      mode: 'paper',
      reason: 'Paper trading mode selected — available globally.',
      real_money_available: jurisdiction.real_money_allowed,
      max_leverage: jurisdiction.max_leverage > 0 ? jurisdiction.max_leverage : 100, // no leverage limit on paper
      paper_always_available: true,
    }
  }

  // Verified mode requires full KYC + green/yellow jurisdiction
  if (requestedMode === 'verified') {
    if (!jurisdiction.real_money_allowed) {
      return {
        mode: 'paper',
        reason: `Verified trading not available in your region. Auto-switched to paper mode. ${jurisdiction.notes}`,
        real_money_available: false,
        max_leverage: 100,
        paper_always_available: true,
      }
    }
    if (kycLevel !== 'full') {
      return {
        mode: 'paper',
        reason: 'Full KYC required for verified trading. Auto-switched to paper mode.',
        real_money_available: jurisdiction.real_money_allowed,
        max_leverage: jurisdiction.max_leverage,
        paper_always_available: true,
      }
    }
    return {
      mode: 'verified',
      reason: 'Verified trading available — trades execute on connected exchange.',
      real_money_available: true,
      max_leverage: jurisdiction.max_leverage,
      paper_always_available: true,
    }
  }

  // Real mode (credits, entry fees, prizes)
  if (!jurisdiction.real_money_allowed) {
    return {
      mode: 'paper',
      reason: `Real money not available in your region. Auto-switched to paper mode. ${jurisdiction.notes}`,
      real_money_available: false,
      max_leverage: 100, // no cap on paper
      paper_always_available: true,
    }
  }

  if (kycLevel === 'none' && (jurisdiction.kyc_required_for === 'gated' || jurisdiction.kyc_required_for === 'open')) {
    return {
      mode: 'paper',
      reason: 'KYC required for real money. Auto-switched to paper mode. Complete verification to unlock.',
      real_money_available: true,
      max_leverage: 100,
      paper_always_available: true,
    }
  }

  return {
    mode: 'real',
    reason: 'Real money mode available.',
    real_money_available: true,
    max_leverage: jurisdiction.max_leverage,
    paper_always_available: true,
  }
}

/**
 * For lobby creation: determine what modes are available for an event
 * at a given physical location (IRL) or for a given user (virtual).
 */
export function getAvailableModes(countryCode: string | null, kycLevel: KYCStatus['level'] = 'none'): LobbyMode[] {
  const modes: LobbyMode[] = ['paper'] // paper is ALWAYS available
  const jurisdiction = getJurisdiction(countryCode)

  if (jurisdiction.real_money_allowed) {
    if (kycLevel === 'basic' || kycLevel === 'full') {
      modes.push('real')
    }
    if (kycLevel === 'full' && jurisdiction.copy_trading_allowed) {
      modes.push('verified')
    }
  }

  return modes
}
