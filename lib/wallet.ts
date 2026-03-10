/**
 * Wallet utilities for Battle Trade.
 * Authentication is handled by Privy (WalletConnect + embedded wallets).
 * This module provides display helpers only.
 */

/** Shorten an address for display: 0x1234...5678 */
export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
