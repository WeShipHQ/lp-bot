// import { PoolTrendingItem } from "@/types/trending.types";
// import { PoolSource } from "./hot-pools/types";
// import { solanaService } from "./solana.service";
// import {
//   DammV1Detail,
//   DammV2Detail,
//   DlmmDetail,
// } from "@/types/pool-details.types";

// function short(addr?: string, head = 4, tail = 4) {
//   if (!addr) return "";
//   if (addr.length <= head + tail + 1) return addr;
//   return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
// }
// function solscanAccountLink(addr: string) {
//   return `https://solscan.io/account/${addr}`;
// }
// function solscanTokenLink(mint: string) {
//   return `https://solscan.io/token/${mint}`;
// }
// function dexscreenerLink(addr: string) {
//   return `https://dexscreener.com/solana/${addr}`;
// }
// function fmtMoney(n?: number | null) {
//   if (n == null || Number.isNaN(n)) return "N/A";
//   const v = Math.abs(n);
//   if (v >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
//   if (v >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
//   if (v >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
//   return `$${n.toFixed(2)}`;
// }
// function fmtPct(n?: number | null) {
//   if (n == null || Number.isNaN(n)) return "N/A";
//   return `${n.toFixed(2)}%`;
// }
// function toNum(v: unknown): number | undefined {
//   if (typeof v === "number" && Number.isFinite(v)) return v;
//   if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
//     return Number(v);
//   }
//   return undefined;
// }
// function toStr(v: unknown): string | undefined {
//   return typeof v === "string" && v.length > 0 ? v : undefined;
// }

// export async function fetchDlmmDetail(
//   pairAddress: string
// ): Promise<DlmmDetail | null> {
//   const url = `https://dlmm-api.meteora.ag/pair/${pairAddress}`;
//   console.log("[DLMM] Fetching detail:", url);
//   const res = await fetch(url, { headers: { Accept: "application/json" } });
//   if (!res.ok) return null;

//   const json: unknown = await res.json();
//   if (json && typeof json === "object") {
//     return json as DlmmDetail;
//   }
//   return null;
// }

// export async function fetchDammV1Detail(
//   poolAddress: string
// ): Promise<DammV1Detail | null> {
//   const url = `https://damm-api.meteora.ag/pools?address=${poolAddress}`;
//   console.log("[DAMM v1] Fetching detail:", url);
//   const res = await fetch(url, { headers: { Accept: "application/json" } });
//   if (!res.ok) return null;

//   const json: unknown = await res.json();
//   if (Array.isArray(json) && json.length > 0 && typeof json[0] === "object") {
//     return json[0] as DammV1Detail;
//   }
//   return null;
// }

// export async function fetchDammV2Detail(
//   poolAddress: string
// ): Promise<DammV2Detail | null> {
//   const url = `https://dammv2-api.meteora.ag/pools/${poolAddress}`;
//   console.log("[DAMM v2] Fetching detail:", url);
//   const res = await fetch(url, { headers: { Accept: "application/json" } });
//   if (!res.ok) return null;

//   const json: unknown = await res.json();
//   if (
//     json &&
//     typeof json === "object" &&
//     "data" in (json as Record<string, unknown>)
//   ) {
//     const data = (json as { data: unknown }).data;
//     if (data && typeof data === "object") return data as DammV2Detail;
//   }
//   return null;
// }

// export async function buildPoolDetailMarkdown(
//   source: PoolSource,
//   baseItem: PoolTrendingItem,
//   opts?: { wallet?: string }
// ): Promise<string> {
//   const b = baseItem as unknown as Record<string, unknown>;

//   const poolAddress =
//     toStr((baseItem as { poolAddress?: string }).poolAddress) ??
//     toStr(b["address"]) ??
//     toStr(b["pool_address"]) ??
//     "";

//   let tvl = toNum(b["tvl"]) ?? 0;
//   let apy = toNum(b["apy"]) ?? 0;
//   let fee24h = toNum(b["fee24h"]) ?? 0;
//   let feeTvlRatio24h: number | null = toNum(b["feeTvlRatio"]) ?? null;

//   let vol30m: number | null = null;
//   let vol1h: number | null = null;
//   let vol4h: number | null = null;
//   let vol24h: number | null = null;

//   let tokenAMint: string | undefined;
//   let tokenBMint: string | undefined;

//   if (source === "dlmm") {
//     const d = await fetchDlmmDetail(poolAddress);
//     if (d) {
//       tvl = toNum(d.liquidity) ?? tvl;
//       apy = toNum(d.apy) ?? apy;
//       fee24h = toNum(d.fees_24h) ?? fee24h;
//       feeTvlRatio24h =
//         toNum(d.fee_tvl_ratio?.hour_24) ??
//         toNum(d.fee_tvl_ratio?.hour_12) ??
//         feeTvlRatio24h;
//       vol30m = toNum(d.volume?.min_30) ?? null;
//       vol1h = toNum(d.volume?.hour_1) ?? null;
//       vol4h = toNum(d.volume?.hour_4) ?? null;
//       vol24h = toNum(d.volume?.hour_24) ?? null;
//       tokenAMint = toStr(d.mint_x);
//       tokenBMint = toStr(d.mint_y);
//     }
//   } else if (source === "dammv1") {
//     const d = await fetchDammV1Detail(poolAddress);
//     if (d) {
//       tvl = toNum(d.pool_tvl) ?? tvl;
//       fee24h = toNum(d.fee_volume) ?? fee24h;
//       vol24h = toNum(d.trading_volume) ?? vol24h;

//       const apyNum = toNum(d.weekly_trade_apy ?? d.trade_apy);
//       if (typeof apyNum === "number") apy = apyNum;

//       if ((tvl ?? 0) > 0 && (fee24h ?? 0) > 0) feeTvlRatio24h = fee24h / tvl;

//       tokenAMint = toStr(d.pool_token_mints?.[0]);
//       tokenBMint = toStr(d.pool_token_mints?.[1]);
//     }
//   } else {
//     const d = await fetchDammV2Detail(poolAddress);
//     if (d) {
//       if (typeof d.tvl === "number") tvl = d.tvl;
//       if (typeof d.fee24h === "number") fee24h = d.fee24h;
//       if (typeof d.fee_tvl_ratio === "number") feeTvlRatio24h = d.fee_tvl_ratio;
//       if (typeof d.volume24h === "number") vol24h = d.volume24h;
//       if (typeof d.apr === "number") apy = d.apr;
//       tokenAMint = d.token_a_mint ?? tokenAMint;
//       tokenBMint = d.token_b_mint ?? tokenBMint;
//     }
//   }

//   const tokenPair =
//     toStr((baseItem as { tokenPair?: string }).tokenPair) ??
//     toStr((baseItem as { poolName?: string }).poolName) ??
//     "Pool";

//   const poolType =
//     toStr((baseItem as { poolType?: string }).poolType) ?? source.toUpperCase();

//   const poolAddrLink = poolAddress
//     ? `[${short(poolAddress)}](${solscanAccountLink(poolAddress)})`
//     : "N/A";

//   const aMintLink = tokenAMint
//     ? `[${short(tokenAMint)}](${solscanTokenLink(tokenAMint)})`
//     : "";
//   const bMintLink = tokenBMint
//     ? `[${short(tokenBMint)}](${solscanTokenLink(tokenBMint)})`
//     : "";

//   const explorer = poolAddress
//     ? `[Explorer](${solscanAccountLink(poolAddress)})`
//     : "";
//   const dexs = poolAddress
//     ? `[Dexscreener](${dexscreenerLink(poolAddress)})`
//     : "";

//   let walletLine = "";
//   if (opts?.wallet) {
//     try {
//       const sol = await solanaService.getBalance(opts.wallet);
//       walletLine = `\nWallet balance: ${sol.toFixed(4)} SOL`;
//     } catch {
//       walletLine = `\nWallet balance: N/A`;
//     }
//   }

//   const lines: string[] = [];
//   lines.push(`*${tokenPair}* | ${poolType}`);
//   if (poolAddrLink) lines.push(poolAddrLink);
//   if (aMintLink) lines.push(`A mint: ${aMintLink}`);
//   if (bMintLink) lines.push(`B mint: ${bMintLink}`);
//   lines.push("");
//   if (explorer || dexs)
//     lines.push([explorer, dexs].filter(Boolean).join(" | "));
//   lines.push("");
//   lines.push(`TVL: *${fmtMoney(tvl)}*`);
//   lines.push(`APY (24h): *${fmtPct(apy)}*`);
//   lines.push(`Fee (24h): *${fmtMoney(fee24h)}*`);
//   if (feeTvlRatio24h != null) {
//     lines.push(`Fee/TVL (24h): *${fmtPct((feeTvlRatio24h ?? 0) * 100)}*`);
//   }
//   lines.push("");
//   lines.push(`*Volume*`);
//   lines.push(
//     `30m: ${vol30m != null ? fmtMoney(vol30m) : "N/A"}, ` +
//       `1h: ${vol1h != null ? fmtMoney(vol1h) : "N/A"}, ` +
//       `4h: ${vol4h != null ? fmtMoney(vol4h) : "N/A"}, ` +
//       `24h: ${vol24h != null ? fmtMoney(vol24h) : "N/A"}`
//   );
//   if (walletLine) lines.push(walletLine);

//   return lines.join("\n");
// }
