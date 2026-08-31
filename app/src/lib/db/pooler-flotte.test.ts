// LES DEUX FLOTTES DU POOLER — la règle, pas le commentaire.
//
// Un déploiement a été perdu sur UN CHIFFRE dans un nom d'hôte : le pooler
// `aws-0-…` a répondu « tenant or user not found » pour un projet enregistré
// sur `aws-1-…`. Le message ressemblait à une erreur d'identifiants ; c'en
// était une d'hôte. Ces tests fixent les deux comportements qui en sortent :
// on tente l'autre flotte, et on ne divulgue JAMAIS le mot de passe.

import { describe, it, expect } from 'vitest';
import { autreFlotte, hote, echecReseau } from './client';

const URI = 'postgresql://postgres.fhxghmcehfdmxklkhfzk:MotDePasseSecret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';

describe('pooler Supabase : deux flottes, un seul locataire', () => {
  it('bascule aws-0 → aws-1, et réciproquement', () => {
    expect(autreFlotte(URI)).toContain('aws-1-eu-west-1.pooler.supabase.com');
    expect(autreFlotte(autreFlotte(URI)!)).toBe(URI);
  });

  it('ne touche à rien d’autre que le chiffre de flotte', () => {
    const alt = autreFlotte(URI)!;
    expect(alt).toContain('postgres.fhxghmcehfdmxklkhfzk');
    expect(alt).toContain(':6543/postgres');
  });

  it('n’invente pas de flotte pour un hôte qui n’est pas un pooler Supabase', () => {
    expect(autreFlotte('postgresql://u:p@db.exemple.fr:5432/postgres')).toBeNull();
    expect(autreFlotte('postgresql://u:p@localhost:5432/postgres')).toBeNull();
  });

  it('l’hôte affiché ne porte JAMAIS le mot de passe', () => {
    expect(hote(URI)).toBe('aws-0-eu-west-1.pooler.supabase.com:6543');
    expect(hote(URI)).not.toContain('MotDePasseSecret');
  });

  it('le message distingue « locataire inconnu » de « hôte injoignable », et ne fuit rien', () => {
    const inconnu = echecReseau(URI, 'Tenant or user not found');
    expect(inconnu).toMatch(/ne connaît pas ce locataire/);
    expect(inconnu).toMatch(/Transaction pooler/);
    expect(inconnu).not.toContain('MotDePasseSecret');

    const injoignable = echecReseau(URI, 'connect ETIMEDOUT 10.0.0.1:6543');
    expect(injoignable).toMatch(/hôte injoignable/);
    expect(injoignable).toMatch(/URI, pas une chaîne libre/);
    expect(injoignable).not.toContain('MotDePasseSecret');
  });
});
