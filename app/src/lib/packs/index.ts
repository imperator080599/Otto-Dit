import type { AccountingMapPack, AssurancePack, FrameworkSet } from './types';
import { nepFr } from './nep-fr';
import { pcaobSox } from './pcaob-sox';
import { pcg } from './coa/pcg';
import { ifrs, usgaap } from './coa/generic';

// ISA core: the shared skeleton. National packs extend it; for v1 the two demo packs are
// self-contained and the core carries only shared defaults (used if a pack omits a field).
export const assurancePacks: Record<string, AssurancePack> = {
  'nep-fr': nepFr,
  'pcaob-sox': pcaobSox,
};

export const accountingMaps: Record<string, AccountingMapPack> = {
  pcg,
  ifrs,
  usgaap,
};

export function getAssurancePack(id: string): AssurancePack {
  const p = assurancePacks[id];
  if (!p) throw new Error(`unknown assurance pack: ${id}`);
  return p;
}

export function getAccountingMap(id: string): AccountingMapPack {
  const m = accountingMaps[id];
  if (!m) throw new Error(`unknown accounting map: ${id}`);
  return m;
}

export function primaryPack(fs: FrameworkSet): AssurancePack {
  return getAssurancePack(fs.assurance_packs[0]);
}

export type { AssurancePack, AccountingMapPack, FrameworkSet } from './types';
