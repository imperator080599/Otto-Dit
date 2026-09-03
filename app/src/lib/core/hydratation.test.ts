import { describe, it, expect } from 'vitest';
import { divergence, divergences } from './hydratation';

/**
 * LA COMPARAISON SERVEUR/CLIENT, ÉPROUVÉE CONTRE DES CAS CONNUS MAUVAIS
 * (règle 17 ; mandat du soir, étage 0.4 §3.2).
 *
 * Un comparateur qui répond « aucune divergence » à tout passerait pour un
 * instrument sain sur un parcours vert. Ces cas le font parler.
 */
describe('la divergence serveur/client', () => {
  const page = (dedans: string) => `<!DOCTYPE html><html lang="en"><body><div id="a">${dedans}</div></body></html>`;

  it('deux rendus identiques : rien à dire', () => {
    expect(divergence(page('bonjour'), page('bonjour'))).toBeNull();
  });

  it('CAS MAUVAIS « text » — un nœud de texte diffère, et les DEUX valeurs sont montrées', () => {
    const d = divergence(page('0.4172'), page('0.9931'));
    expect(d, 'une divergence de texte n’est pas vue').not.toBeNull();
    expect(d!).toMatch(/SERVEUR/);
    expect(d!).toMatch(/0\.4172/);
    expect(d!).toMatch(/0\.9931/);
  });

  it('CAS MAUVAIS « HTML » — un élément de plus côté client', () => {
    const d = divergence(page('x'), page('x<span>y</span>'));
    expect(d).not.toBeNull();
    expect(d!).toMatch(/span/);
  });

  it('CE QU’IL NE DOIT PAS ACCUSER : la charge RSC et les marqueurs de suspension', () => {
    const serveur = `<html lang="fr"><body><!--$--><p>a</p><!--/$-->`
      + `<script>self.__next_f.push([1,"charge utile"])</script></body></html>`;
    const client = `<html lang="fr"><body><p>a</p></body></html>`;
    expect(divergence(serveur, client), 'la charge RSC est prise pour une divergence').toBeNull();
  });

  it('CE QU’IL NE DOIT PAS ACCUSER NON PLUS : le doctype et l’ordre du `<head>`', () => {
    /* LE DÉFAUT QUE L'INSTRUMENT A EU EN PREMIER, et qui le rendait muet en
       parlant : le HTML servi porte `<!DOCTYPE html>` que `outerHTML` n'a pas,
       et React réordonne le `<head>` à l’hydratation. Chaque incident rendait
       « à l’octet 1 ». */
    const serveur = `<!DOCTYPE html><html lang="fr"><head><meta charSet="utf-8"/>`
      + `<link rel="stylesheet" href="/a.css"/></head><body><p>même</p></body></html>`;
    const client = `<html lang="fr"><head><link rel="stylesheet" href="/a.css">`
      + `<meta charset="utf-8"></head><body><p>même</p></body></html>`;
    expect(divergence(serveur, client), 'le doctype ou l’ordre du head est pris pour une divergence').toBeNull();
  });

  it('CE QU’IL NE DOIT PAS ACCUSER, TROISIÈME FAMILLE : la sérialisation du navigateur', () => {
    /* Les trois artefacts que la première version prenait pour des
       divergences — et qui masquaient le vrai à chaque incident. */
    const serveur = `<body><span>Karim<!-- --> <span style="opacity:0.6">(<!-- -->senior<!-- -->)</span></span>`
      + `<div style="max-width:860px">chiffre d&#x27;affaires</div></body>`;
    const client = `<body><span>Karim <span style="opacity: 0.6;">(senior)</span></span>`
      + `<div style="max-width: 860px;">chiffre d'affaires</div></body>`;
    expect(divergence(serveur, client), 'la sérialisation du navigateur est prise pour une divergence').toBeNull();
  });

  it('les espaces ne comptent pas — sinon chaque saut de ligne serait un incident', () => {
    expect(divergence('<p>a</p>\n\n  <p>b</p>', '<p>a</p> <p>b</p>')).toBeNull();
  });

  it('CE QU’IL NE DOIT PAS ACCUSER, QUATRIÈME FAMILLE : l’ordre des attributs', () => {
    /* Le navigateur re-sérialise les attributs dans l’ordre où ils ont été
       POSÉS, pas dans celui du source. Sans le tri, chaque `<input>` du portail
       était dénoncé. */
    const serveur = `<body><input type="hidden" name="item_id" value="254e9108"/></body>`;
    const client = `<body><input type="hidden" value="254e9108" name="item_id"></body>`;
    expect(divergence(serveur, client), 'l’ordre des attributs est pris pour une divergence').toBeNull();
  });

  it('CE QU’IL NE DOIT PAS ACCUSER, CINQUIÈME FAMILLE : le formulaire d’action serveur', () => {
    /* LES OCTETS RÉELS des quatre incidents capturés la nuit du 3 septembre
       (portail client et poste de travail) : React sert le formulaire avec sa
       dégradation gracieuse — `action=""`, `encType`, `method`, et les champs
       cachés `$ACTION_REF_n` / `$ACTION_n:k` — puis reprend la main à
       l’hydratation et remplace `action` par un garde-fou. C’était le PREMIER
       écart signalé sur les quatre, et il masquait tout ce qui suivait. */
    const serveur = `<body><form class="row" action="" encType="multipart/form-data" method="POST">`
      + `<input type="hidden" name="$ACTION_REF_27"/>`
      + `<input type="hidden" name="$ACTION_27:0" value="{&quot;id&quot;:&quot;600f7354&quot;,&quot;bound&quot;:&quot;$@1&quot;}"/>`
      + `<input type="hidden" name="item_id" value="254e9108"/>`
      + `<button class="btn small">Téléverser</button></form></body>`;
    const client = `<body><form action="javascript:throw new Error('A React form was unexpectedly submitted. `
      + `If you called form.submit() manually, consider using form.requestSubmit() instead.')" class="row">`
      + `<input type="hidden" value="254e9108" name="item_id">`
      + `<button class="btn small">Téléverser</button></form></body>`;
    expect(divergence(serveur, client), 'l’action serveur de React est prise pour une divergence').toBeNull();
  });

  it('CAS MAUVAIS — une action de formulaire qui diffère VRAIMENT reste dénoncée', () => {
    /* La famille précédente écarte `action` sur le seul formulaire que React
       hydrate. Un `action` qui vaut autre chose est comparé normalement :
       sinon l’écart le plus visible d’un formulaire serait devenu invisible. */
    const d = divergence(`<body><form action="/a"></form></body>`, `<body><form action="/b"></form></body>`);
    expect(d, 'une action de formulaire qui diffère n’est plus vue').not.toBeNull();
    expect(d!).toMatch(/\/a/);
    expect(d!).toMatch(/\/b/);
  });

  it('CAS MAUVAIS — un champ caché RÉEL qui disparaît reste dénoncé', () => {
    /* Seuls les champs `$ACTION*` partent. Un `item_id` servi et absent du DOM
       serait un vrai défaut : la normalisation ne doit pas l’avaler. */
    const serveur = `<body><form action=""><input type="hidden" name="item_id" value="254e"/></form></body>`;
    const client = `<body><form action="javascript:throw new Error('A React form x')"></form></body>`;
    expect(divergence(serveur, client), 'un champ caché réel disparu n’est plus vu').not.toBeNull();
  });

  it('CAS MAUVAIS — un attribut présent d’un seul côté reste dénoncé malgré le tri', () => {
    const d = divergence(`<body><div class="a" data-x="1"></div></body>`, `<body><div class="a"></div></body>`);
    expect(d, 'le tri des attributs avale un attribut manquant').not.toBeNull();
    expect(d!).toMatch(/data-x/);
  });

  it('CAS MAUVAIS — DEUX divergences : la seconde ne doit pas être cachée par la première', () => {
    /* LE DÉFAUT QUE CET INSTRUMENT A EU, ET QUI L'AURAIT RENDU INUTILE. Il ne
       rendait que le premier écart. Sur les trois incidents du poste de
       travail, le premier écart était l'astuce du rail — rendue dans un
       `useEffect`, donc absente du HTML servi, présente dans le DOM relevé, et
       parfaitement saine. Elle arrive AVANT, dans le corps, le défaut
       volontairement injecté pour éprouver la sonde : l'instrument nommait le
       bruit et taisait ce qu'il existait pour attraper. */
    const loin = '<p>a</p><p>b</p><p>c</p><p>d</p><p>e</p><p>f</p>';
    const serveur = `<body><div class="rail"></div>${loin}<span>0.4172</span></body>`;
    const client = `<body><div class="rail"><div class="astuce">bulle</div></div>${loin}<span>0.9931</span></body>`;
    const tous = divergences(serveur, client);
    expect(tous.length, 'les deux écarts ne sont pas rendus séparément').toBe(2);
    expect(tous[0].client, 'le premier écart (l’astuce) n’est pas nommé').toMatch(/astuce/);
    expect(tous[1].serveur, 'le SECOND écart est caché par le premier').toMatch(/0\.4172/);
    expect(tous[1].client).toMatch(/0\.9931/);
  });

  it('la reprise se fait au plus court : un jeton qui diffère ne remplace pas le reste de la page', () => {
    const serveur = `<body><p>a</p><p>b</p><p>c</p><p>d</p><p>e</p><p>f</p><p>g</p><p>h</p></body>`;
    const client = `<body><p>a</p><p>X</p><p>c</p><p>d</p><p>e</p><p>f</p><p>g</p><p>h</p></body>`;
    const tous = divergences(serveur, client);
    expect(tous.length).toBe(1);
    expect(tous[0].serveur).toBe('b');
    expect(tous[0].client).toBe('X');
  });

  it('sans reprise possible, il le DIT au lieu de faire semblant de continuer', () => {
    const serveur = `<body>${Array.from({ length: 60 }, (_, k) => `<p>s${k}</p>`).join('')}</body>`;
    const client = `<body>${Array.from({ length: 60 }, (_, k) => `<p>c${k}</p>`).join('')}</body>`;
    const tous = divergences(serveur, client);
    expect(tous.length, 'un texte entièrement différent devrait donner UN écart, pas soixante').toBe(1);
  });

  it('OÙ CET INSTRUMENT S’ARRÊTE : deux écarts trop proches sont rendus comme UN — et les deux valeurs y sont', () => {
    /* La reprise exige six jetons identiques d’affilée. Deux divergences
       séparées par moins que cela ne peuvent pas être distinguées : elles
       forment un seul écart. Ce n’est pas un silence — les deux valeurs sont
       dans le même bloc — mais c’est une limite, et elle est écrite ici plutôt
       que découverte un jour par quelqu’un qui compte les écarts. */
    const serveur = `<body><div class="rail"></div><p>gardé</p><span>0.4172</span></body>`;
    const client = `<body><div class="rail"><div class="astuce">bulle</div></div><p>gardé</p><span>0.9931</span></body>`;
    const tous = divergences(serveur, client);
    expect(tous.length).toBe(1);
    expect(tous[0].client).toMatch(/astuce/);
    expect(tous[0].serveur, 'le second écart n’est même plus dans le bloc').toMatch(/0\.4172/);
    expect(tous[0].client).toMatch(/0\.9931/);
  });

  it('CAS MAUVAIS — l’espace insécable ÉTROITE contre l’insécable : la divergence des milliers en français', () => {
    /* LE DÉFAUT QUE CET INSTRUMENT A EU, ET QUI L’AURAIT RENDU AVEUGLE À SA
       PROIE LA PLUS PROBABLE. `Intl.NumberFormat('fr-FR')` sépare les milliers
       par U+202F ou par U+00A0 selon la version d’ICU — celle de Node n’est
       pas celle du navigateur. Un montant en euros diffère alors d’un octet
       entre le serveur et le client, sur CHAQUE écran. L’écrasement de
       `/\s+/` (qui comprend les deux) l’effaçait avant la comparaison. */
    const serveur = `<body><td>37\u202f000,00 €</td></body>`;
    const client = `<body><td>37\u00a0000,00 €</td></body>`;
    const d = divergence(serveur, client);
    expect(d, 'la divergence des séparateurs de milliers est effacée par la normalisation').not.toBeNull();
    expect(d!).toMatch(/nnbsp/);
    expect(d!).toMatch(/nbsp/);
  });

  it('mais un simple retour à la ligne reste du bruit', () => {
    expect(divergence('<body><p>a</p>\n\t<p>b</p></body>', '<body><p>a</p> <p>b</p></body>')).toBeNull();
  });
});
