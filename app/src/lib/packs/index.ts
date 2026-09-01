import type { AccountingMapPack, AssurancePack, FrameworkSet, Vocabulaire } from './types';
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

/**
 * Le mot du référentiel pour un concept. Le premier pack déclaré commande —
 * un dossier qui porte deux packs porte deux méthodes, jamais deux mots pour
 * la même chose sur le même écran (DA-15).
 */
export function motDuPack(packs: string[], cle: keyof Vocabulaire): string {
  const id = packs.find((p) => p in assurancePacks);
  return (id ? assurancePacks[id].vocabulaire : nepFr.vocabulaire)[cle];
}

export type { AssurancePack, AccountingMapPack, FrameworkSet, Vocabulaire } from './types';
