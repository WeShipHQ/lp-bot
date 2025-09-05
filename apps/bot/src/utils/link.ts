export function getPositionStartCommand(
  botName: string,
  positionAddress: string
) {
  return `https://t.me/${botName}?start=dlmm_position_${positionAddress}`;
}

export function getPoolStartCommand(botName: string, poolAddress: string) {
  return `https://t.me/${botName}?start=dlmm_pool_${poolAddress}`;
}

export function getSolscanLink(
  type: "account" | "tx" | "block",
  value: string
) {
  return `https://solscan.io/${type}/${value}`;
}
