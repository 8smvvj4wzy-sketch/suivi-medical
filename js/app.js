/**
 * Interface de l'application : assemblage des vues, du formulaire,
 * du journal, de l'analyse et des exports.
 */

import {
  CATEGORIES, PIEDS, ZONES, TYPES_DOULEUR, niveauIntensite,
} from './constants.js';
import {
  chargerTout, enregistrerTout, ajouterSaisie, modifierSaisie, supprimerSaisie,
  exporterJSON, exporterCSV, importerJSON,
} from './storage.js';
import {
  construireRapport, grouperParJour, arrondi,
} from './analysis.js';
import {
  courbeQuotidienne, barresHoraires, barresImpact, anneauPieds,
} from './charts.js';
import { genererDemo } from './demo.js';

const LIBELLES_INTENSITE = {
  1: 'À peine perceptible',
  2: 'Très faible — on l’oublie en s’occupant',
  3: 'Légère — présente mais discrète',
  4: 'Légère à modérée',
  5: 'Modérée — gênante mais supportable',
  6: 'Modérée à forte — difficile à ignorer',
  7: 'Forte — gêne les activités',
  8: 'Très forte — empêche de se concentrer',
  9: 'Sévère — presque insupportable',
  10: 'Maximale — insupportable',
};

const NOM_PIED = { gauche: 'Pied gauche', droit: 'Pied droit', 'les-deux': 'Les deux pieds', 'non-precise': 'Non précisé' };

const etat = {
  data: chargerTout(),
  vue: 'saisie',
  editionId: null,
  rapport: null,
};

/* ------------------------------------------------------------------ */
/* Utilitaires DOM                                                     */
/* ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function creer(balise, classe, texte) {
  const n = document.createElement(balise);
  if (classe) n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

function notifier(message, type = 'info') {
  const n = $('#notification');
  n.textContent = message;
  n.className = `notification ${type}`;
  n.hidden = false;
  clearTimeout(notifier._t);
  notifier._t = setTimeout(() => { n.hidden = true; }, 3600);
}

const formatDateLongue = (iso) => new Date(`${iso}T12:00:00`)
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatHeure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/* ------------------------------------------------------------------ */
/* Sélecteurs de puces (tags)                                          */
/* ------------------------------------------------------------------ */

/**
 * Construit un sélecteur de puces multi-choix.
 * @returns {{lire: function, ecrire: function}}
 */
function selecteurPuces(conteneur, suggestions, { repliable = false } = {}) {
  const choisis = new Set();
  let deplie = !repliable;

  function rendre() {
    conteneur.textContent = '';
    const toutes = [...new Set([...suggestions, ...choisis])];
    const visibles = deplie ? toutes : toutes.filter((t, i) => choisis.has(t) || i < 8);

    for (const tag of visibles) {
      const b = creer('button', `puce${choisis.has(tag) ? ' selectionnee' : ''}`, tag);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(choisis.has(tag)));
      b.addEventListener('click', () => {
        if (choisis.has(tag)) choisis.delete(tag); else choisis.add(tag);
        rendre();
      });
      conteneur.appendChild(b);
    }

    if (repliable && toutes.length > visibles.length) {
      const plus = creer('button', 'puce puce-plus', `+ ${toutes.length - visibles.length} autres`);
      plus.type = 'button';
      plus.addEventListener('click', () => { deplie = true; rendre(); });
      conteneur.appendChild(plus);
    }

    const ajout = creer('button', 'puce puce-ajout', '+ autre…');
    ajout.type = 'button';
    ajout.addEventListener('click', () => {
      const valeur = window.prompt('Ajouter un élément à noter :');
      const propre = (valeur || '').trim();
      if (propre) {
        choisis.add(propre);
        if (!suggestions.includes(propre)) suggestions.push(propre);
        deplie = true;
        rendre();
      }
    });
    conteneur.appendChild(ajout);
  }

  rendre();
  return {
    lire: () => [...choisis],
    ecrire: (valeurs) => {
      choisis.clear();
      (valeurs || []).forEach((v) => {
        choisis.add(v);
        if (!suggestions.includes(v)) suggestions.push(v);
      });
      rendre();
    },
  };
}

const selecteurs = {};

function construireFormulaire() {
  // Choix du pied (boutons segmentés).
  const segments = $('#choix-pied');
  segments.textContent = '';
  for (const p of PIEDS) {
    const b = creer('button', 'segment', p.label);
    b.type = 'button';
    b.dataset.pied = p.id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(p.id === 'les-deux'));
    if (p.id === 'les-deux') b.classList.add('actif');
    b.addEventListener('click', () => {
      $$('#choix-pied .segment').forEach((s) => {
        s.classList.toggle('actif', s === b);
        s.setAttribute('aria-checked', String(s === b));
      });
    });
    segments.appendChild(b);
  }

  selecteurs.zones = selecteurPuces($('#choix-zones'), [...ZONES]);
  selecteurs.types = selecteurPuces($('#choix-types'), [...TYPES_DOULEUR]);

  // Catégories de facteurs.
  const hote = $('#categories-facteurs');
  hote.textContent = '';
  for (const cat of CATEGORIES) {
    const carte = creer('div', 'carte');
    const titre = creer('h2');
    titre.innerHTML = `<span aria-hidden="true">${cat.icone}</span> ${cat.label}`;
    carte.appendChild(titre);
    carte.appendChild(creer('p', 'aide', cat.aide));
    const zone = creer('div', 'puces');
    carte.appendChild(zone);
    hote.appendChild(carte);
    const apprises = (etat.data.etiquettes || {})[cat.id] || [];
    selecteurs[cat.id] = selecteurPuces(zone, [...new Set([...apprises, ...cat.suggestions])], { repliable: true });
  }
}

/* ------------------------------------------------------------------ */
/* Formulaire                                                          */
/* ------------------------------------------------------------------ */

function majAffichageIntensite() {
  const v = Number($('#intensite').value);
  const pastille = $('#valeur-intensite');
  pastille.textContent = v;
  pastille.style.background = niveauIntensite(v).couleur;
  $('#libelle-intensite').textContent = LIBELLES_INTENSITE[v];
}

function reinitialiserFormulaire({ garderContexte = true } = {}) {
  const maintenant = new Date();
  $('#saisie-id').value = '';
  $('#date-saisie').value = maintenant.toISOString().slice(0, 10);
  $('#heure-saisie').value = maintenant.toTimeString().slice(0, 5);
  $('#intensite').value = 5;
  $('#fatigue').value = 5;
  $('#valeur-fatigue').textContent = '5';
  $('#notes').value = '';
  majAffichageIntensite();

  selecteurs.zones.ecrire([]);
  selecteurs.types.ecrire([]);
  for (const cat of CATEGORIES) selecteurs[cat.id].ecrire([]);

  if (!garderContexte) {
    $('#sommeil').value = 5;
    $('#valeur-sommeil').textContent = '5';
  }
  $('#bouton-enregistrer').textContent = 'Enregistrer la note';
  $('#bouton-annuler-edition').hidden = true;
  etat.editionId = null;
}

function lireFormulaire() {
  const date = $('#date-saisie').value;
  const heure = $('#heure-saisie').value || '12:00';
  const horodatage = new Date(`${date}T${heure}:00`);
  const pied = ($('#choix-pied .segment.actif') || {}).dataset?.pied || 'les-deux';
  const facteurs = {};
  for (const cat of CATEGORIES) facteurs[cat.id] = selecteurs[cat.id].lire();
  return {
    id: $('#saisie-id').value || undefined,
    horodatage: horodatage.toISOString(),
    intensite: Number($('#intensite').value),
    pied,
    zones: selecteurs.zones.lire(),
    types: selecteurs.types.lire(),
    fatigue: Number($('#fatigue').value),
    sommeil: Number($('#sommeil').value),
    facteurs,
    notes: $('#notes').value,
  };
}

function remplirFormulaire(saisie) {
  etat.editionId = saisie.id;
  $('#saisie-id').value = saisie.id;
  const d = new Date(saisie.horodatage);
  $('#date-saisie').value = saisie.horodatage.slice(0, 10);
  $('#heure-saisie').value = d.toTimeString().slice(0, 5);
  $('#intensite').value = saisie.intensite;
  $('#fatigue').value = saisie.fatigue ?? 5;
  $('#valeur-fatigue').textContent = String(saisie.fatigue ?? 5);
  $('#sommeil').value = saisie.sommeil ?? 5;
  $('#valeur-sommeil').textContent = String(saisie.sommeil ?? 5);
  $('#notes').value = saisie.notes || '';
  majAffichageIntensite();

  $$('#choix-pied .segment').forEach((s) => {
    const actif = s.dataset.pied === saisie.pied;
    s.classList.toggle('actif', actif);
    s.setAttribute('aria-checked', String(actif));
  });
  selecteurs.zones.ecrire(saisie.zones);
  selecteurs.types.ecrire(saisie.types);
  for (const cat of CATEGORIES) selecteurs[cat.id].ecrire((saisie.facteurs || {})[cat.id] || []);

  $('#bouton-enregistrer').textContent = 'Mettre à jour la note';
  $('#bouton-annuler-edition').hidden = false;
  allerA('saisie');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

function rendreJournal() {
  const hote = $('#liste-journal');
  hote.textContent = '';
  const filtrePied = $('#filtre-pied').value;
  const seuil = Number($('#filtre-intensite').value);

  const saisies = etat.data.saisies.filter(
    (s) => (!filtrePied || s.pied === filtrePied) && s.intensite >= seuil,
  );

  if (!saisies.length) {
    hote.appendChild(messageVide(
      etat.data.saisies.length ? 'Aucune saisie ne correspond à ce filtre.' : 'Aucune note pour l’instant. Commencez par l’onglet « Noter ».',
    ));
    return;
  }

  const jours = grouperParJour(saisies).reverse();
  for (const jour of jours) {
    const bloc = creer('section', 'jour');

    const entete = creer('header', 'jour-entete');
    entete.appendChild(creer('h2', null, formatDateLongue(jour.date)));
    const resume = creer('div', 'jour-resume');
    const moy = creer('span', 'badge', `moy. ${arrondi(jour.moyenne)}/10`);
    moy.style.background = niveauIntensite(jour.moyenne).couleur;
    resume.appendChild(moy);
    resume.appendChild(creer('span', 'badge badge-sobre', `pic ${jour.max}/10`));
    resume.appendChild(creer('span', 'badge badge-sobre', `${jour.nb} saisie${jour.nb > 1 ? 's' : ''}`));
    entete.appendChild(resume);
    bloc.appendChild(entete);

    for (const s of [...jour.saisies].reverse()) {
      bloc.appendChild(ligneSaisie(s));
    }
    hote.appendChild(bloc);
  }
}

function ligneSaisie(s) {
  const ligne = creer('article', 'saisie');

  const pastille = creer('div', 'pastille-saisie', String(s.intensite));
  pastille.style.background = niveauIntensite(s.intensite).couleur;
  pastille.title = niveauIntensite(s.intensite).label;
  ligne.appendChild(pastille);

  const corps = creer('div', 'saisie-corps');
  const haut = creer('div', 'saisie-haut');
  haut.appendChild(creer('strong', null, formatHeure(s.horodatage)));
  haut.appendChild(creer('span', 'puce-info', NOM_PIED[s.pied] || s.pied));
  if (typeof s.fatigue === 'number') haut.appendChild(creer('span', 'puce-info discret', `fatigue ${s.fatigue}/10`));
  corps.appendChild(haut);

  const tags = [
    ...(s.zones || []),
    ...(s.types || []),
    ...CATEGORIES.flatMap((c) => ((s.facteurs || {})[c.id] || []).map((t) => `${c.icone} ${t}`)),
  ];
  if (tags.length) {
    const zone = creer('div', 'saisie-tags');
    tags.forEach((t) => zone.appendChild(creer('span', 'tag', t)));
    corps.appendChild(zone);
  }
  if (s.notes) corps.appendChild(creer('p', 'saisie-notes', s.notes));
  ligne.appendChild(corps);

  const actions = creer('div', 'saisie-actions');
  const modifier = creer('button', 'icone', '✎');
  modifier.type = 'button';
  modifier.title = 'Modifier';
  modifier.setAttribute('aria-label', 'Modifier cette note');
  modifier.addEventListener('click', () => remplirFormulaire(s));
  const effacer = creer('button', 'icone danger', '🗑');
  effacer.type = 'button';
  effacer.title = 'Supprimer';
  effacer.setAttribute('aria-label', 'Supprimer cette note');
  effacer.addEventListener('click', () => {
    if (window.confirm('Supprimer cette note ?')) {
      etat.data = supprimerSaisie(etat.data, s.id);
      rafraichir();
      notifier('Note supprimée.');
    }
  });
  actions.appendChild(modifier);
  actions.appendChild(effacer);
  ligne.appendChild(actions);
  return ligne;
}

function messageVide(texte) {
  const c = creer('div', 'carte carte-vide');
  c.appendChild(creer('p', 'texte', texte));
  return c;
}

/* ------------------------------------------------------------------ */
/* Analyse                                                             */
/* ------------------------------------------------------------------ */

function tuile(valeur, libelle, couleur) {
  const t = creer('div', 'tuile');
  const v = creer('div', 'tuile-valeur', valeur === null || valeur === undefined ? '—' : String(valeur));
  if (couleur) v.style.color = couleur;
  t.appendChild(v);
  t.appendChild(creer('div', 'tuile-libelle', libelle));
  return t;
}

function carteTexte(titre, texte, classe = '') {
  const c = creer('div', `carte ${classe}`.trim());
  c.appendChild(creer('h3', null, titre));
  c.appendChild(creer('p', 'texte', texte));
  return c;
}

function rendreAnalyse() {
  const hote = $('#contenu-analyse');
  hote.textContent = '';

  if (!etat.data.saisies.length) {
    hote.appendChild(messageVide('Aucune donnée à analyser pour l’instant. Notez quelques journées, puis revenez ici.'));
    return;
  }

  const r = construireRapport(etat.data.saisies);
  etat.rapport = r;
  const jours = grouperParJour(etat.data.saisies);

  /* Chiffres clés */
  const cles = creer('div', 'carte');
  cles.appendChild(creer('h2', null, 'Vue d’ensemble'));
  const tuiles = creer('div', 'tuiles');
  tuiles.appendChild(tuile(r.resume.moyenne, 'Moyenne générale', niveauIntensite(r.resume.moyenne || 0).couleur));
  tuiles.appendChild(tuile(r.resume.moyenne7j, '7 derniers jours', niveauIntensite(r.resume.moyenne7j || 0).couleur));
  tuiles.appendChild(tuile(r.resume.max, 'Pic maximal'));
  tuiles.appendChild(tuile(r.resume.nbJours, 'Jours suivis'));
  tuiles.appendChild(tuile(r.resume.nbSaisies, 'Notes prises'));
  tuiles.appendChild(tuile(r.resume.joursSansDouleur, 'Jours calmes (≤ 2)'));
  cles.appendChild(tuiles);
  if (r.tendance) {
    const fleche = { amelioration: '↘', aggravation: '↗', stable: '→' }[r.tendance.direction];
    const mot = { amelioration: 'en amélioration', aggravation: 'en aggravation', stable: 'stable' }[r.tendance.direction];
    const p = creer('p', `tendance tendance-${r.tendance.direction}`,
      `${fleche} Tendance ${mot} sur ${r.tendance.joursAnalyses} jours : ${r.tendance.moyennePrecedente} → ${r.tendance.moyenneRecente} (${r.tendance.penteParSemaine > 0 ? '+' : ''}${r.tendance.penteParSemaine} point/semaine).`);
    cles.appendChild(p);
  }
  hote.appendChild(cles);

  /* Qualité des données */
  if (!r.qualite.suffisant) {
    const c = creer('div', 'carte carte-avertissement');
    c.appendChild(creer('h3', null, 'Analyse encore préliminaire'));
    const ul = creer('ul', 'liste');
    r.qualite.manques.forEach((m) => ul.appendChild(creer('li', null, m)));
    c.appendChild(ul);
    hote.appendChild(c);
  }

  /* Graphiques */
  const gCourbe = creer('div', 'carte');
  gCourbe.appendChild(creer('h2', null, 'Évolution jour après jour'));
  gCourbe.appendChild(creer('p', 'aide', 'Trait plein : moyenne du jour. Trait pointillé : pic du jour.'));
  gCourbe.appendChild(courbeQuotidienne(jours));
  hote.appendChild(gCourbe);

  const gHeure = creer('div', 'carte');
  gHeure.appendChild(creer('h2', null, 'À quelle heure la douleur frappe-t-elle ?'));
  gHeure.appendChild(barresHoraires(r.profil24h));
  const listeMoments = creer('div', 'moments');
  r.horaire.filter((m) => m.nb).forEach((m) => {
    const b = creer('div', 'moment');
    b.appendChild(creer('div', 'moment-valeur', `${m.moyenne}/10`));
    b.appendChild(creer('div', 'moment-label', `${m.label} · ${m.nb} note${m.nb > 1 ? 's' : ''}`));
    listeMoments.appendChild(b);
  });
  gHeure.appendChild(listeMoments);
  hote.appendChild(gHeure);

  const gPieds = creer('div', 'carte');
  gPieds.appendChild(creer('h2', null, 'Répartition gauche / droite'));
  gPieds.appendChild(anneauPieds(r.pieds));
  const tableauPieds = creer('div', 'moments');
  r.pieds.forEach((p) => {
    const b = creer('div', 'moment');
    b.appendChild(creer('div', 'moment-valeur', `${p.moyenne ?? '—'}/10`));
    b.appendChild(creer('div', 'moment-label', `${NOM_PIED[p.pied] || p.pied} · ${p.nb} note${p.nb > 1 ? 's' : ''}`));
    tableauPieds.appendChild(b);
  });
  gPieds.appendChild(tableauPieds);
  hote.appendChild(gPieds);

  /* Impact des facteurs */
  for (const cat of CATEGORIES) {
    const impacts = (r.impacts[cat.id] || []).filter((i) => i.confiance !== 'insuffisante');
    const c = creer('div', 'carte');
    const h = creer('h2');
    h.innerHTML = `<span aria-hidden="true">${cat.icone}</span> Effet estimé — ${cat.label.toLowerCase()}`;
    c.appendChild(h);
    if (!impacts.length) {
      c.appendChild(creer('p', 'aide', 'Pas encore assez de journées avec ET sans ces éléments pour comparer. Il faut au moins 3 jours de chaque côté.'));
    } else {
      c.appendChild(barresImpact(impacts));
      c.appendChild(tableauImpacts(impacts));
      c.appendChild(creer('p', 'aide',
        'Écart = intensité moyenne des jours concernés moins celle des autres jours. « q corrigé » tient compte du nombre d’éléments testés : plus il est bas, moins l’écart risque d’être un hasard.'));
    }
    hote.appendChild(c);
  }

  /* Fatigue et sommeil */
  const cLiens = creer('div', 'carte');
  cLiens.appendChild(creer('h2', null, 'Fatigue, sommeil et douleur'));
  const ulLiens = creer('ul', 'liste');
  ulLiens.appendChild(creer('li', null, descriptionCorrelation('Fatigue du jour', r.liens.fatigue, true)));
  ulLiens.appendChild(creer('li', null, descriptionCorrelation('Qualité de la nuit', r.liens.sommeil, false)));
  ulLiens.appendChild(creer('li', null, descriptionCorrelation('Fatigue de la veille', r.liens.fatigueVeille, true)));
  cLiens.appendChild(ulLiens);
  hote.appendChild(cLiens);

  /* Constats */
  if (r.constats.length) {
    const c = creer('div', 'carte');
    c.appendChild(creer('h2', null, 'Ce que montrent les données'));
    r.constats.forEach((cst) => {
      const bloc = creer('div', `constat constat-${cst.ton}`);
      bloc.appendChild(creer('h3', null, cst.titre));
      bloc.appendChild(creer('p', 'texte', cst.texte));
      c.appendChild(bloc);
    });
    hote.appendChild(c);
  }

  /* Hypothèses */
  const cHypo = creer('div', 'carte');
  cHypo.appendChild(creer('h2', null, 'Hypothèses à explorer'));
  cHypo.appendChild(creer('p', 'aide', 'Formulées au conditionnel : ce sont des pistes de discussion, pas des diagnostics.'));
  if (!r.hypotheses.length) {
    cHypo.appendChild(creer('p', 'texte', 'Rien de solide à proposer pour l’instant — continuez à noter.'));
  } else {
    r.hypotheses.forEach((h) => {
      const bloc = creer('div', 'hypothese');
      const entete = creer('div', 'hypothese-entete');
      entete.appendChild(creer('h3', null, h.titre));
      entete.appendChild(creer('span', `badge-confiance c-${h.force}`, `piste ${h.force}`));
      bloc.appendChild(entete);
      bloc.appendChild(creer('p', 'texte', h.texte));
      if (h.preuve) {
        bloc.appendChild(creer('p', 'preuve',
          `Base : ${h.preuve.nExpos} jours avec « ${h.preuve.tag} » (moyenne ${h.preuve.moyenneExpos}/10) contre ${h.preuve.nTemoins} jours sans (${h.preuve.moyenneTemoins}/10) — p ≈ ${h.preuve.p}, q corrigé ≈ ${h.preuve.q}.`));
      }
      cHypo.appendChild(bloc);
    });
  }
  hote.appendChild(cHypo);

  /* Recommandations */
  const cReco = creer('div', 'carte');
  cReco.appendChild(creer('h2', null, 'À essayer'));
  r.recommandations.forEach((reco, i) => {
    const bloc = creer('div', `reco${reco.priorite === 'haute' ? ' reco-haute' : ''}`);
    const entete = creer('div', 'reco-entete');
    entete.appendChild(creer('span', 'reco-numero', String(i + 1)));
    entete.appendChild(creer('h3', null, reco.titre));
    bloc.appendChild(entete);
    bloc.appendChild(creer('p', 'texte', reco.texte));
    cReco.appendChild(bloc);
  });
  hote.appendChild(cReco);

  hote.appendChild(carteTexte(
    'Rappel',
    'Ces résultats décrivent des associations entre ce que vous notez et ce que vous ressentez. Une association n’est pas une cause : seul un test d’éviction/réintroduction, et surtout un avis médical, peuvent trancher.',
    'carte-note',
  ));
}

function descriptionCorrelation(nom, lien, positifEstMauvais) {
  if (lien.r === null || lien.n < 5) return `${nom} : pas encore assez de données (${lien.n} jours).`;
  const force = Math.abs(lien.r);
  const intensite = force >= 0.6 ? 'fort' : force >= 0.4 ? 'net' : force >= 0.2 ? 'faible' : 'quasi nul';
  const sens = lien.r > 0
    ? (positifEstMauvais ? 'plus il y en a, plus la douleur est forte' : 'plus elle est bonne, plus la douleur est forte')
    : (positifEstMauvais ? 'plus il y en a, moins la douleur est forte' : 'meilleure est la nuit, plus faible est la douleur');
  return `${nom} : lien ${intensite} (r = ${lien.r} sur ${lien.n} jours) — ${sens}.`;
}

function tableauImpacts(impacts) {
  const table = creer('table', 'tableau');
  const thead = creer('thead');
  const trh = creer('tr');
  ['Élément', 'Effet', 'Quand', 'Jours avec / sans', 'q corrigé', 'Confiance'].forEach((t) => trh.appendChild(creer('th', null, t)));
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = creer('tbody');
  for (const i of impacts.slice(0, 10)) {
    const tr = creer('tr');
    tr.appendChild(creer('td', null, i.tag));
    const td = creer('td', i.delta >= 0 ? 'aggrave' : 'soulage', `${i.delta > 0 ? '+' : ''}${i.delta}`);
    tr.appendChild(td);
    tr.appendChild(creer('td', null, i.decalage === 0 ? 'jour même' : 'lendemain'));
    tr.appendChild(creer('td', null, `${i.nExpos} / ${i.nTemoins}`));
    const tdQ = creer('td', null, i.q === null || i.q === undefined ? '—' : String(i.q));
    tdQ.title = `p brut ≈ ${i.p} — corrigé pour le nombre de comparaisons (Benjamini-Hochberg)`;
    tr.appendChild(tdQ);
    tr.appendChild(creer('td', null, { elevee: 'élevée', moyenne: 'moyenne', faible: 'faible' }[i.confiance] || i.confiance));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

function telecharger(nom, contenu, type) {
  const blob = new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const echapper = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rapport imprimable destiné au professionnel de santé. */
function construireRapportImprimable() {
  const r = construireRapport(etat.data.saisies);
  const jours = grouperParJour(etat.data.saisies);
  const serialiser = (svg) => new XMLSerializer().serializeToString(svg);

  const sectionListe = (titre, elements, rendu) => (elements.length
    ? `<h2>${titre}</h2>${elements.map(rendu).join('')}`
    : '');

  const dernieres = [...etat.data.saisies].slice(-40).reverse();

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Suivi des douleurs nerveuses du pied — rapport</title>
<style>
  :root{--i1:#22c55e;--i2:#84cc16;--i3:#f59e0b;--i4:#f97316;--i5:#dc2626;
        --trait-faible:#cbd5e1;--pied-g:#6366f1;--pied-d:#0ea5e9;--pied-gd:#ec4899;}
  body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;max-width:800px;margin:0 auto;padding:24px;}
  h1{font-size:22px;margin:0 0 4px;} h2{font-size:16px;margin:26px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;}
  h3{font-size:14px;margin:12px 0 2px;}
  .meta{color:#64748b;font-size:12px;margin-bottom:18px;}
  .tuiles{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0;}
  .tuile{border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;min-width:96px;}
  .tuile b{display:block;font-size:20px;}
  .tuile span{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}
  th,td{border:1px solid #e2e8f0;padding:4px 6px;text-align:left;vertical-align:top;}
  th{background:#f8fafc;}
  .graphe{width:100%;height:auto;}
  .grille{stroke:#e2e8f0;stroke-width:1;} .axe{fill:#64748b;font-size:10px;}
  .courbe{fill:none;stroke:#0f766e;stroke-width:2;} .aire{fill:#0f766e;opacity:.10;}
  .courbe-pic{fill:none;stroke:#f97316;stroke-width:1.4;stroke-dasharray:4 3;}
  .axe-zero{stroke:#94a3b8;} .barre-aggrave{fill:#dc2626;} .barre-soulage{fill:#16a34a;}
  .etiquette-barre{fill:#0f172a;font-size:11px;} .valeur-barre{fill:#64748b;font-size:11px;}
  .legende{fill:#0f172a;font-size:11px;} .anneau-trou{fill:#fff;} .vide{fill:#94a3b8;font-size:12px;}
  .note{background:#f8fafc;border-left:3px solid #0f766e;padding:8px 12px;margin:8px 0;}
  .avert{border:1px solid #fca5a5;background:#fef2f2;padding:10px 12px;border-radius:8px;margin-top:22px;font-size:12px;}
  @media print{ body{padding:0;} h2{break-after:avoid;} .note,table{break-inside:avoid;} }
</style></head><body>
<h1>Suivi des douleurs nerveuses du pied</h1>
<p class="meta">Période du ${r.resume.premiereDate || '—'} au ${r.resume.derniereDate || '—'} ·
${r.resume.nbSaisies} notes sur ${r.resume.nbJours} jours ·
rapport édité le ${new Date().toLocaleDateString('fr-FR')}</p>

<div class="tuiles">
  <div class="tuile"><b>${r.resume.moyenne ?? '—'}</b><span>Moyenne /10</span></div>
  <div class="tuile"><b>${r.resume.moyenne7j ?? '—'}</b><span>7 derniers jours</span></div>
  <div class="tuile"><b>${r.resume.max ?? '—'}</b><span>Pic</span></div>
  <div class="tuile"><b>${r.resume.mediane ?? '—'}</b><span>Médiane</span></div>
  <div class="tuile"><b>${r.resume.joursSeveres}</b><span>Jours ≥ 8/10</span></div>
</div>

${r.tendance ? `<p class="note"><strong>Tendance :</strong> ${
  { amelioration: 'amélioration', aggravation: 'aggravation', stable: 'stable' }[r.tendance.direction]
} sur ${r.tendance.joursAnalyses} jours (${r.tendance.moyennePrecedente} → ${r.tendance.moyenneRecente}, ${
  r.tendance.penteParSemaine > 0 ? '+' : ''}${r.tendance.penteParSemaine} point/semaine).</p>` : ''}

<h2>Évolution quotidienne</h2>
${serialiser(courbeQuotidienne(jours))}

<h2>Profil horaire</h2>
${serialiser(barresHoraires(r.profil24h))}

<h2>Latéralité</h2>
${serialiser(anneauPieds(r.pieds))}

${Object.entries(r.impacts).map(([cat, liste]) => {
    const utiles = liste.filter((i) => i.confiance !== 'insuffisante' && i.confiance !== 'faible');
    if (!utiles.length) return '';
    const nom = CATEGORIES.find((c) => c.id === cat)?.label || cat;
    return `<h2>Facteurs — ${echapper(nom.toLowerCase())}</h2>${serialiser(barresImpact(utiles))}
    <table><tr><th>Élément</th><th>Écart</th><th>Décalage</th><th>Jours avec/sans</th><th>p</th><th>q (BH)</th></tr>
    ${utiles.map((i) => `<tr><td>${echapper(i.tag)}</td><td>${i.delta > 0 ? '+' : ''}${i.delta}</td><td>${i.decalage ? 'J+1' : 'J'}</td><td>${i.nExpos}/${i.nTemoins}</td><td>${i.p}</td><td>${i.q}</td></tr>`).join('')}
    </table>`;
  }).join('')}

${sectionListe('Constats', r.constats, (c) => `<h3>${echapper(c.titre)}</h3><p>${echapper(c.texte)}</p>`)}
${sectionListe('Hypothèses (non diagnostiques)', r.hypotheses, (h) => `<h3>${echapper(h.titre)} — piste ${h.force}</h3><p>${echapper(h.texte)}</p>`)}
${sectionListe('Pistes déjà envisagées par le patient', r.recommandations, (x) => `<h3>${echapper(x.titre)}</h3><p>${echapper(x.texte)}</p>`)}

<h2>40 dernières notes</h2>
<table>
<tr><th>Date</th><th>Heure</th><th>/10</th><th>Pied</th><th>Fatigue</th><th>Éléments notés</th><th>Note</th></tr>
${dernieres.map((s) => {
    const facteurs = CATEGORIES.flatMap((c) => ((s.facteurs || {})[c.id] || [])).join(', ');
    return `<tr><td>${s.horodatage.slice(0, 10)}</td><td>${formatHeure(s.horodatage)}</td><td>${s.intensite}</td>
    <td>${echapper(NOM_PIED[s.pied] || s.pied)}</td><td>${s.fatigue ?? ''}</td>
    <td>${echapper([...(s.zones || []), ...(s.types || []), facteurs].filter(Boolean).join(', '))}</td>
    <td>${echapper(s.notes || '')}</td></tr>`;
  }).join('')}
</table>

<p class="avert"><strong>Avertissement.</strong> Document produit automatiquement à partir des
notes du patient. Les écarts présentés sont des associations statistiques sur de petits
échantillons, sans valeur diagnostique. Méthode : comparaison des moyennes journalières
(jours exposés vs témoins, décalages J et J+1), test de permutation bilatéral à 2 000 tirages,
puis correction des tests multiples par la procédure de Benjamini-Hochberg (colonne « q »).
Seuls les résultats de confiance moyenne ou élevée sont repris dans les sections précédentes.</p>
</body></html>`;
}

function ouvrirRapport() {
  if (!etat.data.saisies.length) {
    notifier('Aucune donnée à mettre dans le rapport.', 'erreur');
    return;
  }
  const html = construireRapportImprimable();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const fenetre = window.open(url, '_blank');
  if (!fenetre) {
    telecharger('rapport-suivi-douleur.html', html, 'text/html');
    notifier('Le rapport a été téléchargé (fenêtre bloquée par le navigateur).');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ------------------------------------------------------------------ */
/* Navigation et rafraîchissement                                      */
/* ------------------------------------------------------------------ */

function allerA(vue) {
  etat.vue = vue;
  $$('.onglet').forEach((o) => {
    const actif = o.dataset.vue === vue;
    o.classList.toggle('actif', actif);
    o.setAttribute('aria-selected', String(actif));
  });
  $$('.vue').forEach((v) => {
    const actif = v.id === `vue-${vue}`;
    v.classList.toggle('active', actif);
    v.hidden = !actif;
  });
  if (vue === 'journal') rendreJournal();
  if (vue === 'analyse') rendreAnalyse();
  if (vue === 'donnees') majEtatStockage();
}

function majEtatStockage() {
  const n = etat.data.saisies.length;
  const jours = grouperParJour(etat.data.saisies).length;
  const maj = etat.data.maj ? new Date(etat.data.maj).toLocaleString('fr-FR') : '—';
  $('#etat-stockage').textContent = `${n} note${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''} sur ${jours} jour${jours > 1 ? 's' : ''}. Dernière modification : ${maj}.`;
}

function rafraichir() {
  if (etat.vue === 'journal') rendreJournal();
  if (etat.vue === 'analyse') rendreAnalyse();
  if (etat.vue === 'donnees') majEtatStockage();
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

function brancherEvenements() {
  $$('.onglet').forEach((o) => o.addEventListener('click', () => allerA(o.dataset.vue)));

  $('#intensite').addEventListener('input', majAffichageIntensite);
  $('#fatigue').addEventListener('input', (e) => { $('#valeur-fatigue').textContent = e.target.value; });
  $('#sommeil').addEventListener('input', (e) => { $('#valeur-sommeil').textContent = e.target.value; });

  $$('[data-heure]').forEach((b) => b.addEventListener('click', () => {
    const maintenant = new Date();
    const heures = { maintenant: null, reveil: '07:30', midi: '12:30', soir: '21:00' };
    const cible = heures[b.dataset.heure];
    $('#date-saisie').value = maintenant.toISOString().slice(0, 10);
    $('#heure-saisie').value = cible || maintenant.toTimeString().slice(0, 5);
  }));

  $('#formulaire').addEventListener('submit', (e) => {
    e.preventDefault();
    const saisie = lireFormulaire();
    if (!saisie.horodatage || Number.isNaN(new Date(saisie.horodatage).getTime())) {
      notifier('Date ou heure invalide.', 'erreur');
      return;
    }
    if (etat.editionId) {
      etat.data = modifierSaisie(etat.data, etat.editionId, saisie);
      notifier('Note mise à jour.');
    } else {
      const res = ajouterSaisie(etat.data, saisie);
      etat.data = res.data;
      notifier('Note enregistrée.');
    }
    construireFormulaire();
    reinitialiserFormulaire();
    rafraichir();
  });

  $('#bouton-annuler-edition').addEventListener('click', () => {
    reinitialiserFormulaire();
    notifier('Modification annulée.');
  });

  $('#filtre-pied').addEventListener('change', rendreJournal);
  $('#filtre-intensite').addEventListener('change', rendreJournal);

  $('#export-json').addEventListener('click', () => {
    telecharger(`suivi-douleur-${new Date().toISOString().slice(0, 10)}.json`,
      exporterJSON(etat.data), 'application/json');
  });
  $('#export-csv').addEventListener('click', () => {
    telecharger(`suivi-douleur-${new Date().toISOString().slice(0, 10)}.csv`,
      exporterCSV(etat.data.saisies), 'text/csv;charset=utf-8');
  });
  $('#export-rapport').addEventListener('click', ouvrirRapport);

  $('#import-fichier').addEventListener('change', async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    const message = $('#message-import');
    try {
      const texte = await fichier.text();
      const res = importerJSON(etat.data, texte);
      etat.data = res.data;
      message.hidden = false;
      message.className = 'message succes';
      message.textContent = `${res.ajoutees} note(s) ajoutée(s). Total : ${res.total}.`;
      construireFormulaire();
      rafraichir();
    } catch (err) {
      message.hidden = false;
      message.className = 'message erreur';
      message.textContent = `Import impossible : ${err.message}`;
    }
    e.target.value = '';
  });

  $('#jeu-demo').addEventListener('click', () => {
    if (etat.data.saisies.length
      && !window.confirm('Des notes existent déjà. Ajouter par-dessus le jeu de démonstration ?')) return;
    const demo = genererDemo(30);
    etat.data = enregistrerTout({ ...etat.data, saisies: [...etat.data.saisies, ...demo] });
    construireFormulaire();
    notifier('Jeu de démonstration chargé.');
    allerA('analyse');
  });

  $('#tout-effacer').addEventListener('click', () => {
    if (!window.confirm('Effacer définitivement toutes les notes de cet appareil ?')) return;
    if (!window.confirm('Cette action est irréversible. Avez-vous exporté une sauvegarde ?')) return;
    etat.data = enregistrerTout({ ...etat.data, saisies: [], etiquettes: {} });
    construireFormulaire();
    rafraichir();
    notifier('Toutes les notes ont été effacées.');
  });
}

function demarrer() {
  construireFormulaire();
  reinitialiserFormulaire({ garderContexte: false });
  brancherEvenements();
  allerA('saisie');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non critique */ });
  }
}

demarrer();
