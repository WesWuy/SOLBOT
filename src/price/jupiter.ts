/**
 * SOL/USDC pricing from the Jupiter Quote API. Quote-only — no swaps are ever
 * built, signed, or sent. Both directions are quoted to estimate mid + spread:
 *   sell side: 1 SOL -> USDC        => pSell (USDC per SOL)
 *   buy side:  that USDC -> SOL     => pBuy  (USDC per SOL)
 */

import type { PricePoint } from '../types.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;
const QUOTE_SOL = 1; // 1 SOL notional

// v6 endpoint per spec, with the lite-api successor as fallback.
const ENDPOINTS = [
  'https://quote-api.jup.ag/v6/quote',
  'https://lite-api.jup.ag/swap/v1/quote',
];

async function quote(inputMint: string, outputMint: string, amount: bigint): Promise<bigint> {
  let lastError: unknown;
  for (const base of ENDPOINTS) {
    const url = `${base}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        lastError = new Error(`${base} -> HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { outAmount?: string };
      if (!body.outAmount) {
        lastError = new Error(`${base} -> missing outAmount`);
        continue;
      }
      return BigInt(body.outAmount);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`All Jupiter quote endpoints failed: ${String(lastError)}`);
}

export async function fetchPrice(now = Date.now()): Promise<PricePoint> {
  const lamportsIn = BigInt(QUOTE_SOL * 10 ** SOL_DECIMALS);
  const usdcOut = await quote(SOL_MINT, USDC_MINT, lamportsIn);
  const pSell = Number(usdcOut) / 10 ** USDC_DECIMALS / QUOTE_SOL;

  // Round-trip the USDC back into SOL to estimate the buy-side price.
  const solOut = await quote(USDC_MINT, SOL_MINT, usdcOut);
  const solOutUi = Number(solOut) / 10 ** SOL_DECIMALS;
  const pBuy = Number(usdcOut) / 10 ** USDC_DECIMALS / solOutUi;

  const mid = (pSell + pBuy) / 2;
  const spreadPct = Math.max(0, (pBuy - pSell) / mid);
  return { ts: now, mid, spreadPct };
}
