/**
 * Lightweight wallet connection for EVM (MetaMask) and Solana (Phantom).
 * No heavy SDK dependencies — uses window.ethereum and window.solana directly.
 */

export type WalletType = 'evm' | 'solana';

export interface WalletConnection {
  address: string;
  type: WalletType;
  label: string;
}

/** Check which wallet providers are available in the browser */
export function getAvailableWallets(): { evm: boolean; solana: boolean } {
  if (typeof window === 'undefined') return { evm: false, solana: false };
  return {
    evm: !!(window as unknown as Record<string, unknown>).ethereum,
    solana: !!(window as unknown as Record<string, unknown>).solana,
  };
}

/** Connect to an EVM wallet (MetaMask, Coinbase Wallet, etc.) */
export async function connectEVM(): Promise<WalletConnection> {
  const ethereum = (window as unknown as Record<string, unknown>).ethereum as {
    request: (args: { method: string }) => Promise<string[]>;
    isMetaMask?: boolean;
  } | undefined;

  if (!ethereum) throw new Error('No EVM wallet found. Install MetaMask.');

  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) throw new Error('No accounts returned');

  return {
    address: accounts[0],
    type: 'evm',
    label: ethereum.isMetaMask ? 'MetaMask' : 'EVM Wallet',
  };
}

/** Connect to a Solana wallet (Phantom, etc.) */
export async function connectSolana(): Promise<WalletConnection> {
  const solana = (window as unknown as Record<string, unknown>).solana as {
    connect: () => Promise<{ publicKey: { toString: () => string } }>;
    isPhantom?: boolean;
  } | undefined;

  if (!solana) throw new Error('No Solana wallet found. Install Phantom.');

  const response = await solana.connect();
  return {
    address: response.publicKey.toString(),
    type: 'solana',
    label: solana.isPhantom ? 'Phantom' : 'Solana Wallet',
  };
}

/** Connect to any available wallet, preferring the specified type */
export async function connectWallet(preferredType?: WalletType): Promise<WalletConnection> {
  if (preferredType === 'solana') return connectSolana();
  if (preferredType === 'evm') return connectEVM();

  // Auto-detect
  const available = getAvailableWallets();
  if (available.solana) return connectSolana();
  if (available.evm) return connectEVM();

  throw new Error('No wallet found. Install MetaMask or Phantom.');
}

/** Shorten an address for display: 0x1234...5678 */
export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
