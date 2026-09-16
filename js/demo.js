/**
 * Jeu de données de démonstration.
 *
 * Il contient volontairement des liens « plantés » (alcool la veille, marche
 * prolongée, fatigue, pic du soir, pied droit dominant) afin de montrer ce que
 * l'analyse sait détecter — et de pouvoir vérifier qu'elle les retrouve.
 */

import { normaliserSaisie } from './storage.js';

function prng(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALIMENTS_NEUTRES = ['Café', 'Produits laitiers', 'Gluten / blé', 'Chocolat', 'Agrumes'];
const ACTIVITES_NEUTRES = ['Position assise longue', 'Ménage / jardinage', 'Escaliers', 'Vélo'];

export function genererDemo(nbJours = 30, graine = 7) {
  const rnd = prng(graine);
  const saisies = [];
  const alcoolParJour = [];

  for (let j = 0; j < nbJours; j += 1) {
    const jour = new Date();
    jour.setDate(jour.getDate() - (nbJours - 1 - j));

    const alcool = rnd() < 0.3;
    alcoolParJour[j] = alcool;
    const alcoolVeille = j > 0 && alcoolParJour[j - 1];
    const marche = rnd() < 0.4;
    const stress = rnd() < 0.3;
    const fatigueBase = 3 + (alcoolVeille ? 2 : 0) + (stress ? 2 : 0) + rnd() * 2;
    const sommeil = Math.max(0, Math.min(10, Math.round(8 - (alcool ? 2.5 : 0) - (stress ? 1.5 : 0) + rnd() * 2 - 1)));

    // Trois moments : matin, après-midi, soir.
    const moments = [
      { heure: 8, facteurBase: -0.8 },
      { heure: 15, facteurBase: 0 },
      { heure: 21, facteurBase: 1.4 },
    ];

    for (const m of moments) {
      let intensite = 3.4
        + m.facteurBase
        + (alcoolVeille ? 1.8 : 0)
        + (marche && m.heure >= 15 ? 1.3 : 0)
        + (fatigueBase - 4) * 0.25
        + (rnd() - 0.5) * 1.6;
      intensite = Math.max(1, Math.min(10, Math.round(intensite)));

      const facteurs = { aliments: [], activites: [], contexte: [], traitements: [] };
      if (m.heure === 21) {
        if (alcool) facteurs.aliments.push(rnd() < 0.5 ? 'Alcool' : 'Vin rouge');
        facteurs.aliments.push(ALIMENTS_NEUTRES[Math.floor(rnd() * ALIMENTS_NEUTRES.length)]);
      } else if (m.heure === 15) {
        facteurs.aliments.push(ALIMENTS_NEUTRES[Math.floor(rnd() * ALIMENTS_NEUTRES.length)]);
      }
      if (marche && m.heure >= 15) facteurs.activites.push('Marche prolongée');
      if (rnd() < 0.5) facteurs.activites.push(ACTIVITES_NEUTRES[Math.floor(rnd() * ACTIVITES_NEUTRES.length)]);
      if (stress) facteurs.contexte.push('Stress');
      if (sommeil <= 4) facteurs.contexte.push('Nuit courte');
      if (intensite >= 7 && rnd() < 0.7) facteurs.traitements.push('Antalgique simple (paracétamol)');
      if (m.heure === 21 && rnd() < 0.35) facteurs.traitements.push('Surélévation du pied');

      const horodatage = new Date(jour);
      horodatage.setHours(m.heure, Math.floor(rnd() * 50), 0, 0);

      saisies.push(normaliserSaisie({
        horodatage: horodatage.toISOString(),
        intensite,
        pied: rnd() < 0.72 ? 'droit' : (rnd() < 0.5 ? 'gauche' : 'les-deux'),
        zones: rnd() < 0.7 ? ['Avant-pied / plante'] : ['Orteils'],
        types: intensite >= 6 ? ['Brûlure', 'Décharge électrique'] : ['Picotements / fourmillements'],
        fatigue: Math.max(0, Math.min(10, Math.round(fatigueBase + (m.heure === 21 ? 1.5 : 0)))),
        sommeil,
        facteurs,
        notes: '',
      }));
    }
  }
  return saisies;
}
