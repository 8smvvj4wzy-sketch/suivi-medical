import test from 'node:test';
import assert from 'node:assert/strict';

import {
  moyenne, mediane, ecartType, spearman, pearson, testPermutation,
  grouperParJour, decalerJour, resume, repartitionPieds, profilHoraire,
  tendance, impactFacteurs, impactToutesCategories, corrigerTestsMultiples, liensEtatGeneral,
  qualiteDonnees, construireRapport,
} from '../js/analysis.js';
import { normaliserSaisie, exporterCSV, importerJSON, exporterJSON } from '../js/storage.js';
import { genererDemo } from '../js/demo.js';

/** Fabrique une saisie minimale à une date et une heure données. */
function saisie(date, heure, intensite, extra = {}) {
  return normaliserSaisie({
    horodatage: new Date(`${date}T${String(heure).padStart(2, '0')}:00:00`).toISOString(),
    intensite,
    pied: extra.pied || 'droit',
    fatigue: extra.fatigue ?? 5,
    sommeil: extra.sommeil ?? 5,
    facteurs: extra.facteurs || {},
    notes: extra.notes || '',
  });
}

/* ----------------------------- Statistiques ----------------------------- */

test('moyenne, médiane et écart-type', () => {
  assert.equal(moyenne([2, 4, 6]), 4);
  assert.equal(moyenne([]), null);
  assert.equal(mediane([3, 1, 2]), 2);
  assert.equal(mediane([4, 1, 2, 3]), 2.5);
  assert.equal(ecartType([5]), 0);
  assert.ok(Math.abs(ecartType([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
});

test('pearson détecte une relation linéaire parfaite', () => {
  assert.equal(pearson([[1, 2], [2, 4], [3, 6]]), 1);
  assert.equal(pearson([[1, 1], [1, 1], [1, 1]]), null); // aucune variance
});

test('spearman gère la monotonie non linéaire et les ex æquo', () => {
  assert.equal(spearman([[1, 1], [2, 8], [3, 27], [4, 64]]), 1);
  assert.equal(spearman([[1, 4], [2, 3], [3, 2], [4, 1]]), -1);
  assert.ok(spearman([[1, 2], [2, 2], [3, 5]]) > 0);
});

test('le test de permutation sépare le bruit d’un vrai écart', () => {
  const identiques = testPermutation([5, 5, 5, 5, 5, 5], [5, 5, 5, 5, 5, 5]);
  assert.ok(identiques > 0.5, `p attendu élevé, obtenu ${identiques}`);

  const distincts = testPermutation([9, 9, 8, 9, 10, 9, 8], [2, 3, 2, 1, 2, 3, 2]);
  assert.ok(distincts < 0.01, `p attendu très faible, obtenu ${distincts}`);

  // Déterminisme : deux appels identiques donnent exactement le même résultat.
  const a = testPermutation([4, 6, 5, 7], [2, 3, 2, 4]);
  const b = testPermutation([4, 6, 5, 7], [2, 3, 2, 4]);
  assert.equal(a, b);
});

/* ------------------------------ Agrégation ------------------------------ */

test('les saisies sont regroupées par jour avec moyenne et pic', () => {
  const jours = grouperParJour([
    saisie('2026-03-01', 8, 3),
    saisie('2026-03-01', 20, 7),
    saisie('2026-03-02', 9, 5),
  ]);
  assert.equal(jours.length, 2);
  assert.equal(jours[0].date, '2026-03-01');
  assert.equal(jours[0].moyenne, 5);
  assert.equal(jours[0].max, 7);
  assert.equal(jours[0].nb, 2);
  assert.equal(jours[1].moyenne, 5);
});

test('le décalage de jour traverse les fins de mois', () => {
  assert.equal(decalerJour('2026-03-01', -1), '2026-02-28');
  assert.equal(decalerJour('2026-12-31', 1), '2027-01-01');
  assert.equal(decalerJour('2024-02-28', 1), '2024-02-29'); // année bissextile
});

test('le résumé compte les jours calmes et sévères', () => {
  const r = resume([
    saisie('2026-03-01', 9, 2),
    saisie('2026-03-02', 9, 9),
    saisie('2026-03-03', 9, 5),
  ]);
  assert.equal(r.nbSaisies, 3);
  assert.equal(r.nbJours, 3);
  assert.equal(r.joursSansDouleur, 1);
  assert.equal(r.joursSeveres, 1);
  assert.equal(r.max, 9);
  assert.equal(r.premiereDate, '2026-03-01');
});

test('la répartition par pied donne des proportions justes', () => {
  const rep = repartitionPieds([
    saisie('2026-03-01', 9, 4, { pied: 'droit' }),
    saisie('2026-03-01', 12, 6, { pied: 'droit' }),
    saisie('2026-03-01', 18, 8, { pied: 'gauche' }),
  ]);
  assert.equal(rep[0].pied, 'droit');
  assert.equal(rep[0].nb, 2);
  assert.equal(rep[0].moyenne, 5);
  assert.ok(Math.abs(rep[0].part - 2 / 3) < 1e-9);
});

test('le profil horaire range les saisies dans le bon moment', () => {
  const profil = profilHoraire([
    saisie('2026-03-01', 3, 2),
    saisie('2026-03-01', 9, 4),
    saisie('2026-03-01', 15, 6),
    saisie('2026-03-01', 22, 8),
  ]);
  const parId = Object.fromEntries(profil.map((p) => [p.id, p]));
  assert.equal(parId.nuit.moyenne, 2);
  assert.equal(parId.matin.moyenne, 4);
  assert.equal(parId['apres-midi'].moyenne, 6);
  assert.equal(parId.soir.moyenne, 8);
});

/* ------------------------------- Tendance ------------------------------- */

test('une amélioration régulière est détectée', () => {
  const saisies = [];
  for (let i = 0; i < 14; i += 1) {
    const jour = `2026-03-${String(i + 1).padStart(2, '0')}`;
    saisies.push(saisie(jour, 10, Math.max(1, 9 - Math.floor(i / 2))));
  }
  const t = tendance(grouperParJour(saisies));
  assert.equal(t.direction, 'amelioration');
  assert.ok(t.penteParSemaine < 0);
  assert.ok(t.moyenneRecente < t.moyennePrecedente);
});

test('une intensité constante est vue comme stable', () => {
  const saisies = [];
  for (let i = 0; i < 14; i += 1) {
    saisies.push(saisie(`2026-03-${String(i + 1).padStart(2, '0')}`, 10, 5));
  }
  assert.equal(tendance(grouperParJour(saisies)).direction, 'stable');
});

/* -------------------------- Impact des facteurs -------------------------- */

test('un aliment aggravant le jour même ressort de l’analyse', () => {
  const saisies = [];
  for (let i = 0; i < 20; i += 1) {
    const jour = `2026-04-${String(i + 1).padStart(2, '0')}`;
    const expose = i % 2 === 0;
    saisies.push(saisie(jour, 20, expose ? 8 : 3, {
      facteurs: { aliments: expose ? ['Vin rouge'] : ['Café'] },
    }));
  }
  const impacts = impactFacteurs(grouperParJour(saisies), { categorie: 'aliments', decalage: 0 });
  const vin = impacts.find((i) => i.tag === 'Vin rouge');
  assert.ok(vin, 'le vin rouge doit apparaître dans les résultats');
  assert.equal(vin.sens, 'aggrave');
  assert.ok(vin.delta >= 4, `écart attendu important, obtenu ${vin.delta}`);
  assert.ok(vin.p < 0.05, `p attendu significatif, obtenu ${vin.p}`);
  assert.equal(vin.confiance, 'elevee');
});

test('un effet retardé n’apparaît qu’avec le décalage J+1', () => {
  // Le facteur est noté un jour sur trois ; la douleur monte le lendemain seulement.
  const saisies = [];
  for (let i = 0; i < 24; i += 1) {
    const jour = `2026-05-${String(i + 1).padStart(2, '0')}`;
    const exposeAujourdhui = i % 3 === 0;
    const exposeHier = i > 0 && (i - 1) % 3 === 0;
    saisies.push(saisie(jour, 20, exposeHier ? 8 : 3, {
      facteurs: { aliments: exposeAujourdhui ? ['Alcool'] : [] },
    }));
  }
  const jours = grouperParJour(saisies);
  const memeJour = impactFacteurs(jours, { categorie: 'aliments', decalage: 0 })
    .find((i) => i.tag === 'Alcool');
  const lendemain = impactFacteurs(jours, { categorie: 'aliments', decalage: 1 })
    .find((i) => i.tag === 'Alcool');

  assert.ok(lendemain.delta > 4, `effet J+1 attendu, obtenu ${lendemain.delta}`);
  assert.ok(Math.abs(memeJour.delta) < Math.abs(lendemain.delta));

  // La sélection automatique doit retenir le décalage le plus parlant.
  const meilleur = impactToutesCategories(jours).aliments.find((i) => i.tag === 'Alcool');
  assert.equal(meilleur.decalage, 1);
});

test('un facteur trop rare est écarté faute d’échantillon', () => {
  const saisies = [];
  for (let i = 0; i < 12; i += 1) {
    const jour = `2026-06-${String(i + 1).padStart(2, '0')}`;
    saisies.push(saisie(jour, 20, 5, { facteurs: { aliments: i === 0 ? ['Kiwi'] : ['Café'] } }));
  }
  const impacts = impactFacteurs(grouperParJour(saisies), { categorie: 'aliments', decalage: 0 });
  assert.equal(impacts.find((i) => i.tag === 'Kiwi'), undefined);
});

test('un traitement efficace apparaît du côté « soulage »', () => {
  const saisies = [];
  for (let i = 0; i < 20; i += 1) {
    const jour = `2026-07-${String(i + 1).padStart(2, '0')}`;
    const traite = i % 2 === 0;
    saisies.push(saisie(jour, 20, traite ? 3 : 7, {
      facteurs: { traitements: traite ? ['Surélévation du pied'] : [] },
    }));
  }
  const impacts = impactToutesCategories(grouperParJour(saisies)).traitements;
  const soin = impacts.find((i) => i.tag === 'Surélévation du pied');
  assert.equal(soin.sens, 'soulage');
  assert.ok(soin.delta < 0);
});

/* ---------------------- Correction des tests multiples ---------------------- */

test('la correction Benjamini-Hochberg majore les p-valeurs sans les désordonner', () => {
  const faux = [0.001, 0.02, 0.04, 0.2, 0.5, 0.9].map((valeur, i) => ({
    tag: `t${i}`, p: valeur, nExpos: 6, nTemoins: 6, delta: 1.2, categorie: 'aliments',
  }));
  const corriges = corrigerTestsMultiples(faux);
  for (const r of corriges) assert.ok(r.q >= r.p - 1e-9, `q (${r.q}) doit majorer p (${r.p})`);
  const parTag = Object.fromEntries(corriges.map((r) => [r.tag, r]));
  assert.ok(parTag.t0.q <= parTag.t3.q, 'l’ordre des p-valeurs doit être conservé');
  assert.equal(corrigerTestsMultiples([{ p: 0.03, nExpos: 6, delta: 1.2 }])[0].q, 0.03);
});

test('du bruit pur ne produit aucune piste crédible', () => {
  // 30 jours, douleur tirée indépendamment des aliments notés : rien ne doit ressortir.
  const alea = (() => { let a = 12345; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; })();
  const etiquettes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const saisies = [];
  for (let i = 0; i < 30; i += 1) {
    const jour = `2026-11-${String(i + 1).padStart(2, '0')}`;
    const aliments = etiquettes.filter(() => alea() < 0.4);
    for (const h of [8, 20]) {
      saisies.push(saisie(jour, h, 1 + Math.floor(alea() * 10), { facteurs: { aliments } }));
    }
  }
  const impacts = impactToutesCategories(grouperParJour(saisies), 600).aliments;
  const credibles = impacts.filter((i) => i.confiance === 'elevee' || i.confiance === 'moyenne');
  assert.deepEqual(credibles.map((i) => i.tag), [],
    'aucun aliment ne doit être présenté comme une piste sur des données aléatoires');
});

test('un vrai signal survit à la correction malgré les facteurs parasites', () => {
  const alea = (() => { let a = 99; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; })();
  const parasites = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  const saisies = [];
  for (let i = 0; i < 30; i += 1) {
    const jour = `2026-12-${String(i + 1).padStart(2, '0')}`;
    const vrai = alea() < 0.45;
    const aliments = [...parasites.filter(() => alea() < 0.4), ...(vrai ? ['Alcool'] : [])];
    const base = vrai ? 8 : 3;
    for (const h of [8, 20]) {
      saisies.push(saisie(jour, h, Math.max(1, Math.min(10, base + Math.round(alea() * 2 - 1))), {
        facteurs: { aliments },
      }));
    }
  }
  const impacts = impactToutesCategories(grouperParJour(saisies), 800).aliments;
  const alcool = impacts.find((i) => i.tag === 'Alcool');
  assert.equal(alcool.confiance, 'elevee', `confiance obtenue : ${alcool.confiance} (q = ${alcool.q})`);
  const autres = impacts.filter((i) => i.tag !== 'Alcool' && i.confiance !== 'faible');
  assert.deepEqual(autres.map((i) => i.tag), []);
});

/* ----------------------------- État général ----------------------------- */

test('le lien fatigue ↔ douleur est mesuré au niveau du jour', () => {
  const saisies = [];
  for (let i = 0; i < 12; i += 1) {
    const jour = `2026-08-${String(i + 1).padStart(2, '0')}`;
    saisies.push(saisie(jour, 20, Math.min(10, 1 + i * 0.7), { fatigue: Math.min(10, i) }));
  }
  const liens = liensEtatGeneral(grouperParJour(saisies));
  assert.ok(liens.fatigue.r > 0.8, `corrélation attendue forte, obtenue ${liens.fatigue.r}`);
  assert.equal(liens.fatigue.n, 12);
});

/* -------------------------- Qualité des données -------------------------- */

test('un suivi trop court est signalé comme insuffisant', () => {
  const saisies = [saisie('2026-09-01', 10, 5), saisie('2026-09-02', 10, 6)];
  const q = qualiteDonnees(saisies, grouperParJour(saisies));
  assert.equal(q.suffisant, false);
  assert.ok(q.manques.length >= 1);
});

test('un suivi dense et complet est jugé suffisant', () => {
  const saisies = [];
  for (let i = 0; i < 15; i += 1) {
    const jour = `2026-10-${String(i + 1).padStart(2, '0')}`;
    for (const h of [8, 14, 21]) {
      saisies.push(saisie(jour, h, 5, { facteurs: { aliments: ['Café'] } }));
    }
  }
  const q = qualiteDonnees(saisies, grouperParJour(saisies));
  assert.equal(q.suffisant, true);
  assert.deepEqual(q.manques, []);
});

/* --------------------------- Causalité inverse --------------------------- */

test('un antalgique pris les mauvais jours n’est pas présenté comme un déclencheur', () => {
  // Le traitement est pris *parce que* la douleur est forte.
  const saisies = [];
  for (let i = 0; i < 24; i += 1) {
    const jour = `2027-01-${String(i + 1).padStart(2, '0')}`;
    const mauvaisJour = i % 2 === 0;
    saisies.push(saisie(jour, 20, mauvaisJour ? 8 : 3, {
      facteurs: { traitements: mauvaisJour ? ['Antalgique simple (paracétamol)'] : [] },
    }));
  }
  const r = construireRapport(saisies, { iterations: 600 });
  const hypo = r.hypotheses.find((h) => h.titre.includes('Antalgique'));
  assert.ok(hypo, 'une hypothèse doit exister pour l’antalgique');
  assert.match(hypo.titre, /à l’envers/);
  assert.match(hypo.texte, /causalité inverse/);

  // Surtout : aucune recommandation d'arrêt du traitement.
  const evictions = r.recommandations.filter((x) => x.titre.startsWith('Test d’éviction'));
  assert.deepEqual(evictions.map((x) => x.titre), []);
  assert.ok(r.recommandations.some((x) => x.titre.includes('Mesurer l’effet réel')));
});

/* ------------------------------- Rapport -------------------------------- */

test('le rapport complet retrouve les liens plantés dans le jeu de démonstration', () => {
  const demo = genererDemo(40, 11);
  const r = construireRapport(demo, { iterations: 800 });

  assert.equal(r.qualite.suffisant, true);
  assert.ok(r.resume.nbJours >= 39);

  // Alcool de la veille : effet attendu le lendemain.
  const alcool = r.impacts.aliments.find((i) => i.tag === 'Alcool' || i.tag === 'Vin rouge');
  assert.ok(alcool, 'l’alcool doit ressortir');
  assert.equal(alcool.sens, 'aggrave');

  // Marche prolongée : effet attendu le jour même.
  const marche = r.impacts.activites.find((i) => i.tag === 'Marche prolongée');
  assert.ok(marche, 'la marche prolongée doit ressortir');
  assert.equal(marche.sens, 'aggrave');
  assert.equal(marche.decalage, 0);

  // Le pic du soir doit être détecté.
  const parId = Object.fromEntries(r.horaire.map((h) => [h.id, h]));
  assert.ok(parId.soir.moyenne > parId.matin.moyenne);

  // Des hypothèses et des recommandations sont bien produites.
  assert.ok(r.hypotheses.length > 0);
  assert.ok(r.recommandations.length > 0);
  assert.ok(r.constats.length > 0);
});

test('sans données, le rapport reste utilisable et prudent', () => {
  const r = construireRapport([], { iterations: 200 });
  assert.equal(r.resume.nbSaisies, 0);
  assert.equal(r.qualite.suffisant, false);
  assert.equal(r.tendance, null);
  assert.ok(r.recommandations.some((x) => x.titre.includes('Continuer à noter')));
});

/* --------------------------- Stockage / export --------------------------- */

test('la normalisation borne l’intensité et complète les champs', () => {
  const s = normaliserSaisie({ intensite: 42 });
  assert.equal(s.intensite, 10);
  assert.equal(normaliserSaisie({ intensite: -3 }).intensite, 1);
  assert.ok(s.id.startsWith('s_'));
  assert.deepEqual(s.facteurs.aliments, []);
  assert.equal(s.pied, 'les-deux');
});

test('le CSV échappe les séparateurs et les guillemets', () => {
  const csv = exporterCSV([saisie('2026-03-01', 9, 5, { notes: 'texte ; avec "guillemets"' })]);
  const lignes = csv.split('\n');
  assert.ok(lignes[0].includes('Intensité (1-10)'));
  assert.ok(lignes[1].includes('"texte ; avec ""guillemets"""'));
  assert.ok(csv.startsWith('﻿'), 'le BOM aide Excel à lire les accents');
});

test('l’import fusionne sans créer de doublons', () => {
  const initiales = { version: '1.0.0', saisies: [saisie('2026-03-01', 9, 5)], etiquettes: {} };
  const memeFichier = exporterJSON(initiales);
  const premier = importerJSON(initiales, memeFichier);
  assert.equal(premier.ajoutees, 0);
  assert.equal(premier.total, 1);

  const autre = exporterJSON({ saisies: [saisie('2026-03-02', 9, 7)] });
  const second = importerJSON(premier.data, autre);
  assert.equal(second.ajoutees, 1);
  assert.equal(second.total, 2);
});

test('un fichier d’import invalide est rejeté clairement', () => {
  assert.throws(() => importerJSON({ saisies: [] }, '{"autre":1}'), /invalide/);
});
