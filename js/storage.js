/**
 * Persistance locale.
 *
 * Toutes les données restent dans le navigateur (localStorage) : rien n'est
 * envoyé sur un serveur. C'est volontaire — il s'agit de données de santé.
 * L'export JSON sert de sauvegarde et de transfert vers un autre appareil.
 */

import { APP_VERSION, STORAGE_KEY, CATEGORIES } from './constants.js';

const base = () => ({ version: APP_VERSION, saisies: [], etiquettes: {}, maj: null });

function memoireVolatile() {
  // Repli si localStorage est indisponible (navigation privée verrouillée).
  let contenu = null;
  return {
    getItem: () => contenu,
    setItem: (_, v) => { contenu = v; },
    removeItem: () => { contenu = null; },
  };
}

const store = (() => {
  try {
    const test = '__test__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    return window.localStorage;
  } catch {
    return memoireVolatile();
  }
})();

export function chargerTout() {
  try {
    const brut = store.getItem(STORAGE_KEY);
    if (!brut) return base();
    const data = JSON.parse(brut);
    return { ...base(), ...data, saisies: Array.isArray(data.saisies) ? data.saisies : [] };
  } catch (e) {
    console.error('Données illisibles, repli sur un suivi vide', e);
    return base();
  }
}

export function enregistrerTout(data) {
  const aEcrire = { ...data, version: APP_VERSION, maj: new Date().toISOString() };
  store.setItem(STORAGE_KEY, JSON.stringify(aEcrire));
  return aEcrire;
}

export function nouvelIdentifiant() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalise une saisie venant du formulaire ou d'un import. */
export function normaliserSaisie(saisie) {
  const facteurs = {};
  for (const cat of CATEGORIES) {
    const v = saisie.facteurs ? saisie.facteurs[cat.id] : undefined;
    facteurs[cat.id] = Array.isArray(v) ? v.filter(Boolean) : [];
  }
  return {
    id: saisie.id || nouvelIdentifiant(),
    horodatage: saisie.horodatage || new Date().toISOString(),
    intensite: Math.min(10, Math.max(1, Number(saisie.intensite) || 1)),
    pied: saisie.pied || 'les-deux',
    zones: Array.isArray(saisie.zones) ? saisie.zones : [],
    types: Array.isArray(saisie.types) ? saisie.types : [],
    fatigue: saisie.fatigue === null || saisie.fatigue === undefined || saisie.fatigue === ''
      ? null : Number(saisie.fatigue),
    sommeil: saisie.sommeil === null || saisie.sommeil === undefined || saisie.sommeil === ''
      ? null : Number(saisie.sommeil),
    facteurs,
    notes: (saisie.notes || '').trim(),
    creeLe: saisie.creeLe || new Date().toISOString(),
  };
}

export function ajouterSaisie(data, saisie) {
  const propre = normaliserSaisie(saisie);
  const suivant = { ...data, saisies: [...data.saisies, propre] };
  return { data: enregistrerTout(trierEtCollecter(suivant)), saisie: propre };
}

export function modifierSaisie(data, id, champs) {
  const saisies = data.saisies.map((s) => (s.id === id ? normaliserSaisie({ ...s, ...champs, id }) : s));
  return enregistrerTout(trierEtCollecter({ ...data, saisies }));
}

export function supprimerSaisie(data, id) {
  return enregistrerTout({ ...data, saisies: data.saisies.filter((s) => s.id !== id) });
}

/** Trie par date et mémorise les étiquettes personnalisées pour les resuggérer. */
function trierEtCollecter(data) {
  const saisies = [...data.saisies].sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  const etiquettes = { ...(data.etiquettes || {}) };
  for (const cat of CATEGORIES) {
    const connues = new Set(etiquettes[cat.id] || []);
    for (const s of saisies) ((s.facteurs || {})[cat.id] || []).forEach((t) => connues.add(t));
    etiquettes[cat.id] = [...connues];
  }
  return { ...data, saisies, etiquettes };
}

/* ------------------------- Import / export ------------------------- */

export function exporterJSON(data) {
  return JSON.stringify({ ...data, exporteLe: new Date().toISOString() }, null, 2);
}

/**
 * Fusionne un fichier importé avec les données actuelles.
 * Les saisies sont dédoublonnées par identifiant, puis par horodatage+intensité.
 */
export function importerJSON(dataActuelle, texte) {
  const entrant = JSON.parse(texte);
  if (!entrant || !Array.isArray(entrant.saisies)) {
    throw new Error('Fichier invalide : aucune liste « saisies » trouvée.');
  }
  const parCle = new Map();
  const cle = (s) => `${s.horodatage}|${s.intensite}|${s.pied}`;
  for (const s of dataActuelle.saisies) parCle.set(cle(s), s);
  let ajoutees = 0;
  for (const brute of entrant.saisies) {
    const s = normaliserSaisie(brute);
    if (!parCle.has(cle(s))) {
      parCle.set(cle(s), s);
      ajoutees += 1;
    }
  }
  const fusion = trierEtCollecter({ ...dataActuelle, saisies: [...parCle.values()] });
  return { data: enregistrerTout(fusion), ajoutees, total: fusion.saisies.length };
}

function champCSV(valeur) {
  const t = valeur === null || valeur === undefined ? '' : String(valeur);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Export CSV (séparateur « ; » pour un Excel francophone). */
export function exporterCSV(saisies) {
  const entetes = [
    'Date', 'Heure', 'Intensité (1-10)', 'Pied', 'Zones', 'Type de douleur',
    'Fatigue (0-10)', 'Sommeil (0-10)',
    ...CATEGORIES.map((c) => c.label),
    'Notes',
  ];
  const lignes = saisies.map((s) => {
    const d = new Date(s.horodatage);
    return [
      s.horodatage.slice(0, 10),
      Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5),
      s.intensite,
      s.pied,
      (s.zones || []).join(', '),
      (s.types || []).join(', '),
      s.fatigue ?? '',
      s.sommeil ?? '',
      ...CATEGORIES.map((c) => ((s.facteurs || {})[c.id] || []).join(', ')),
      s.notes || '',
    ].map(champCSV).join(';');
  });
  return `﻿${[entetes.map(champCSV).join(';'), ...lignes].join('\n')}`;
}
