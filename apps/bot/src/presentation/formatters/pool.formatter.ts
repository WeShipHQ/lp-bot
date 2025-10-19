import { UnifiedPool } from "@/shared/types/pool.types";
import { link } from "@/bot/utils/text-formatters";
import { getPoolDeeplink } from "@/bot/utils/misc";
import { formatCurrency, formatNumber, formatPercentage } from "./base.formatter";

export class PoolFormatter {
  static formatPoolCard(pool: UnifiedPool): string {
    const tokenPair = `${pool.tokenA.symbol}/${pool.tokenB.symbol}`;
    const tvl = formatCurrency(Number(pool.tvl), { maxDecimals: 3 });
    const apy = `${(pool.apy * 100).toFixed(2)}%`;
    const fee24h = formatCurrency(pool.fees24h || 0, { maxDecimals: 3 });
    const feeTvlRatio = pool.feeTvlRatio24h ? formatPercentage(pool.feeTvlRatio24h * 100, { decimals: 2 }) : 'N/A';

    const header = `*${tokenPair}*`;
    const lines = [
      header,
      `TVL: ${tvl} | APY: ${apy}`,
      `Fee(24h): ${fee24h} | Fee/TVL: ${feeTvlRatio}`,
    ];
    return lines.join('\n');
  }

  static formatPoolDetails(pool: UnifiedPool): string {
    const tokenPair = `${pool.tokenA.symbol.toUpperCase()}/${pool.tokenB.symbol.toUpperCase()}`;
    const poolLink = link('Open', getPoolDeeplink('pandalpbot', pool.dex, pool.address));
    const tvl = formatCurrency(Number(pool.tvl), { maxDecimals: 3 });
    const apy = `${(pool.apy * 100).toFixed(2)}%`;
    const fee24h = formatCurrency(pool.fees24h || 0, { maxDecimals: 3 });
    const feeTvl = pool.feeTvlRatio24h ? formatPercentage(pool.feeTvlRatio24h * 100, { decimals: 2 }) : 'N/A';
    const vol24h = formatCurrency(pool.volume24h || 0, { maxDecimals: 3 });

    return [
      `*${tokenPair}* | ${poolLink}`,
      '',
      `TVL: ${tvl}`,
      `APY: ${apy}`,
      `Fee (24h): ${fee24h}`,
      `Fee/TVL (24h): ${feeTvl}`,
      `24h Vol: ${vol24h}`,
    ].join('\n');
  }

  static formatTrendingList(pools: UnifiedPool[], page: number, totalPages: number, sortBy: string): string {
    const lines: string[] = [];
    pools.forEach((pool, index) => {
      const displayIndex = (page - 1) * pools.length + index + 1;
      const apy = `${(pool.apy * 100).toFixed(2)}%`;
      const tvl = formatCurrency(Number(pool.tvl), { maxDecimals: 3 });
      const fee24h = formatCurrency(pool.fees24h || 0, { maxDecimals: 3 });
      const feeTvl = pool.feeTvlRatio24h ? formatPercentage(pool.feeTvlRatio24h * 100, { decimals: 2 }) : 'N/A';
      const line = `/${displayIndex} ${pool.tokenA.symbol}-${pool.tokenB.symbol} | APY: *${apy}* | TVL: *${tvl}* | Fee24h: *${fee24h}* | Fee/TVL: *${feeTvl}*`;
      lines.push(line, '');
    });

    lines.push(`💡 Sorted by ${sortBy}. Page ${page}/${totalPages}`);
    lines.push('');
    lines.push('_Tap a command to view pool details_');

    return ['🔥 *Hot Pools*', '', ...lines].join('\n');
  }
}
