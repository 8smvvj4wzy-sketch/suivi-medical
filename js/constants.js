/**
 * Listes de suggestions et constantes partagées.
 * Tout est en français : l'application est destinée à un usage personnel
 * et à être montrée à un médecin / neurologue / podologue.
 */

export const APP_VERSION = '1.0.0';
export const STORAGE_KEY = 'suivi-douleur-nerveuse-v1';

/** Pieds possibles pour une douleur. */
export const PIEDS = [
  { id: 'gauche', label: 'Pied gauche', court: 'G' },
  { id: 'droit', label: 'Pied droit', court: 'D' },
  { id: 'les-deux', label: 'Les deux', court: 'G+D' },
];

/** Zones du pied (facultatif, utile pour orienter le diagnostic). */
export const ZONES = [
  'Orteils',
  'Avant-pied / plante',
  'Voûte plantaire',
  'Talon',
  'Cou-de-pied',
  'Cheville',
  'Remonte dans le mollet',
];

/** Qualificatifs typiques d'une douleur neuropathique. */
export const TYPES_DOULEUR = [
  'Brûlure',
  'Décharge électrique',
  'Picotements / fourmillements',
  'Engourdissement',
  'Étau / serrement',
  'Piqûres d’aiguilles',
  'Sensibilité au contact (allodynie)',
  'Froid douloureux',
];

/**
 * Catégories de facteurs analysés. Chaque catégorie devient une liste de
 * tags sur une saisie, et le moteur d'analyse cherche un lien avec la douleur.
 */
export const CATEGORIES = [
  {
    id: 'aliments',
    label: 'Aliments / boissons',
    icone: '🍽️',
    aide: 'Ce qui a été mangé ou bu depuis la dernière saisie.',
    suggestions: [
      'Gluten / blé', 'Produits laitiers', 'Sucre / pâtisserie', 'Sodas',
      'Alcool', 'Vin rouge', 'Bière', 'Café', 'Thé', 'Chocolat',
      'Agrumes', 'Tomate', 'Solanacées (aubergine, poivron)', 'Charcuterie',
      'Fromage affiné', 'Plat industriel', 'Épices fortes', 'Fritures',
      'Fruits de mer', 'Arachides / fruits à coque', 'Soja',
      'Édulcorants (aspartame…)', 'Repas très salé', 'Jeûne / repas sauté',
    ],
  },
  {
    id: 'activites',
    label: 'Activités',
    icone: '🚶',
    aide: 'Ce que le corps a fait avant la douleur.',
    suggestions: [
      'Marche prolongée', 'Station debout longue', 'Position assise longue',
      'Sport', 'Vélo', 'Course', 'Trajet en voiture', 'Escaliers',
      'Ménage / jardinage', 'Repos complet', 'Étirements', 'Massage du pied',
      'Bain chaud', 'Bain froid / glace', 'Pieds nus', 'Chaussures neuves',
      'Chaussures serrées', 'Talons', 'Semelles orthopédiques', 'Kiné',
    ],
  },
  {
    id: 'contexte',
    label: 'Contexte / état',
    icone: '🌡️',
    aide: 'Environnement, émotions, météo, cycle…',
    suggestions: [
      'Stress', 'Contrariété', 'Nuit courte', 'Réveils nocturnes',
      'Chaleur', 'Froid', 'Humidité', 'Changement de météo',
      'Règles', 'Déshydratation', 'Longue journée de travail',
      'Maladie / infection', 'Voyage', 'Jour de repos',
    ],
  },
  {
    id: 'traitements',
    label: 'Traitements pris',
    icone: '💊',
    aide: 'Médicaments, compléments, soins — pour voir ce qui soulage vraiment.',
    suggestions: [
      'Antalgique simple (paracétamol)', 'Anti-inflammatoire',
      'Gabapentine / prégabaline', 'Amitriptyline / duloxétine',
      'Crème capsaïcine', 'Patch lidocaïne', 'Vitamines B',
      'Magnésium', 'Acide alpha-lipoïque', 'Surélévation du pied',
      'Chaud local', 'Froid local', 'Compression / chaussette', 'Aucun',
    ],
  },
];

export const CATEGORIE_PAR_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/** Découpage de la journée utilisé pour le profil horaire. */
export const MOMENTS = [
  { id: 'nuit', label: 'Nuit (00 h – 06 h)', debut: 0, fin: 6 },
  { id: 'matin', label: 'Matin (06 h – 12 h)', debut: 6, fin: 12 },
  { id: 'apres-midi', label: 'Après-midi (12 h – 18 h)', debut: 12, fin: 18 },
  { id: 'soir', label: 'Soir (18 h – 00 h)', debut: 18, fin: 24 },
];

/** Paliers d'intensité, pour la couleur et le libellé. */
export function niveauIntensite(valeur) {
  if (valeur <= 2) return { id: 'faible', label: 'Très faible', couleur: 'var(--i1)' };
  if (valeur <= 4) return { id: 'legere', label: 'Légère', couleur: 'var(--i2)' };
  if (valeur <= 6) return { id: 'moderee', label: 'Modérée', couleur: 'var(--i3)' };
  if (valeur <= 8) return { id: 'forte', label: 'Forte', couleur: 'var(--i4)' };
  return { id: 'severe', label: 'Sévère', couleur: 'var(--i5)' };
}

/**
 * Éléments que l'on adopte *en réaction* à la douleur.
 * Un antalgique « associé » aux journées douloureuses ne les provoque pas :
 * on le prend parce qu'elles le sont. L'analyse doit le dire au lieu de
 * recommander d'arrêter le traitement.
 */
export const REACTIONS_A_LA_DOULEUR = new Set([
  'Repos complet', 'Massage du pied', 'Étirements', 'Bain chaud', 'Bain froid / glace',
  'Semelles orthopédiques', 'Kiné', 'Pieds nus',
]);

export function estReactionALaDouleur(tag, categorie) {
  return categorie === 'traitements' || REACTIONS_A_LA_DOULEUR.has(tag);
}

/** Seuils minimaux avant d'oser une hypothèse. */
export const SEUILS = {
  joursMinAnalyse: 7,
  saisiesMinAnalyse: 15,
  exposMin: 3,
  temoinsMin: 3,
  deltaNotable: 0.8,
  pFort: 0.05,
  pModere: 0.15,
  // Seuils appliqués après correction pour tests multiples (taux de fausses
  // découvertes) : plus tolérants que p, car q est déjà pénalisé.
  qFort: 0.10,
  qModere: 0.25,
};
