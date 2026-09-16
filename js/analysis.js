/**
 * Moteur d'analyse — fonctions pures, testables hors navigateur.
 *
 * Principe : chaque saisie note une intensité (1-10) et des « facteurs »
 * (aliments, activités, contexte, traitements). On agrège par jour, puis on
 * compare les jours AVEC un facteur aux jours SANS, le jour même (J) et le
 * lendemain (J+1) — une douleur neuropathique réagit souvent avec retard.
 *
 * Aucune conclusion médicale n'est produite : seulement des tendances
 * statistiques, assorties d'un niveau de confiance honnête.
 */

import { CATEGORIES, MOMENTS, SEUILS, estReactionALaDouleur } from './constants.js';

/* ------------------------------------------------------------------ */
/* Statistiques de base                                                */
/* ------------------------------------------------------------------ */

export function moyenne(valeurs) {
  if (!valeurs.length) return null;
  return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
}

export function mediane(valeurs) {
  if (!valeurs.length) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

export function ecartType(valeurs) {
  if (valeurs.length < 2) return 0;
  const m = moyenne(valeurs);
  const v = valeurs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (valeurs.length - 1);
  return Math.sqrt(v);
}

export function arrondi(x, decimales = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
}

/** Corrélation de Pearson sur des paires [x, y]. */
export function pearson(paires) {
  const n = paires.length;
  if (n < 3) return null;
  const xs = paires.map((p) => p[0]);
  const ys = paires.map((p) => p[1]);
  const mx = moyenne(xs);
  const my = moyenne(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** Rangs moyens (gère les ex æquo) — utilisé par Spearman. */
function rangs(valeurs) {
  const indexes = valeurs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(valeurs.length);
  let i = 0;
  while (i < indexes.length) {
    let j = i;
    while (j + 1 < indexes.length && indexes[j + 1][0] === indexes[i][0]) j += 1;
    const rangMoyen = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[indexes[k][1]] = rangMoyen;
    i = j + 1;
  }
  return out;
}

/** Corrélation de Spearman : robuste, adaptée à des échelles subjectives. */
export function spearman(paires) {
  if (paires.length < 3) return null;
  const rx = rangs(paires.map((p) => p[0]));
  const ry = rangs(paires.map((p) => p[1]));
  return pearson(rx.map((v, i) => [v, ry[i]]));
}

/* PRNG déterministe : deux analyses des mêmes données donnent le même résultat. */
function mulberry32(graine) {
  let a = graine >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Test de permutation bilatéral sur la différence de moyennes.
 * Adapté aux très petits échantillons (pas d'hypothèse de normalité).
 * Renvoie une p-valeur entre 0 et 1.
 */
export function testPermutation(groupeA, groupeB, iterations = 2000, graine = 20240101) {
  if (groupeA.length < 2 || groupeB.length < 2) return null;
  const observe = Math.abs(moyenne(groupeA) - moyenne(groupeB));
  const melange = [...groupeA, ...groupeB];
  const nA = groupeA.length;
  const rnd = mulberry32(graine);
  let extremes = 0;
  for (let it = 0; it < iterations; it += 1) {
    for (let i = melange.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [melange[i], melange[j]] = [melange[j], melange[i]];
    }
    const a = melange.slice(0, nA);
    const b = melange.slice(nA);
    if (Math.abs(moyenne(a) - moyenne(b)) >= observe - 1e-12) extremes += 1;
  }
  return (extremes + 1) / (iterations + 1);
}

/* ------------------------------------------------------------------ */
/* Agrégation                                                          */
/* ------------------------------------------------------------------ */

/** Clé de jour ISO (AAAA-MM-JJ) à partir d'une saisie. */
export function jourDe(saisie) {
  return (saisie.horodatage || '').slice(0, 10);
}

export function heureDe(saisie) {
  const d = new Date(saisie.horodatage);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}

function tagsCategorie(saisie, categorie) {
  const v = saisie.facteurs && saisie.facteurs[categorie];
  return Array.isArray(v) ? v : [];
}

/**
 * Regroupe les saisies par jour.
 * @returns {Array<{date, saisies, moyenne, max, min, nb, fatigue, sommeil, tags}>}
 */
export function grouperParJour(saisies) {
  const parJour = new Map();
  for (const s of saisies) {
    const d = jourDe(s);
    if (!d) continue;
    if (!parJour.has(d)) parJour.set(d, []);
    parJour.get(d).push(s);
  }
  const jours = [];
  for (const [date, liste] of [...parJour.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const intensites = liste.map((s) => s.intensite).filter((v) => typeof v === 'number');
    const fatigues = liste.map((s) => s.fatigue).filter((v) => typeof v === 'number');
    const sommeils = liste.map((s) => s.sommeil).filter((v) => typeof v === 'number');
    const tags = {};
    for (const cat of CATEGORIES) {
      const ensemble = new Set();
      for (const s of liste) tagsCategorie(s, cat.id).forEach((t) => ensemble.add(t));
      tags[cat.id] = [...ensemble];
    }
    jours.push({
      date,
      saisies: liste,
      nb: liste.length,
      moyenne: moyenne(intensites),
      max: intensites.length ? Math.max(...intensites) : null,
      min: intensites.length ? Math.min(...intensites) : null,
      fatigue: fatigues.length ? moyenne(fatigues) : null,
      sommeil: sommeils.length ? moyenne(sommeils) : null,
      tags,
    });
  }
  return jours;
}

/** Décale une date ISO de n jours. */
export function decalerJour(dateISO, n) {
  const d = new Date(`${dateISO}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Statistiques descriptives                                           */
/* ------------------------------------------------------------------ */

export function resume(saisies) {
  const intensites = saisies.map((s) => s.intensite).filter((v) => typeof v === 'number');
  const jours = grouperParJour(saisies);
  const dernierJour = jours.length ? jours[jours.length - 1] : null;
  const sept = jours.slice(-7).map((j) => j.moyenne).filter((v) => v !== null);
  return {
    nbSaisies: saisies.length,
    nbJours: jours.length,
    premiereDate: jours.length ? jours[0].date : null,
    derniereDate: dernierJour ? dernierJour.date : null,
    moyenne: arrondi(moyenne(intensites)),
    mediane: arrondi(mediane(intensites)),
    max: intensites.length ? Math.max(...intensites) : null,
    min: intensites.length ? Math.min(...intensites) : null,
    ecartType: arrondi(ecartType(intensites)),
    moyenne7j: arrondi(moyenne(sept)),
    saisiesParJour: jours.length ? arrondi(saisies.length / jours.length) : null,
    joursSansDouleur: jours.filter((j) => j.max !== null && j.max <= 2).length,
    joursSeveres: jours.filter((j) => j.max !== null && j.max >= 8).length,
  };
}

/** Répartition gauche / droite / les deux. */
export function repartitionPieds(saisies) {
  const acc = {};
  for (const s of saisies) {
    const pied = s.pied || 'non-precise';
    if (!acc[pied]) acc[pied] = { pied, nb: 0, intensites: [] };
    acc[pied].nb += 1;
    if (typeof s.intensite === 'number') acc[pied].intensites.push(s.intensite);
  }
  return Object.values(acc)
    .map((x) => ({
      pied: x.pied,
      nb: x.nb,
      part: saisies.length ? x.nb / saisies.length : 0,
      moyenne: arrondi(moyenne(x.intensites)),
      max: x.intensites.length ? Math.max(...x.intensites) : null,
    }))
    .sort((a, b) => b.nb - a.nb);
}

/** Intensité moyenne par moment de la journée. */
export function profilHoraire(saisies) {
  return MOMENTS.map((m) => {
    const dedans = saisies.filter((s) => {
      const h = heureDe(s);
      return h !== null && h >= m.debut && h < m.fin;
    });
    const intensites = dedans.map((s) => s.intensite).filter((v) => typeof v === 'number');
    return {
      id: m.id,
      label: m.label,
      nb: dedans.length,
      moyenne: arrondi(moyenne(intensites)),
    };
  });
}

/** Intensité moyenne heure par heure (24 valeurs, null si aucune donnée). */
export function profil24h(saisies) {
  const seaux = Array.from({ length: 24 }, () => []);
  for (const s of saisies) {
    const h = heureDe(s);
    if (h !== null && typeof s.intensite === 'number') seaux[h].push(s.intensite);
  }
  return seaux.map((v, h) => ({ heure: h, nb: v.length, moyenne: arrondi(moyenne(v)) }));
}

/** Zones et types de douleur les plus fréquents. */
export function frequences(saisies, champ) {
  const acc = new Map();
  for (const s of saisies) {
    const liste = Array.isArray(s[champ]) ? s[champ] : [];
    for (const v of liste) acc.set(v, (acc.get(v) || 0) + 1);
  }
  return [...acc.entries()]
    .map(([valeur, nb]) => ({ valeur, nb }))
    .sort((a, b) => b.nb - a.nb);
}

/* ------------------------------------------------------------------ */
/* Tendance dans le temps                                              */
/* ------------------------------------------------------------------ */

/**
 * Régression linéaire simple sur la moyenne quotidienne.
 * @returns {{pente, penteParSemaine, direction, moyenneRecente, moyennePrecedente, ecart}}
 */
export function tendance(jours, fenetre = 28) {
  const utilisables = jours.filter((j) => j.moyenne !== null).slice(-fenetre);
  if (utilisables.length < 4) return null;

  const base = new Date(`${utilisables[0].date}T12:00:00`).getTime();
  const points = utilisables.map((j) => [
    (new Date(`${j.date}T12:00:00`).getTime() - base) / 86400000,
    j.moyenne,
  ]);
  const mx = moyenne(points.map((p) => p[0]));
  const my = moyenne(points.map((p) => p[1]));
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  const pente = den === 0 ? 0 : num / den;
  const penteParSemaine = pente * 7;

  const moitie = Math.floor(utilisables.length / 2);
  const precedente = moyenne(utilisables.slice(0, moitie).map((j) => j.moyenne));
  const recente = moyenne(utilisables.slice(moitie).map((j) => j.moyenne));

  let direction = 'stable';
  if (penteParSemaine <= -0.3) direction = 'amelioration';
  else if (penteParSemaine >= 0.3) direction = 'aggravation';

  return {
    joursAnalyses: utilisables.length,
    pente: arrondi(pente, 3),
    penteParSemaine: arrondi(penteParSemaine, 2),
    direction,
    moyenneRecente: arrondi(recente),
    moyennePrecedente: arrondi(precedente),
    ecart: arrondi(recente - precedente),
  };
}

/* ------------------------------------------------------------------ */
/* Impact des facteurs                                                 */
/* ------------------------------------------------------------------ */

function niveauConfiance(p, nExpos, delta) {
  if (p === null) return 'insuffisante';
  if (p < SEUILS.pFort && nExpos >= 5 && Math.abs(delta) >= SEUILS.deltaNotable) return 'elevee';
  if (p < SEUILS.pModere && nExpos >= 4) return 'moyenne';
  return 'faible';
}

/**
 * Correction pour tests multiples (Benjamini-Hochberg).
 *
 * On teste des dizaines d'éléments sur deux décalages : sans correction, un
 * aliment parfaitement innocent finit toujours par « ressortir » par hasard.
 * Le q renvoyé est le taux de fausses découvertes attendu si l'on retient ce
 * résultat et tous ceux qui lui sont supérieurs.
 */
export function corrigerTestsMultiples(resultats) {
  const testables = resultats.filter((r) => r.p !== null);
  const m = testables.length;
  if (!m) return resultats.map((r) => ({ ...r, q: null }));

  const ordonnes = [...testables].sort((a, b) => a.p - b.p);
  const q = new Map();
  let minimum = 1;
  for (let i = m - 1; i >= 0; i -= 1) {
    minimum = Math.min(minimum, Math.min(1, (ordonnes[i].p * m) / (i + 1)));
    q.set(ordonnes[i], minimum);
  }

  return resultats.map((r) => {
    if (r.p === null) return { ...r, q: null, confiance: 'insuffisante' };
    const valeur = q.get(r);
    let confiance = 'faible';
    if (valeur < SEUILS.qFort && r.nExpos >= 5 && Math.abs(r.delta) >= SEUILS.deltaNotable) {
      confiance = 'elevee';
    } else if (valeur < SEUILS.qModere && r.nExpos >= 4) {
      confiance = 'moyenne';
    }
    return { ...r, q: arrondi(valeur, 3), confiance, correction: 'Benjamini-Hochberg' };
  });
}

/**
 * Compare les jours exposés à un facteur aux jours témoins.
 * @param jours résultat de grouperParJour
 * @param options.categorie id de catégorie ('aliments'…)
 * @param options.decalage 0 = effet le jour même, 1 = effet le lendemain
 */
export function impactFacteurs(jours, { categorie, decalage = 0, iterations = 2000 } = {}) {
  const parDate = new Map(jours.map((j) => [j.date, j]));
  const tousTags = new Set();
  for (const j of jours) (j.tags[categorie] || []).forEach((t) => tousTags.add(t));

  const resultats = [];
  for (const tag of tousTags) {
    const expos = [];
    const temoins = [];
    for (const j of jours) {
      if (j.moyenne === null) continue;
      // Le jour d'exposition est j.date - decalage.
      const dateSource = decalerJour(j.date, -decalage);
      const jourSource = parDate.get(dateSource);
      if (!jourSource) continue; // pas de donnée ce jour-là : on ne peut rien conclure
      const expose = (jourSource.tags[categorie] || []).includes(tag);
      (expose ? expos : temoins).push(j.moyenne);
    }
    if (expos.length < SEUILS.exposMin || temoins.length < SEUILS.temoinsMin) continue;

    const mExpos = moyenne(expos);
    const mTemoins = moyenne(temoins);
    const delta = mExpos - mTemoins;
    const p = testPermutation(expos, temoins, iterations, 20240101 + tag.length);
    resultats.push({
      tag,
      categorie,
      decalage,
      nExpos: expos.length,
      nTemoins: temoins.length,
      moyenneExpos: arrondi(mExpos),
      moyenneTemoins: arrondi(mTemoins),
      delta: arrondi(delta),
      p: p === null ? null : arrondi(p, 3),
      confiance: niveauConfiance(p, expos.length, delta),
      sens: delta > 0 ? 'aggrave' : 'soulage',
    });
  }
  return resultats.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Pour chaque facteur, garde le décalage (J ou J+1) où l'effet est le plus net.
 */
export function impactToutesCategories(jours, iterations = 2000) {
  // Tous les tests sont menés d'abord, puis corrigés ensemble : la correction
  // doit tenir compte du nombre total de comparaisons, toutes catégories et
  // tous décalages confondus.
  let tous = [];
  for (const cat of CATEGORIES) {
    for (const decalage of [0, 1]) {
      tous = tous.concat(impactFacteurs(jours, { categorie: cat.id, decalage, iterations }));
    }
  }
  const corriges = corrigerTestsMultiples(tous);

  const sortie = {};
  for (const cat of CATEGORIES) sortie[cat.id] = new Map();
  for (const r of corriges) {
    const parTag = sortie[r.categorie];
    const existant = parTag.get(r.tag);
    // On garde, pour chaque élément, le décalage où l'effet est le plus net.
    const meilleur = !existant
      || Math.abs(r.delta) > Math.abs(existant.delta)
      || (existant.q !== null && r.q !== null && r.q < existant.q
          && Math.abs(r.delta) >= Math.abs(existant.delta) * 0.8);
    if (meilleur) parTag.set(r.tag, r);
  }
  for (const cat of CATEGORIES) {
    sortie[cat.id] = [...sortie[cat.id].values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  return sortie;
}

/** Lien fatigue ↔ douleur, et sommeil ↔ douleur, au niveau du jour. */
export function liensEtatGeneral(jours) {
  const paireFatigue = jours
    .filter((j) => j.fatigue !== null && j.moyenne !== null)
    .map((j) => [j.fatigue, j.moyenne]);
  const paireSommeil = jours
    .filter((j) => j.sommeil !== null && j.moyenne !== null)
    .map((j) => [j.sommeil, j.moyenne]);

  // Sommeil de la nuit J → douleur du jour J (déjà aligné) et fatigue veille → douleur J+1.
  const parDate = new Map(jours.map((j) => [j.date, j]));
  const paireFatigueVeille = [];
  for (const j of jours) {
    const veille = parDate.get(decalerJour(j.date, -1));
    if (veille && veille.fatigue !== null && j.moyenne !== null) {
      paireFatigueVeille.push([veille.fatigue, j.moyenne]);
    }
  }

  return {
    fatigue: {
      n: paireFatigue.length,
      r: arrondi(spearman(paireFatigue), 2),
    },
    sommeil: {
      n: paireSommeil.length,
      r: arrondi(spearman(paireSommeil), 2),
    },
    fatigueVeille: {
      n: paireFatigueVeille.length,
      r: arrondi(spearman(paireFatigueVeille), 2),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Qualité des données                                                 */
/* ------------------------------------------------------------------ */

export function qualiteDonnees(saisies, jours) {
  const manques = [];
  if (jours.length < SEUILS.joursMinAnalyse) {
    manques.push(`Il faut au moins ${SEUILS.joursMinAnalyse} jours de suivi (actuellement ${jours.length}).`);
  }
  if (saisies.length < SEUILS.saisiesMinAnalyse) {
    manques.push(`Il faut au moins ${SEUILS.saisiesMinAnalyse} saisies (actuellement ${saisies.length}).`);
  }
  const avecFatigue = saisies.filter((s) => typeof s.fatigue === 'number').length;
  if (saisies.length && avecFatigue / saisies.length < 0.5) {
    manques.push('La fatigue est rarement renseignée : son lien avec la douleur ne peut pas être évalué.');
  }
  const avecFacteurs = saisies.filter((s) => {
    const f = s.facteurs || {};
    return CATEGORIES.some((c) => (f[c.id] || []).length > 0);
  }).length;
  if (saisies.length && avecFacteurs / saisies.length < 0.4) {
    manques.push('Peu de saisies comportent des facteurs (aliments, activités…) : l’analyse des déclencheurs reste très limitée.');
  }
  const densite = jours.length ? saisies.length / jours.length : 0;
  if (jours.length >= 3 && densite < 1.5) {
    manques.push('Moins de 2 saisies par jour en moyenne : le profil horaire sera approximatif.');
  }
  return {
    suffisant: jours.length >= SEUILS.joursMinAnalyse && saisies.length >= SEUILS.saisiesMinAnalyse,
    manques,
    densite: arrondi(densite),
  };
}

/* ------------------------------------------------------------------ */
/* Hypothèses et recommandations                                       */
/* ------------------------------------------------------------------ */

const LIBELLE_CATEGORIE = {
  aliments: 'alimentaire',
  activites: 'mécanique / activité',
  contexte: 'contextuel',
  traitements: 'thérapeutique',
};

function phraseDecalage(decalage) {
  return decalage === 0 ? 'le jour même' : 'le lendemain';
}

/**
 * Construit le rapport complet : constats, hypothèses, recommandations.
 * Les hypothèses sont formulées au conditionnel, jamais comme un diagnostic.
 */
export function construireRapport(saisies, { iterations = 2000 } = {}) {
  const jours = grouperParJour(saisies);
  const res = resume(saisies);
  const qualite = qualiteDonnees(saisies, jours);
  const impacts = impactToutesCategories(jours, iterations);
  const liens = liensEtatGeneral(jours);
  const tend = tendance(jours);
  const pieds = repartitionPieds(saisies);
  const horaire = profilHoraire(saisies);

  const constats = [];
  const hypotheses = [];
  const recommandations = [];

  /* --- Tendance générale --- */
  if (tend) {
    if (tend.direction === 'amelioration') {
      constats.push({
        titre: 'Tendance à l’amélioration',
        texte: `Sur les ${tend.joursAnalyses} derniers jours, l’intensité moyenne baisse d’environ ${Math.abs(tend.penteParSemaine)} point par semaine (${tend.moyennePrecedente} → ${tend.moyenneRecente}).`,
        ton: 'positif',
      });
      recommandations.push({
        titre: 'Ne rien changer pour l’instant',
        texte: 'La trajectoire est bonne : gardez le même traitement, le même rythme d’activité et la même alimentation encore 2 semaines avant d’introduire un changement, sinon vous ne saurez pas ce qui a agi.',
      });
    } else if (tend.direction === 'aggravation') {
      constats.push({
        titre: 'Tendance à l’aggravation',
        texte: `Sur les ${tend.joursAnalyses} derniers jours, l’intensité moyenne monte d’environ ${tend.penteParSemaine} point par semaine (${tend.moyennePrecedente} → ${tend.moyenneRecente}).`,
        ton: 'negatif',
      });
      recommandations.push({
        titre: 'Signaler l’aggravation',
        texte: 'Une aggravation régulière sur plusieurs semaines mérite d’être montrée à votre médecin : exportez le rapport et apportez-le en consultation.',
        priorite: 'haute',
      });
    } else {
      constats.push({
        titre: 'Intensité stable',
        texte: `Sur les ${tend.joursAnalyses} derniers jours, la moyenne reste autour de ${tend.moyenneRecente}/10, sans tendance nette.`,
        ton: 'neutre',
      });
    }
  }

  /* --- Latéralité --- */
  const principal = pieds.filter((p) => p.pied !== 'non-precise')[0];
  if (principal && res.nbSaisies >= 10) {
    if (principal.part >= 0.7 && principal.pied !== 'les-deux') {
      const nom = principal.pied === 'gauche' ? 'gauche' : 'droit';
      constats.push({
        titre: `Douleur très majoritairement à ${nom === 'gauche' ? 'gauche' : 'droite'}`,
        texte: `${Math.round(principal.part * 100)} % des épisodes concernent le pied ${nom} (intensité moyenne ${principal.moyenne}/10).`,
        ton: 'neutre',
      });
      hypotheses.push({
        titre: 'Piste d’une cause locale, d’un seul côté',
        texte: `Une douleur aussi asymétrique oriente plutôt vers une cause locale du côté ${nom} — compression d’un nerf (tunnel tarsien, névrome de Morton), séquelle d’un traumatisme, appui ou chaussage inadapté — que vers une atteinte générale des nerfs, qui touche habituellement les deux pieds de façon symétrique.`,
        force: 'moyenne',
      });
      recommandations.push({
        titre: 'Examiner le chaussage et l’appui de ce pied',
        texte: `Comparez vos chaussures, l’usure des semelles et votre appui à gauche et à droite. Un avis podologique (analyse de la marche, semelles) est souvent utile quand un seul pied est touché.`,
      });
    } else if (pieds.some((p) => p.pied === 'les-deux' && p.part >= 0.5)) {
      constats.push({
        titre: 'Atteinte des deux pieds',
        texte: 'Les épisodes touchent le plus souvent les deux pieds en même temps.',
        ton: 'neutre',
      });
      hypotheses.push({
        titre: 'Piste d’une cause générale plutôt que locale',
        texte: 'Une atteinte symétrique des deux pieds évoque davantage une polyneuropathie (métabolique, carentielle, toxique ou médicamenteuse) qu’une compression mécanique isolée. Un bilan sanguin (glycémie/HbA1c, vitamine B12, TSH, bilan hépatique) est typiquement ce que recherche un médecin dans ce cas.',
        force: 'moyenne',
      });
    }
  }

  /* --- Profil horaire --- */
  const horairesUtiles = horaire.filter((h) => h.nb >= 3 && h.moyenne !== null);
  if (horairesUtiles.length >= 2) {
    const pire = [...horairesUtiles].sort((a, b) => b.moyenne - a.moyenne)[0];
    const meilleur = [...horairesUtiles].sort((a, b) => a.moyenne - b.moyenne)[0];
    if (pire.moyenne - meilleur.moyenne >= 1) {
      constats.push({
        titre: `Pic de douleur : ${pire.label.toLowerCase()}`,
        texte: `Moyenne de ${pire.moyenne}/10 sur ce créneau, contre ${meilleur.moyenne}/10 ${meilleur.label.toLowerCase().replace(/ \(.*/, '')}.`,
        ton: 'neutre',
      });
      if (pire.id === 'nuit' || pire.id === 'soir') {
        hypotheses.push({
          titre: 'Aggravation en fin de journée / la nuit',
          texte: 'Une douleur neuropathique qui culmine le soir ou la nuit est un profil classique : elle suit souvent la charge mécanique accumulée dans la journée, et devient plus perceptible au repos, quand les autres stimulations diminuent.',
          force: 'moyenne',
        });
        recommandations.push({
          titre: 'Agir avant le pic, pas pendant',
          texte: 'Testez pendant 2 semaines une routine de fin d’après-midi : pieds surélevés 15 minutes, étirements doux du mollet et de la voûte, chaussettes non compressives la nuit. Notez chaque soir si le pic a bougé.',
        });
      } else if (pire.id === 'matin') {
        hypotheses.push({
          titre: 'Douleur maximale au réveil',
          texte: 'Un maximum matinal oriente plutôt vers la position de la nuit, la literie/les couvertures qui appuient sur les pieds, ou une composante inflammatoire matinale, que vers la fatigue d’effort.',
          force: 'faible',
        });
        recommandations.push({
          titre: 'Tester la position de nuit',
          texte: 'Essayez un arceau ou une couette relevée pour éviter l’appui direct sur les pieds, et notez l’intensité dans la première heure après le lever.',
        });
      }
    }
  }

  /* --- Facteurs aggravants / soulageants --- */
  const tousImpacts = [];
  for (const cat of CATEGORIES) tousImpacts.push(...(impacts[cat.id] || []));
  const retenus = tousImpacts.filter(
    (i) => Math.abs(i.delta) >= SEUILS.deltaNotable && i.confiance !== 'insuffisante' && i.confiance !== 'faible',
  );
  const aggravants = retenus.filter((i) => i.sens === 'aggrave').slice(0, 4);
  const soulageants = retenus.filter((i) => i.sens === 'soulage').slice(0, 4);

  for (const f of aggravants) {
    // Causalité inverse : ce qu'on fait *à cause* de la douleur ressort
    // mécaniquement comme « aggravant ». On l'explique au lieu de conclure.
    if (estReactionALaDouleur(f.tag, f.categorie)) {
      constats.push({
        titre: `« ${f.tag} » accompagne les journées difficiles`,
        texte: `Les jours où vous notez « ${f.tag} », la douleur moyenne est de ${f.moyenneExpos}/10 contre ${f.moyenneTemoins}/10 les autres jours (${f.nExpos} jours vs ${f.nTemoins}).`,
        ton: 'neutre',
      });
      hypotheses.push({
        titre: `« ${f.tag} » : lien à lire à l’envers`,
        texte: `Il s’agit très probablement d’une causalité inverse : vous y avez recours parce que la douleur est déjà forte, pas l’inverse. Cette association ne dit rien contre ${f.categorie === 'traitements' ? 'ce traitement' : 'cette pratique'} — mais elle ne dit rien pour non plus, car ces données ne permettent pas de mesurer son efficacité.`,
        force: 'moyenne',
        preuve: f,
      });
      recommandations.push({
        titre: `Mesurer l’effet réel de « ${f.tag} »`,
        texte: `Pour savoir si cela soulage, notez l’intensité juste avant, puis 1 h et 3 h après. C’est la seule façon de séparer l’effet du produit de la raison pour laquelle vous le prenez. N’arrêtez pas un traitement prescrit sur la base de ce graphique : parlez-en d’abord à votre médecin.`,
      });
      continue;
    }
    constats.push({
      titre: `« ${f.tag} » : +${f.delta} point ${phraseDecalage(f.decalage)}`,
      texte: `Les jours concernés, la douleur moyenne est de ${f.moyenneExpos}/10 contre ${f.moyenneTemoins}/10 les autres jours (${f.nExpos} jours exposés vs ${f.nTemoins} témoins, p ≈ ${f.p}).`,
      ton: 'negatif',
    });
    hypotheses.push({
      titre: `Lien possible : ${f.tag}`,
      texte: `Un facteur ${LIBELLE_CATEGORIE[f.categorie]} revient de façon répétée avant les journées les plus douloureuses${f.decalage === 1 ? ', avec un décalage d’environ 24 heures' : ''}. Ce n’est pas une preuve de causalité : l’élément peut simplement accompagner autre chose (un jour de sortie, un repas festif, une journée plus active).`,
      force: f.confiance === 'elevee' ? 'forte' : 'moyenne',
      preuve: f,
    });
    recommandations.push({
      titre: `Test d’éviction : ${f.tag}`,
      texte: `Supprimez « ${f.tag} » pendant 14 jours en continuant à noter normalement, puis réintroduisez-le une seule fois et observez les 48 heures qui suivent. Si la douleur remonte à la réintroduction et pas avant, le lien devient nettement plus crédible.`,
      priorite: f.confiance === 'elevee' ? 'haute' : 'normale',
    });
  }

  for (const f of soulageants) {
    constats.push({
      titre: `« ${f.tag} » : ${f.delta} point ${phraseDecalage(f.decalage)}`,
      texte: `Les jours concernés, la douleur moyenne est de ${f.moyenneExpos}/10 contre ${f.moyenneTemoins}/10 les autres jours (${f.nExpos} jours vs ${f.nTemoins}, p ≈ ${f.p}).`,
      ton: 'positif',
    });
    if (f.categorie === 'traitements') {
      hypotheses.push({
        titre: `« ${f.tag} » semble efficace`,
        texte: 'Ce traitement ou ce soin est associé aux journées les moins douloureuses. Attention au biais inverse : on prend souvent un traitement les jours où la douleur est déjà forte, ce qui masque son effet — ici c’est l’inverse, ce qui est plutôt encourageant.',
        force: 'moyenne',
        preuve: f,
      });
    } else {
      hypotheses.push({
        titre: `« ${f.tag} » : piste de soulagement`,
        texte: `Ce facteur ${LIBELLE_CATEGORIE[f.categorie]} accompagne les journées les plus calmes. À confirmer en l’appliquant délibérément, y compris les jours où la douleur démarre fort.`,
        force: 'moyenne',
        preuve: f,
      });
    }
    recommandations.push({
      titre: `Systématiser : ${f.tag}`,
      texte: `Appliquez « ${f.tag} » tous les jours pendant 14 jours, y compris les bons jours, et comparez la moyenne hebdomadaire avant/après.`,
    });
  }

  /* --- Fatigue et sommeil --- */
  if (liens.fatigue.n >= 7 && liens.fatigue.r !== null && liens.fatigue.r >= 0.4) {
    constats.push({
      titre: 'La fatigue va de pair avec la douleur',
      texte: `Corrélation de rang de ${liens.fatigue.r} sur ${liens.fatigue.n} jours : plus la journée est fatigante, plus la douleur est forte.`,
      ton: 'negatif',
    });
    hypotheses.push({
      titre: 'Cercle fatigue ↔ douleur',
      texte: 'Fatigue et douleur neuropathique s’entretiennent : la fatigue abaisse le seuil de perception de la douleur, et la douleur dégrade le sommeil. Le sens du lien ne peut pas être tranché par ces données seules.',
      force: 'moyenne',
    });
    recommandations.push({
      titre: 'Fractionner les journées chargées',
      texte: 'Sur 2 semaines, testez le « pacing » : coupez les longues périodes debout ou de marche en séquences plus courtes avec 10 minutes assises, avant que la douleur ne monte. Notez la fatigue à chaque saisie pour mesurer l’effet.',
    });
  }
  if (liens.sommeil.n >= 7 && liens.sommeil.r !== null && liens.sommeil.r <= -0.4) {
    constats.push({
      titre: 'Les nuits difficiles précèdent les journées douloureuses',
      texte: `Corrélation de ${liens.sommeil.r} entre qualité du sommeil et douleur sur ${liens.sommeil.n} jours.`,
      ton: 'negatif',
    });
    recommandations.push({
      titre: 'Travailler le sommeil en priorité',
      texte: 'Un sommeil de meilleure qualité est l’un des rares leviers qui agissent sur la douleur neuropathique sans médicament. Horaires réguliers, chambre fraîche, pas d’écran une heure avant — et notez la qualité de nuit chaque matin pour vérifier.',
    });
  }

  /* --- Intensité élevée --- */
  if (res.moyenne !== null && res.moyenne >= 6) {
    recommandations.push({
      titre: 'Douleur élevée en moyenne : en parler',
      texte: `Votre moyenne est de ${res.moyenne}/10 sur l’ensemble du suivi. Une douleur neuropathique de ce niveau justifie une réévaluation du traitement par un médecin — l’export PDF/CSV de ce suivi est fait pour ça.`,
      priorite: 'haute',
    });
  }
  if (res.joursSeveres >= 3) {
    constats.push({
      titre: `${res.joursSeveres} journées avec un pic ≥ 8/10`,
      texte: 'Ces journées méritent d’être relues une par une : ce sont elles qui portent le plus d’information sur les déclencheurs.',
      ton: 'negatif',
    });
  }

  /* --- Données insuffisantes --- */
  if (!qualite.suffisant) {
    recommandations.unshift({
      titre: 'Continuer à noter avant de conclure',
      texte: `L’analyse a besoin d’un peu plus de matière. ${qualite.manques.join(' ')} L’idéal : 3 saisies par jour (matin, après-midi, soir) pendant 2 à 3 semaines.`,
      priorite: 'haute',
    });
  }
  if (qualite.suffisant && !retenus.length) {
    hypotheses.push({
      titre: 'Aucun déclencheur net pour l’instant',
      texte: 'Aucun facteur ne ressort au-dessus du bruit. Soit les déclencheurs sont ailleurs (facteur non noté), soit la douleur évolue de façon largement indépendante de l’environnement quotidien — ce qui est fréquent dans les douleurs neuropathiques d’origine lésionnelle.',
      force: 'faible',
    });
    recommandations.push({
      titre: 'Élargir ce qui est noté',
      texte: 'Ajoutez vos propres étiquettes : marque de chaussures portée, durée de marche estimée, position de travail, température extérieure. Un déclencheur ne peut être détecté que s’il est noté.',
    });
  }

  return {
    genereLe: new Date().toISOString(),
    resume: res,
    qualite,
    tendance: tend,
    pieds,
    horaire,
    profil24h: profil24h(saisies),
    liens,
    impacts,
    zones: frequences(saisies, 'zones'),
    types: frequences(saisies, 'types'),
    constats,
    hypotheses,
    recommandations,
  };
}
