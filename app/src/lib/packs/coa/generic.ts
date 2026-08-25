import type { AccountingMapPack } from '../types';
import { pcg } from './pcg';

// Thin demo maps for IFRS / US GAAP chart shapes (Gate 1 trim: PCG is the full map; these
// are labeled demo skeletons proving the map-pack mechanism, to be authored properly when
// a market needs them). They reuse the FSLI list (codes are framework-neutral).

export const ifrs: AccountingMapPack = {
  id: 'ifrs',
  name: 'IFRS demo map (skeleton)',
  fslis: pcg.fslis,
  rules: [
    { prefix: '1', fsli: 'PPE', priority: 1 },
    { prefix: '2', fsli: 'TRADE_RECEIVABLES', priority: 1 },
    { prefix: '3', fsli: 'CASH', priority: 1 },
    { prefix: '4', fsli: 'TRADE_PAYABLES', priority: 1 },
    { prefix: '5', fsli: 'EQUITY', priority: 1 },
    { prefix: '6', fsli: 'REVENUE', priority: 1 },
    { prefix: '7', fsli: 'PURCHASES', priority: 1 },
  ],
};

export const usgaap: AccountingMapPack = {
  id: 'usgaap',
  name: 'US GAAP demo map (skeleton)',
  fslis: pcg.fslis,
  rules: [
    { prefix: '1', fsli: 'CASH', priority: 1 },
    { prefix: '12', fsli: 'TRADE_RECEIVABLES', priority: 2 },
    { prefix: '15', fsli: 'PPE', priority: 2 },
    { prefix: '2', fsli: 'TRADE_PAYABLES', priority: 1 },
    { prefix: '3', fsli: 'EQUITY', priority: 1 },
    { prefix: '4', fsli: 'REVENUE', priority: 1 },
    { prefix: '5', fsli: 'PURCHASES', priority: 1 },
  ],
};
