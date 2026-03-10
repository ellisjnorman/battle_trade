/**
 * Wallet utilities for Battle Trade.
 * Authentication is handled by Privy (WalletConnect + embedded wallets).
 * This module provides display helpers and wallet inspection utilities.
 */

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Shorten an address for display: 0x1234...5678 */
export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Format a token/coin balance for display (default 4 decimals) */
export function formatBalance(balance: string | number, decimals: number = 4): string {
  const num = typeof balance === 'string' ? parseFloat(balance) : balance;
  if (isNaN(num)) return '0';
  if (num === 0) return '0';
  // For very small numbers, show more decimals
  if (num > 0 && num < 0.0001) return '< 0.0001';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

// ---------------------------------------------------------------------------
// Privy user wallet inspection
// ---------------------------------------------------------------------------

/**
 * Check if a Privy user has at least one linked wallet.
 * Works with both embedded wallets and external (WalletConnect) wallets.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasLinkedWallet(privyUser: any): boolean {
  if (!privyUser) return false;
  // Privy stores wallets in user.linkedAccounts or user.wallet
  if (privyUser.wallet?.address) return true;
  const linked = privyUser.linkedAccounts as Array<{ type: string; address?: string }> | undefined;
  if (linked) {
    return linked.some(
      (a) => (a.type === 'wallet' || a.type === 'smart_wallet') && !!a.address,
    );
  }
  return false;
}

/**
 * Get the primary wallet address from a Privy user object.
 * Returns the first available wallet address, or null if none linked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getWalletAddress(privyUser: any): string | null {
  if (!privyUser) return null;
  // Direct wallet field
  if (privyUser.wallet?.address) return privyUser.wallet.address;
  // Search linkedAccounts
  const linked = privyUser.linkedAccounts as Array<{ type: string; address?: string }> | undefined;
  if (linked) {
    const wallet = linked.find(
      (a) => (a.type === 'wallet' || a.type === 'smart_wallet') && !!a.address,
    );
    if (wallet?.address) return wallet.address;
  }
  return null;
}

/**
 * Get chain info from the primary wallet.
 * Returns chain type (ethereum, solana) and optional chainId.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getChainInfo(privyUser: any): { chainType: string; chainId?: number } | null {
  if (!privyUser) return null;
  // Direct wallet
  if (privyUser.wallet?.address) {
    const chainType = privyUser.wallet.chainType ?? 'ethereum';
    const chainId = privyUser.wallet.chainId
      ? typeof privyUser.wallet.chainId === 'string'
        ? parseInt(privyUser.wallet.chainId.replace('eip155:', ''), 10)
        : privyUser.wallet.chainId
      : undefined;
    return { chainType, chainId };
  }
  // Search linkedAccounts
  const linked = privyUser.linkedAccounts as Array<{
    type: string; address?: string; chainType?: string; chainId?: string | number;
  }> | undefined;
  if (linked) {
    const wallet = linked.find(
      (a) => (a.type === 'wallet' || a.type === 'smart_wallet') && !!a.address,
    );
    if (wallet) {
      const chainType = wallet.chainType ?? 'ethereum';
      const chainId = wallet.chainId
        ? typeof wallet.chainId === 'string'
          ? parseInt(wallet.chainId.replace('eip155:', ''), 10)
          : wallet.chainId
        : undefined;
      return { chainType, chainId: chainId as number | undefined };
    }
  }
  return null;
}
