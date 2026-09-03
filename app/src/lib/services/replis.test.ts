import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { lireReplis, memoriserRepli, compterReplis, PLAFOND_REPLIS } from '@/lib/services/replis';

/* LES CAS CONNUS MAUVAIS DE LA MÉMOIRE DES REPLIS (revue hostile n°8) : une
   règle qui n'a jamais refusé exprès n'a jamais été éprouvée (règle 17). */
describe('la mémoire des replis', () => {
  beforeAll(async () => { await initTestDb(); }, 120000);

  it('REPLI-01 : une clé hors format est refusée AVANT la base, et la base refuse aussi', async () => {
    const mauvaises = ['', ' ', 'a'.repeat(121), '../../etc/passwd', 'clé avec espace', 'saut\nligne', 'tab\there'];
    for (const cle of mauvaises) {
      await expect(memoriserRepli({ userId: IDS.users.karim, cle, ouvert: true }), cle).rejects.toThrow(/REPLI-01/);
    }
    /* Et si quelqu'un contourne le service, la CONTRAINTE refuse. */
    const t = await q1<{ tenant_id: string }>(`select tenant_id::text from app_user where id = $1`, [IDS.users.karim]);
    await expect(q(`insert into ui_repli (tenant_id, user_id, cle, ouvert) values ($1,$2,$3,true)`,
      [t.tenant_id, IDS.users.karim, 'clé hostile <script>'])).rejects.toThrow(/ui_repli_cle_valide/);
  });

  it('REPLI-03 : le locataire vient de la PERSONNE — une lecture ne voit jamais un autre cabinet', async () => {
    await memoriserRepli({ userId: IDS.users.karim, cle: 'poste.papiers', ouvert: false });
    const ligne = await q1<{ tenant_id: string; attendu: string }>(
      `select u.tenant_id::text, a.tenant_id::text attendu from ui_repli u join app_user a on a.id = u.user_id
       where u.user_id = $1 and u.cle = 'poste.papiers'`, [IDS.users.karim]);
    expect(ligne.tenant_id).toBe(ligne.attendu);
    /* Une ligne forgée au nom d'un AUTRE cabinet n'est pas relue. */
    const autre = await q1<{ id: string }>(
      `insert into tenant (name) values ('Cabinet Étranger (fictif)') returning id::text`);
    await q(`insert into ui_repli (tenant_id, user_id, cle, ouvert) values ($1,$2,'poste.ecarts',false)
             on conflict (user_id, cle) do update set tenant_id = excluded.tenant_id`,
      [autre.id, IDS.users.karim]);
    const lus = await lireReplis(IDS.users.karim);
    expect(lus['poste.papiers'], 'le rangement légitime se relit').toBe(false);
    expect(lus['poste.ecarts'], 'la ligne d’un autre cabinet est INVISIBLE').toBeUndefined();
    await q(`delete from ui_repli where cle = 'poste.ecarts'`);
  });

  it('REPLI-04 : le nombre de rangements d’une personne est borné', async () => {
    const t = await q1<{ tenant_id: string }>(`select tenant_id::text from app_user where id = $1`, [IDS.users.lea]);
    for (let i = 0; i < PLAFOND_REPLIS; i++) {
      await q(`insert into ui_repli (tenant_id, user_id, cle, ouvert) values ($1,$2,$3,true)
               on conflict (user_id, cle) do nothing`, [t.tenant_id, IDS.users.lea, `remplissage.${i}`]);
    }
    await expect(memoriserRepli({ userId: IDS.users.lea, cle: 'une.de.trop', ouvert: true })).rejects.toThrow(/REPLI-04/);
    /* Une clé DÉJÀ mémorisée se met encore à jour : le plafond borne le
       nombre, il n'empêche pas de ranger ce qu'on range déjà. */
    await expect(memoriserRepli({ userId: IDS.users.lea, cle: 'remplissage.0', ouvert: false })).resolves.toBeUndefined();
    await q(`delete from ui_repli where user_id = $1`, [IDS.users.lea]);
  }, 120000);

  it('la lecture de /api/sante compte, et dit QUAND — updated_at a un chemin de lecture', async () => {
    const c = await compterReplis();
    expect(c.replis).toBeGreaterThan(0);
    expect(c.personnes).toBeGreaterThan(0);
    expect(c.dernier, 'la date du dernier rangement est lue').toBeTruthy();
  });
});
