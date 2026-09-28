const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const fmtCompact = (n: number) => compact.format(n);
export const fmtUsd = (n: number) => usd.format(n);
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
