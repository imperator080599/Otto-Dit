'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useReplis } from '@/app/replis-contexte';
import { usePathname } from 'next/navigation';
import { GROUPES_CLES, type EntreeRail } from '@/lib/services/rail-vue';
import { useT } from '@/lib/i18n/client';

// LE RAIL VERTICAL (ADR-112, R-03) — avec le REPLI PAR GROUPE (revue n°2) et,
// depuis le mandat de la soirée (§1), le REPLI DU RAIL ENTIER.
//
// Les onglets en haut mettaient trente destinations sur une ligne et les
// donnaient toutes pour égales ; elles ne le sont pas. À gauche, en colonne, un
// groupe par nature de travail, les ÉTATS FINANCIERS au milieu parce que c'est
// là que le dossier se fait.
//
// DEUX MÉCANISMES QUI NE SE REMPLACENT PAS. Le repli est CHOISI par
// l'utilisateur : il range ce dont il n'a pas besoin maintenant. La règle
// d'état (ADR-103) reste entière : ce qui n'est pas encore atteignable est
// GRISÉ avec sa raison derrière « tout afficher », jamais absent. Confondre
// les deux ferait disparaître des destinations sans que personne sache
// pourquoi.
//
// LA MÉMOIRE DU REPLI est EN BASE, PAR PERSONNE (mandat de nuit n°2, 1.2 ;
// migration 0132) — le rail rangé et les groupes fermés suivent le compte d'un
// poste de travail à l'autre, et le serveur les connaît au premier rendu : le
// layout pose la classe de grille avant l'hydratation, rien ne saute. Par
// défaut, tout est déplié : un rail qui s'ouvre replié sur un compte neuf
// cacherait le dossier à qui le découvre. Seule l'ASTUCE du raccourci reste
// dans le navigateur : ce n'est pas un rangement, c'est une bulle vue une fois.

const CLE_RAIL = 'rail';
const cleGroupe = (g: string) => `rail.groupe.${g}`;
const CLE_ASTUCE = 'otto.rail.astuce';

function lire(cle: string): string | null {
  try { return window.localStorage.getItem(cle); } catch { return null; }
}
function ecrire(cle: string, valeur: string): void {
  try { window.localStorage.setItem(cle, valeur); } catch { /* navigateur qui refuse : rien à mémoriser */ }
}

export function EngNav({ entrees, tout: libelleTout, reduire, libelles }: {
  entrees: EntreeRail[]; tout: string; reduire: string;
  libelles: { replier: string; deplier: string; astuce: string; astuceVue: string };
}) {
  const t = useT();
  const pathname = usePathname();
  const memoire = useReplis();
  const [tout, setTout] = useState(false);
  /* Le repli est un ÉTAT, pas un attribut posé une fois : sans lui, chaque
     rendu (une navigation suffit) rouvrirait ce que l'utilisateur a rangé.
     Il part de la mémoire en base, connue du serveur : `replies[g]` vaut
     vrai quand le groupe est FERMÉ. */
  const [replies, setReplies] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPES_CLES.map((g) => [g, memoire.lire(cleGroupe(g)) === false])));
  const [replie, setReplie] = useState(() => memoire.lire(CLE_RAIL) === false);
  const [astuce, setAstuce] = useState(false);

  useEffect(() => {
    setAstuce(lire(CLE_ASTUCE) !== '1');
  }, []);

  /* Le corps du dossier s'élargit quand le rail se range : la grille est sur
     le parent, on lui pose la classe. */
  useEffect(() => {
    const dossier = document.querySelector('.dossier');
    if (dossier) dossier.classList.toggle('rail-replie', replie);
  }, [replie]);

  const basculer = () => {
    setReplie((r) => { void memoire.memoriser(CLE_RAIL, r); return !r; });
  };

  /* LA TOUCHE [ : hors d'un champ de saisie, elle replie ou déplie le rail. */
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const dansSaisie = cible?.tagName === 'INPUT' || cible?.tagName === 'TEXTAREA' || cible?.tagName === 'SELECT' || cible?.isContentEditable;
      if (e.key === '[' && !dansSaisie && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); basculer(); }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  const aVenir = entrees.filter((x) => !x.atteignable);
  const actif = (href: string) =>
    (/\/eng\/[^/]+$/.test(href) ? pathname === href : pathname.startsWith(href));

  return (
    <nav className={`rail${replie ? ' replie' : ''}`} aria-label={t('col.sections')} data-rail-replie={replie ? '1' : '0'}>
      <button type="button" className="rail-bascule" onClick={basculer} aria-expanded={!replie}
        title={`${replie ? libelles.deplier : libelles.replier} — [`}>
        {replie ? '›' : `‹ ${libelles.replier}`}
      </button>
      {astuce && !replie && (
        <div className="rail-astuce" data-rail-astuce>
          <span>{libelles.astuce}</span>
          <button type="button" onClick={() => { ecrire(CLE_ASTUCE, '1'); setAstuce(false); }}>{libelles.astuceVue}</button>
        </div>
      )}
      {GROUPES_CLES.map((cle) => {
        const dedans = entrees.filter((x) => x.groupeCle === cle);
        const visibles = dedans.filter((x) => x.atteignable || tout);
        if (visibles.length === 0) return null;
        const titre = dedans[0].groupe;
        return (
          <details className="rail-groupe" key={cle} open={!replies[cle]}
            onToggle={(ev) => {
              /* LIRE L'ÉTAT AVANT la mise à jour : dans le calcul différé,
                 React a déjà libéré l'événement et `currentTarget` est null —
                 une exception par bascule, invisible tant qu'on ne clique
                 pas. Mesurée par `npm run clics`, corrigée ici. */
              const ouvert = ev.currentTarget.open;
              setReplies((r) => ({ ...r, [cle]: !ouvert }));
              void memoire.memoriser(cleGroupe(cle), ouvert);
            }}>
            <summary className="rail-titre">
              <span className="chevron" aria-hidden="true">▸</span>{titre}
            </summary>
            {visibles.map((it) => (it.atteignable ? (
              <Link key={it.href + it.label} href={it.href}
                className={`rail-lien${actif(it.href) ? ' active' : ''}`} title={it.phrase}>
                {it.label}
              </Link>
            ) : (
              <span key={it.href + it.label} className="rail-lien grise" title={it.phrase}>
                {it.label}
                <span className="raison">{it.raison}</span>
              </span>
            )))}
          </details>
        );
      })}
      {aVenir.length > 0 && (
        <button type="button" className="rail-tout" onClick={() => setTout(!tout)}>
          {tout ? reduire : `${libelleTout} (${aVenir.length})`}
        </button>
      )}
    </nav>
  );
}
