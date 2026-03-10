/**
 * Pyth Network price feed catalog.
 * Each entry maps a trading symbol to its Pyth feed ID.
 * Add new assets here — the price engine picks them up automatically.
 */

export type AssetCategory = 'crypto' | 'equity' | 'commodity';

/** Market type for UI grouping — crypto / RWA / perps / spot */
export type MarketType = 'crypto' | 'rwa' | 'perps' | 'spot';

export interface FeedEntry {
  id: string;          // Pyth feed ID (hex, no 0x prefix)
  label: string;       // Human-readable label, e.g. "Bitcoin"
  category: AssetCategory;
  market: MarketType;  // UI grouping
}

// ── Crypto (perps) ────────────────────────────────────────────────────
const crypto = (id: string, label: string): FeedEntry => ({ id, label, category: 'crypto', market: 'crypto' });

// ── Equities (RWAs) ──────────────────────────────────────────────────
const equity = (id: string, label: string): FeedEntry => ({ id, label, category: 'equity', market: 'rwa' });

// ── Commodities (RWAs) ───────────────────────────────────────────────
const commodity = (id: string, label: string): FeedEntry => ({ id, label, category: 'commodity', market: 'rwa' });

/** Market type labels for UI */
export const MARKET_TYPES: { key: MarketType; label: string }[] = [
  { key: 'crypto', label: 'CRYPTO' },
  { key: 'rwa', label: 'RWAs' },
  { key: 'perps', label: 'PERPS' },
  { key: 'spot', label: 'SPOT' },
];

/** Get feeds grouped by market type */
export function getFeedsByMarket(): Record<MarketType, { symbol: string; entry: FeedEntry }[]> {
  const groups: Record<MarketType, { symbol: string; entry: FeedEntry }[]> = { crypto: [], rwa: [], perps: [], spot: [] };
  for (const [symbol, entry] of Object.entries(PYTH_FEEDS)) {
    const sym = symbol.replace('USD', '');
    // Crypto assets appear in both crypto and perps
    if (entry.market === 'crypto') {
      groups.crypto.push({ symbol: sym, entry });
      groups.perps.push({ symbol: sym, entry: { ...entry, label: `${entry.label} Perp` } });
    } else {
      groups[entry.market].push({ symbol: sym, entry });
    }
  }
  // Spot = stablecoins + major crypto spot pairs
  // For now, spot mirrors crypto (all are spot-priced from Pyth)
  if (groups.spot.length === 0) {
    groups.spot = groups.crypto.map(g => ({ ...g, entry: { ...g.entry, label: `${g.entry.label} Spot` } }));
  }
  return groups;
}

export const PYTH_FEEDS: Record<string, FeedEntry> = {
  // ─── Layer 1s ─────────────────────────────────────────────────────
  BTCUSD:  crypto('e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', 'Bitcoin'),
  ETHUSD:  crypto('ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', 'Ethereum'),
  SOLUSD:  crypto('ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', 'Solana'),
  AVAXUSD: crypto('93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7', 'Avalanche'),
  DOTUSD:  crypto('ca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b', 'Polkadot'),
  ADAUSD:  crypto('2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d', 'Cardano'),
  NEARUSD: crypto('c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750', 'NEAR'),
  SUIUSD:  crypto('6120ffcf96395c70aa77e72dcb900bf9d40dccab228efca59a17b90ce423d5e8', 'Sui'),
  APTUSD:  crypto('03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5', 'Aptos'),
  SEIUSD:  crypto('53614f1cb0c031d4af66c04cb9c756234adad0e1cee85303795091499a4084eb', 'Sei'),
  TIAUSD:  crypto('09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723', 'Celestia'),
  INJUSD:  crypto('7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592', 'Injective'),

  // ─── L2s & Infrastructure ─────────────────────────────────────────
  XRPUSD:  crypto('ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8', 'XRP'),
  LINKUSD: crypto('8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221', 'Chainlink'),
  OPUSD:   crypto('385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf', 'Optimism'),
  ARBUSD:  crypto('3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5', 'Arbitrum'),
  POLUSD:  crypto('ffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472', 'Polygon'),
  WUSD:    crypto('6f02ad2b8a307411fc3baedb9876e83efe9fa9f5b752aab8c99f4742c9e5f5d5', 'Wormhole'),
  FETUSD:  crypto('7da003ada32eabbac855af3d22fcf0fe692cc589f0cfd5ced63cf0bdcc742efe', 'Fetch.ai'),
  RNDUSD:  crypto('3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d', 'Render'),

  // ─── DeFi ─────────────────────────────────────────────────────────
  UNIUSD:    crypto('78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501', 'Uniswap'),
  AAVEUSD:   crypto('2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445', 'Aave'),
  LDOUSD:    crypto('c63e2a7f37a04e5e614c07238bedb25dcc38927fba8fe890597a593c0b2fa4ad', 'Lido'),
  SNXUSD:    crypto('39d020f60982ed892abbcd4a06a276a9f9b7bfbce003204c110b6e488f502da3', 'Synthetix'),
  CRVUSD:    crypto('a19d04ac696c7a6616d291c7e5d1377cc8be437c327b75adb5dc1bad745fcae8', 'Curve'),
  PENDLEUSD: crypto('9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016', 'Pendle'),
  JUPUSD:    crypto('0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996', 'Jupiter'),
  ONDOUSD:   crypto('d40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3', 'Ondo'),
  JTOUSD:    crypto('b43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2', 'Jito'),

  // ─── Memecoins ────────────────────────────────────────────────────
  DOGEUSD: crypto('7eab5e260e42d81013207e623be60c66c9c55bfe0ace4797ad00d1c5a1335eae', 'Dogecoin'),
  PEPEUSD: crypto('d69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4', 'Pepe'),
  WIFUSD:  crypto('4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc', 'dogwifhat'),
  BONKUSD: crypto('72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419', 'Bonk'),
  WLDUSD:  crypto('d6835ad1f773de4a378115eb6824bd0c0e42d84d1c84d9750e853fb6b6c7794a', 'Worldcoin'),
  PYTHUSD: crypto('0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff', 'Pyth'),

  // ─── US Equities ──────────────────────────────────────────────────
  AAPLUSD: equity('5a207c4aa0114baecf852fcd9db9beb8ec715f2db48caa525dbd878fd416fb09', 'Apple'),
  TSLAUSD: equity('42676a595d0099c381687124805c8bb22c75424dffcaa55e3dc6549854ebe20a', 'Tesla'),
  NVDAUSD: equity('61c4ca5b9731a79e285a01e24432d57d89f0ecdd4cd7828196ca8992d5eafef6', 'Nvidia'),
  MSFTUSD: equity('8f98f8267ddddeeb61b4fd11f21dc0c2842c417622b4d685243fa73b5830131f', 'Microsoft'),
  GOGUSD:  equity('e65ff435be42630439c96396653a342829e877e2aafaeaf1a10d0ee5fd2cf3f2', 'Alphabet (GOOG)'),
  AMZNUSD: equity('82c59e36a8e0247e15283748d6cd51f5fa1019d73fbf3ab6d927e17d9e357a7f', 'Amazon'),
  METAUSD: equity('399f1e8f1c4a517859963b56f104727a7a3c7f0f8fee56d34fa1f72e5a4b78ef', 'Meta'),
  AMDUSD:  equity('7178689d88cdd76574b64438fc57f4e57efaf0bf5f9593ee19c10e46a3c5b5cf', 'AMD'),
  COINUSD: equity('fee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245', 'Coinbase'),
  MSTRUSD: equity('d8b856d7e17c467877d2d947f27b832db0d65b362ddb6f728797d46b0a8b54c0', 'MicroStrategy'),
  GMEUSD:  equity('6f9cd89ef1b7fd39f667101a91ad578b6c6ace4579d5f7f285a4b06aa4504be6', 'GameStop'),
  AMCUSD:  equity('5b1703d7eb9dc8662a61556a2ca2f9861747c3fc803e01ba5a8ce35cb50a13a1', 'AMC'),
  INTCUSD: equity('c13d72c7cc29fc43ee51ff322803aaffd04611756e4e1a6ea03ed8d97d5602a3', 'Intel'),
  NFLXUSD: equity('a68f6030142bf1370f0963cd2d33b8aef33e4777a0331a63b383b88b2fd92dd7', 'Netflix'),
  PLTRUSD: equity('3a4c922ec7e8cd86a6fa4005827e723a134a16f4ffe836eac91e7820c61f75a1', 'Palantir'),
  TSMUSD:  equity('e722560a66e4ab00522ef20a38fa2ba5d1b41f1c5404723ed895d202a7af7cc4', 'TSMC'),

  // ─── ETFs ─────────────────────────────────────────────────────────
  SPYUSD:  equity('5374a7d76a45ae2443cef351d10482b7bcc6ef5a928e75030d63b5fb3abe7cb5', 'S&P 500 ETF'),
  QQQUSD:  equity('5aa9f82dc2e0f5f8271fd163e980010101517da59f4b72b71c7056a5950b2f9d', 'Nasdaq ETF'),
  GLDUSD:  equity('e190f467043db04548200354889dfe0d9d314c08b8d4e62fabf4d5a3140fecca', 'Gold ETF'),
  ARKKUSD: equity('b2fe0af6c828efefda3ffda664f919825a535aa28a0f19fc238945c7aff540b1', 'ARK Innovation'),

  // ─── Commodities ──────────────────────────────────────────────────
  XAUUSD: commodity('765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2', 'Gold'),
  XAGUSD: commodity('f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e', 'Silver'),
};

/** Reverse lookup: Pyth feed ID → symbol */
export const feedIdToSymbol: Record<string, string> = Object.fromEntries(
  Object.entries(PYTH_FEEDS).map(([symbol, entry]) => [entry.id, symbol]),
);

/** Get all feed IDs for a specific category (or all if omitted) */
export function getFeedIds(category?: AssetCategory): string[] {
  return Object.values(PYTH_FEEDS)
    .filter((e) => !category || e.category === category)
    .map((e) => e.id);
}

/** Get display info for a symbol */
export function getFeedInfo(symbol: string): FeedEntry | undefined {
  return PYTH_FEEDS[symbol];
}

// Legacy USDT-suffixed aliases (positions table uses BTCUSDT etc.)
// Map BTCUSDT → BTCUSD etc. for backwards compat
export function normalizeSymbol(sym: string): string {
  if (sym.endsWith('USDT')) return sym.replace(/USDT$/, 'USD');
  return sym;
}

export function denormalizeSymbol(sym: string): string {
  if (sym.endsWith('USD') && !sym.endsWith('USDT')) return sym.replace(/USD$/, 'USDT');
  return sym;
}
