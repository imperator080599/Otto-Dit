import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  estWindows, binaireDe, groupeDetache, commandeTuer,
  enchaine, avecPort, commandeReinstalle, conseilNode, cheminChromium,
  causeEchecBase,
} from '../app/scripts/lib/portable.mjs';

/* LA MOITIÉ WINDOWS DE portable.mjs SERAIT DU CODE QUE PERSONNE N'EXÉCUTE
   avant un utilisateur — le premier a payé `spawn npx ENOENT` pour l'apprendre.
   La plateforme est donc un PARAMÈTRE : les deux branches s'exécutent ici,
   depuis Linux. Ce que ce test ne prouve pas, et ne prétend pas prouver :
   que Windows lui-même se comporte comme prévu (taskkill, PowerShell). Cela
   ne se vérifie que sur une machine Windows — c'est dit dans STATUS.md. */

const APP = path.resolve(import.meta.dirname, '..', 'app');

describe('portable.mjs — les binaires sont résolus vers de vrais fichiers', () => {
  it('tsx et next existent là où le champ bin de leur package.json les met', () => {
    for (const paquet of ['tsx', 'next']) {
      const bin = binaireDe(paquet, APP);
      expect(bin, `${paquet} doit être résolu`).toBeTruthy();
      expect(fs.existsSync(bin!), `${bin} doit exister`).toBe(true);
      /* Le point du correctif : on n'exécute JAMAIS un .cmd ni un shim de
         .bin — on donne un fichier JavaScript au Node courant. */
      expect(bin).not.toMatch(/\.cmd$|\.ps1$|[\\/]\.bin[\\/]/);
    }
  });

  it('un paquet absent rend null — le message appartient à l’appelant', () => {
    expect(binaireDe('paquet-qui-nexiste-pas', APP)).toBeNull();
  });
});

describe('portable.mjs — la branche Windows, exécutée depuis Linux', () => {
  it('détection de plateforme', () => {
    expect(estWindows('win32')).toBe(true);
    expect(estWindows('linux')).toBe(false);
    expect(estWindows('darwin')).toBe(false);
  });

  it('tuer un arbre : taskkill /T sur Windows, -pid (groupe) sur POSIX', () => {
    expect(commandeTuer(4242, 'SIGTERM', 'win32'))
      .toEqual({ exe: 'taskkill', args: ['/pid', '4242', '/T', '/F'] });
    expect(commandeTuer(4242, 'SIGKILL', 'linux'))
      .toEqual({ groupe: -4242, signal: 'SIGKILL' });
  });

  it('detached (groupe de processus) : POSIX seulement', () => {
    expect(groupeDetache('linux')).toBe(true);
    expect(groupeDetache('darwin')).toBe(true);
    expect(groupeDetache('win32')).toBe(false);
  });

  it('les conseils s’écrivent dans la syntaxe du terminal qui les lira', () => {
    /* `&&` n'existe pas dans le PowerShell 5.1 livré avec Windows, et
       `PORT=3100 cmd` y est une erreur de parsing : un conseil que le
       terminal refuse de coller envoie l'utilisateur au mauvais endroit. */
    expect(enchaine(['cd app', 'npm install'], 'win32')).toBe('cd app; npm install');
    expect(enchaine(['cd app', 'npm install'], 'linux')).toBe('cd app && npm install');
    expect(avecPort(3100, 'npm run demo', 'win32')).toBe('$env:PORT=3100; npm run demo');
    expect(avecPort(3100, 'npm run demo', 'linux')).toBe('PORT=3100 npm run demo');
    expect(commandeReinstalle('win32')).toContain('Remove-Item');
    expect(commandeReinstalle('linux')).toContain('rm -rf');
    expect(conseilNode('win32')).toContain('nodejs.org');
    expect(conseilNode('win32')).not.toContain('nvm');
  });

  it('chromium : la variable commande, sinon le conteneur s’il existe, sinon Playwright', () => {
    expect(cheminChromium({ PLAYWRIGHT_CHROMIUM: 'C:\\navigateur\\chrome.exe' }))
      .toBe('C:\\navigateur\\chrome.exe');
    const attendu = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
    expect(cheminChromium({})).toBe(attendu);
  });
});

describe('portable.mjs — chaque échec de base a sa cause, jamais la mauvaise', () => {
  it('disque plein', () => {
    expect(causeEchecBase('Error: ENOSPC: no space left on device, write')).toBe('espace');
  });
  it('base tenue par un autre processus (l’abandon PGlite, EBUSY de Windows)', () => {
    expect(causeEchecBase('RuntimeError: Aborted(). Build with -sASSERTIONS')).toBe('tenue');
    expect(causeEchecBase("EBUSY: resource busy or locked, unlink '.data\\pg\\base'")).toBe('tenue');
    expect(causeEchecBase('EPERM: operation not permitted')).toBe('tenue');
  });
  it('installation cassée', () => {
    expect(causeEchecBase("Error: Cannot find module '@electric-sql/pglite'")).toBe('casse');
    expect(causeEchecBase('ERR_MODULE_NOT_FOUND')).toBe('casse');
  });
  it("l'inconnue reste inconnue — jamais déguisée en cause probable", () => {
    expect(causeEchecBase('violation de contrainte migration 0017')).toBe('inconnue');
    expect(causeEchecBase('')).toBe('inconnue');
  });
});
