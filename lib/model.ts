// The token radar's model: one snapshot of the protocol universe in, one ranked board out.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants - kept for API compatibility, even if new valuation model overrides some logic. */
export interface ModelConstants {
  base_multiple: number; // Placeholder, now unused
}
export const MODEL: ModelConstants = { base_multiple: 0.25 };
export const MODEL_VERSION = 'radar-2';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  implied_value_usd: number;
  model: {
    category_multiple: number;
    momentum_factor: number;
    seasoning_factor: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  implied_value_usd: number;
  category_multiple: number;
  momentum_factor: number;
  seasoning_factor: number;
}

/** A live-token protocol. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const STAKING_WORDS = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIXES = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol, watchlist: string[]): boolean {
  if (!isPreToken(p)) return false;
  if (watchlist.includes(p.slug)) return true; // Watchlist protocols are always included

  if (p.category && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (p.name && VERSIONED.test(p.name)) return false;
  if (p.name && STAKING_WORDS.test(p.name)) return false;
  if (p.name && EXCHANGE_PREFIXES.test(p.name)) return false;

  return true;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getCategoryMultiples(protocols: SnapshotProtocol[]): Map<string, number> {
  const groups: Map<string, number[]> = new Map();
  for (const p of protocols) {
    if (!isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0) {
      const cat = p.category ?? 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(p.mcap_usd / p.tvl_usd);
    }
  }

  const categoryMedians: Map<string, number> = new Map();
  const allRatios: number[] = [];
  for (const [cat, ratios] of groups) {
    allRatios.push(...ratios);
    if (ratios.length >= 3) {
      categoryMedians.set(cat, median(ratios));
    }
  }

  const globalMedian = median(allRatios);
  
  // Apply fallback
  const finalMultiples: Map<string, number> = new Map();
  for (const cat of groups.keys()) {
    if (categoryMedians.has(cat)) {
      finalMultiples.set(cat, categoryMedians.get(cat)!);
    } else {
      // Fallback
      finalMultiples.set(cat, globalMedian);
    }
  }
  finalMultiples.set('Other', globalMedian); // Default fallback

  return finalMultiples;
}

function getMomentumFactor(change7d: number | null): number {
  if (change7d === null) return 1.0;
  const clamped = Math.max(-30, Math.min(50, change7d));
  // Map [-30, 50] to [0.85, 1.20]
  // 1.20 - 0.85 = 0.35 range
  // 50 - (-30) = 80 range
  return 0.85 + (clamped + 30) * (0.35 / 80);
}

function getSeasoningFactor(age: number | null): number {
  if (age === null) return 1.0;
  // Map [0, 365+] to [0.90, 1.15]
  // 1.15 - 0.90 = 0.25 range
  const cappedAge = Math.min(365, age);
  return 0.90 + cappedAge * (0.25 / 365);
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function actionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const cap = 100; // Simplified for templates
  if (c.includes('lend') || c.includes('cdp')) return `Supply $${cap} of USDC to ${name} on ${chain} and manage position.`;
  if (c.includes('dex') || c.includes('yield')) return `Provide $${cap} of liquidity to ${name}'s pool on ${chain}.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${cap} of USDC as margin on ${name} and hedge.`;
  if (c.includes('gaming')) return `Engage in ${name} gameplay on ${chain} with $${cap} of assets.`;
  if (c.includes('nft')) return `List or bid on ${name} assets on ${chain} with $${cap}.`;
  if (c.includes('payments')) return `Use ${name} to transact $${cap} on ${chain}.`;
  if (c.includes('privacy')) return `Shield $${cap} on ${name} on ${chain}.`;
  if (c.includes('ai')) return `Train or compute with ${name} using $${cap} on ${chain}.`;
  return `Deposit $${cap} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function farmSteps(p: SnapshotProtocol): FarmStep[] {
  const chain = chainOf(p);
  const action = actionFor(p, chain);
  return [
    { text: `Prepare a dedicated wallet for ${p.name} farming.`, cost: '$1 gas', time: '5 mins' },
    { text: action, cost: '$100 capital + gas', time: '20 mins' },
    { text: `Weekly interaction with ${p.name}.`, cost: '$2 gas/week', time: '10 mins/week' },
    { text: `Maintain position for snapshot eligibility.`, cost: 'opportunity cost', time: 'ongoing' },
  ];
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const multiples = getCategoryMultiples(snapshot.protocols);
  
  const board = snapshot.protocols
    .filter(p => isRankable(p, snapshot.watchlist))
    .map(p => {
      const cat = p.category ?? 'Other';
      const catMult = multiples.get(cat) ?? 0.205; // Fallback to global median
      const mom = getMomentumFactor(p.change_7d);
      const sea = getSeasoningFactor(ageDays(snapshot.as_of, p.listed_at));
      const implied = Math.max(1, Math.round(p.tvl_usd * catMult * mom * sea));
      
      return { p, implied, catMult, mom, sea };
    })
    .sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1))
    .map((s, i) => ({
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      implied_value_usd: s.implied,
      model: {
        category_multiple: s.catMult,
        momentum_factor: s.mom,
        seasoning_factor: s.sea,
      },
      farm_steps: farmSteps(s.p).map(f => `${f.text} Cost: ${f.cost}. Time: ${f.time}.`),
    }));

  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter(r => !snapshot.watchlist.includes(r.slug)).length,
    live_size: live.length,
    rows: board.map(r => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      implied_value_usd: r.implied_value_usd,
      category_multiple: r.model.category_multiple,
      momentum_factor: r.model.momentum_factor,
      seasoning_factor: r.model.seasoning_factor,
    })),
    live,
  };

  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  // ... Keep original implementation ...
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  
  // Sort and check ranks
  const sorted = [...board].sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.rank !== i + 1) return `rank ${i + 1} is ${sorted[i]!.rank}`;
  }

  // Check row count constraint (>= 100)
  if (board.length < 100) return `board has only ${board.length} rows, need >= 100`;

  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
