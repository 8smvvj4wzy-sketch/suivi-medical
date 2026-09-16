/**
 * Graphiques SVG faits main : aucune dépendance, fonctionne hors ligne,
 * lisible en thème clair comme en thème sombre (les couleurs viennent du CSS).
 */

const NS = 'http://www.w3.org/2000/svg';

function el(nom, attrs = {}, texte = null) {
  const noeud = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) noeud.setAttribute(k, v);
  if (texte !== null) noeud.textContent = texte;
  return noeud;
}

function cadre(largeur, hauteur, titre) {
  const svg = el('svg', {
    viewBox: `0 0 ${largeur} ${hauteur}`,
    class: 'graphe',
    role: 'img',
    'aria-label': titre,
    preserveAspectRatio: 'xMidYMid meet',
  });
  return svg;
}

function couleurIntensite(v) {
  if (v === null) return 'var(--trait-faible)';
  if (v <= 2) return 'var(--i1)';
  if (v <= 4) return 'var(--i2)';
  if (v <= 6) return 'var(--i3)';
  if (v <= 8) return 'var(--i4)';
  return 'var(--i5)';
}

const jourCourt = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

/** Courbe de l'intensité moyenne (et du pic) jour par jour. */
export function courbeQuotidienne(jours) {
  const L = 720;
  const H = 260;
  const marge = { haut: 16, droite: 14, bas: 34, gauche: 30 };
  const svg = cadre(L, H, 'Évolution de la douleur jour par jour');
  const points = jours.filter((j) => j.moyenne !== null);
  if (points.length < 2) {
    svg.appendChild(el('text', { x: L / 2, y: H / 2, 'text-anchor': 'middle', class: 'vide' },
      'Pas encore assez de jours pour tracer une courbe.'));
    return svg;
  }

  const largeurUtile = L - marge.gauche - marge.droite;
  const hauteurUtile = H - marge.haut - marge.bas;
  const x = (i) => marge.gauche + (i / (points.length - 1)) * largeurUtile;
  const y = (v) => marge.haut + hauteurUtile - ((v - 0) / 10) * hauteurUtile;

  for (let v = 0; v <= 10; v += 2) {
    svg.appendChild(el('line', {
      x1: marge.gauche, x2: L - marge.droite, y1: y(v), y2: y(v), class: 'grille',
    }));
    svg.appendChild(el('text', { x: marge.gauche - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axe' }, String(v)));
  }

  const aire = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.moyenne)}`).join(' ');
  svg.appendChild(el('path', {
    d: `${aire} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`, class: 'aire',
  }));
  svg.appendChild(el('path', { d: aire, class: 'courbe' }));

  const pics = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.max)}`).join(' ');
  svg.appendChild(el('path', { d: pics, class: 'courbe-pic' }));

  points.forEach((p, i) => {
    const c = el('circle', { cx: x(i), cy: y(p.moyenne), r: 3.5, fill: couleurIntensite(p.moyenne), class: 'point' });
    c.appendChild(el('title', {}, `${jourCourt(p.date)} — moyenne ${p.moyenne.toFixed(1)}/10, pic ${p.max}/10 (${p.nb} saisie${p.nb > 1 ? 's' : ''})`));
    svg.appendChild(c);
  });

  const pas = Math.max(1, Math.ceil(points.length / 8));
  points.forEach((p, i) => {
    if (i % pas === 0 || i === points.length - 1) {
      svg.appendChild(el('text', { x: x(i), y: H - 12, 'text-anchor': 'middle', class: 'axe' }, jourCourt(p.date)));
    }
  });
  return svg;
}

/** Barres verticales : intensité moyenne par heure de la journée. */
export function barresHoraires(profil) {
  const L = 720;
  const H = 220;
  const marge = { haut: 14, droite: 10, bas: 30, gauche: 30 };
  const svg = cadre(L, H, 'Intensité moyenne selon l’heure');
  const utile = profil.filter((p) => p.nb > 0);
  if (!utile.length) {
    svg.appendChild(el('text', { x: L / 2, y: H / 2, 'text-anchor': 'middle', class: 'vide' }, 'Aucune donnée horaire.'));
    return svg;
  }
  const largeurUtile = L - marge.gauche - marge.droite;
  const hauteurUtile = H - marge.haut - marge.bas;
  const larg = largeurUtile / 24;
  const y = (v) => marge.haut + hauteurUtile - (v / 10) * hauteurUtile;

  for (let v = 0; v <= 10; v += 5) {
    svg.appendChild(el('line', { x1: marge.gauche, x2: L - marge.droite, y1: y(v), y2: y(v), class: 'grille' }));
    svg.appendChild(el('text', { x: marge.gauche - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axe' }, String(v)));
  }

  profil.forEach((p) => {
    const gx = marge.gauche + p.heure * larg;
    if (p.moyenne === null) return;
    const rect = el('rect', {
      x: gx + 2, y: y(p.moyenne), width: Math.max(2, larg - 4),
      height: Math.max(1, y(0) - y(p.moyenne)), rx: 3, fill: couleurIntensite(p.moyenne),
    });
    rect.appendChild(el('title', {}, `${String(p.heure).padStart(2, '0')} h — ${p.moyenne}/10 (${p.nb} saisie${p.nb > 1 ? 's' : ''})`));
    svg.appendChild(rect);
    if (p.heure % 3 === 0) {
      svg.appendChild(el('text', { x: gx + larg / 2, y: H - 10, 'text-anchor': 'middle', class: 'axe' }, `${p.heure}h`));
    }
  });
  return svg;
}

/**
 * Barres divergentes : effet de chaque facteur sur l'intensité.
 * À droite = aggrave, à gauche = soulage.
 */
export function barresImpact(impacts, maxLignes = 8) {
  const lignes = impacts.slice(0, maxLignes);
  const L = 720;
  const hauteurLigne = 30;
  const H = Math.max(80, lignes.length * hauteurLigne + 34);
  const svg = cadre(L, H, 'Effet estimé des facteurs sur la douleur');
  if (!lignes.length) {
    svg.appendChild(el('text', { x: L / 2, y: 40, 'text-anchor': 'middle', class: 'vide' },
      'Pas encore assez de jours avec et sans ces facteurs.'));
    return svg;
  }
  const centre = L * 0.52;
  const ampleur = Math.max(1.5, ...lignes.map((i) => Math.abs(i.delta)));
  const echelle = (L * 0.4) / ampleur;

  svg.appendChild(el('line', { x1: centre, x2: centre, y1: 6, y2: H - 22, class: 'axe-zero' }));

  lignes.forEach((imp, i) => {
    const y = 10 + i * hauteurLigne;
    const largeur = Math.abs(imp.delta) * echelle;
    const x = imp.delta >= 0 ? centre : centre - largeur;
    const rect = el('rect', {
      x, y, width: Math.max(2, largeur), height: hauteurLigne - 12, rx: 4,
      class: imp.delta >= 0 ? 'barre-aggrave' : 'barre-soulage',
      'fill-opacity': imp.confiance === 'elevee' ? 1 : imp.confiance === 'moyenne' ? 0.72 : 0.42,
    });
    rect.appendChild(el('title', {}, `${imp.tag} : ${imp.delta > 0 ? '+' : ''}${imp.delta} point ${imp.decalage ? 'le lendemain' : 'le jour même'} — ${imp.nExpos} jours avec / ${imp.nTemoins} sans, p ≈ ${imp.p}`));
    svg.appendChild(rect);

    const texteX = imp.delta >= 0 ? centre - 8 : centre + 8;
    svg.appendChild(el('text', {
      x: texteX, y: y + hauteurLigne / 2 - 2,
      'text-anchor': imp.delta >= 0 ? 'end' : 'start', class: 'etiquette-barre',
    }, imp.tag));
    svg.appendChild(el('text', {
      x: imp.delta >= 0 ? x + largeur + 6 : x - 6, y: y + hauteurLigne / 2 - 2,
      'text-anchor': imp.delta >= 0 ? 'start' : 'end', class: 'valeur-barre',
    }, `${imp.delta > 0 ? '+' : ''}${imp.delta}`));
  });

  svg.appendChild(el('text', { x: centre + 10, y: H - 6, class: 'axe' }, '→ aggrave'));
  svg.appendChild(el('text', { x: centre - 10, y: H - 6, 'text-anchor': 'end', class: 'axe' }, 'soulage ←'));
  return svg;
}

/** Anneau de répartition gauche / droite / les deux. */
export function anneauPieds(pieds) {
  const L = 260;
  const H = 200;
  const svg = cadre(L, H, 'Répartition par pied');
  const total = pieds.reduce((a, p) => a + p.nb, 0);
  if (!total) {
    svg.appendChild(el('text', { x: L / 2, y: H / 2, 'text-anchor': 'middle', class: 'vide' }, 'Aucune saisie.'));
    return svg;
  }
  const cx = 88;
  const cy = 96;
  const r = 66;
  const couleurs = { gauche: 'var(--pied-g)', droit: 'var(--pied-d)', 'les-deux': 'var(--pied-gd)', 'non-precise': 'var(--trait-faible)' };
  let angle = -Math.PI / 2;
  for (const p of pieds) {
    const part = p.nb / total;
    const fin = angle + part * Math.PI * 2;
    const grand = part > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(fin);
    const y2 = cy + r * Math.sin(fin);
    const chemin = el('path', {
      d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${grand} 1 ${x2},${y2} Z`,
      fill: couleurs[p.pied] || 'var(--trait-faible)',
    });
    chemin.appendChild(el('title', {}, `${p.pied} : ${p.nb} saisies (${Math.round(part * 100)} %), moyenne ${p.moyenne}/10`));
    svg.appendChild(chemin);
    angle = fin;
  }
  svg.appendChild(el('circle', { cx, cy, r: 34, class: 'anneau-trou' }));

  pieds.forEach((p, i) => {
    const y = 42 + i * 24;
    svg.appendChild(el('rect', { x: 170, y: y - 10, width: 12, height: 12, rx: 3, fill: couleurs[p.pied] || 'var(--trait-faible)' }));
    const nom = { gauche: 'Gauche', droit: 'Droit', 'les-deux': 'Les deux', 'non-precise': 'Non précisé' }[p.pied] || p.pied;
    svg.appendChild(el('text', { x: 188, y, class: 'legende' }, `${nom} ${Math.round((p.nb / total) * 100)} %`));
  });
  return svg;
}
