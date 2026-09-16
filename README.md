# Suivi des douleurs nerveuses du pied

Carnet de suivi pour des douleurs nerveuses (neuropathiques) du pied, avec analyse
automatique des tendances : intensité tout au long de la journée, fatigue, aliments,
activités et contexte, pied gauche ou droit — puis des **hypothèses** et des
**recommandations à tester**.

Application web autonome : aucune dépendance, aucun compte, aucun serveur.
Tout est stocké dans le navigateur, sur l'appareil, et fonctionne hors connexion.

> ⚠️ Ce n'est pas un dispositif médical. L'application ne pose aucun diagnostic.
> Elle met en évidence des *corrélations* pour orienter la discussion avec un
> professionnel de santé.

---

## Ce que l'application fait

**Noter (quelques secondes, plusieurs fois par jour)**
- intensité de 1 à 10, avec un curseur coloré et un libellé explicite ;
- pied gauche, pied droit ou les deux ;
- zone (orteils, plante, talon…) et type de sensation (brûlure, décharge, fourmillements…) ;
- fatigue du moment et qualité de la nuit précédente ;
- ce qui a été mangé, fait, ressenti, ou pris comme traitement — avec vos propres
  étiquettes si les suggestions ne suffisent pas ;
- une note libre.

**Journal** — toutes les saisies groupées par jour, avec moyenne et pic quotidiens,
modification et suppression, filtres par pied et par intensité.

**Analyse** — voir plus bas.

**Données** — export JSON (sauvegarde), export CSV (tableur), rapport imprimable
pour le médecin, import d'une sauvegarde, jeu de démonstration de 30 jours.

## Ce que l'analyse cherche

| Question | Méthode |
|---|---|
| La douleur s'aggrave-t-elle ? | Régression linéaire sur la moyenne quotidienne des 28 derniers jours |
| À quelle heure frappe-t-elle ? | Profil horaire sur 24 h + moyenne par moment de la journée |
| Un pied plus que l'autre ? | Répartition et intensité moyenne par côté |
| Quel élément déclenche ? | Jours **avec** l'élément vs jours **sans**, le jour même (J) et le lendemain (J+1) |
| Est-ce du hasard ? | Test de permutation bilatéral (2 000 tirages), puis correction de Benjamini-Hochberg |
| La fatigue joue-t-elle ? | Corrélation de Spearman fatigue/sommeil ↔ douleur, au niveau du jour |

Trois précautions sont intégrées, parce qu'elles décident de la qualité des conclusions :

1. **Décalage J+1.** Une réaction alimentaire se manifeste souvent le lendemain.
   Chaque facteur est testé aux deux décalages, et c'est le plus net qui est retenu.
2. **Tests multiples.** Tester 40 éléments fait ressortir des « coupables » par pur
   hasard. Les p-valeurs sont corrigées (colonne `q`) ; en dessous d'un certain
   niveau de confiance, rien n'est présenté comme une piste.
3. **Causalité inverse.** Un antalgique est associé aux journées douloureuses parce
   qu'on le prend *à cause* d'elles. L'application le signale explicitement au lieu
   de recommander de l'arrêter.

Chaque hypothèse est formulée au conditionnel, accompagnée de ses chiffres
(nombre de jours, moyennes comparées, p et q) et d'un protocole à essayer —
typiquement un test d'éviction de 14 jours suivi d'une réintroduction unique.

## Utilisation

Ouvrir `index.html` via un petit serveur (les modules ES sont bloqués en `file://`) :

```bash
npm start           # http://localhost:8080
```

Sur téléphone, l'application s'installe depuis le navigateur
(« Ajouter à l'écran d'accueil ») et fonctionne ensuite hors connexion.

Hébergement : n'importe quel hébergeur de fichiers statiques convient
(GitHub Pages, par exemple), il n'y a rien à compiler.

## Tests

```bash
npm test            # 28 tests, runner intégré de Node
```

Les tests couvrent les statistiques (moyennes, Spearman, test de permutation),
l'agrégation par jour, la détection d'un effet retardé, la correction des tests
multiples (un jeu de données purement aléatoire ne doit produire **aucune** piste),
la causalité inverse, et les imports/exports.

## Organisation du code

```
index.html          structure de l'application (4 onglets)
css/styles.css      thème clair et sombre, mobile d'abord
js/constants.js     listes de suggestions, seuils, catégories
js/analysis.js      moteur d'analyse — fonctions pures, testables hors navigateur
js/storage.js       localStorage, normalisation, import/export JSON et CSV
js/charts.js        graphiques SVG faits main (aucune dépendance)
js/demo.js          jeu de démonstration avec des liens connus à retrouver
js/app.js           interface : formulaire, journal, rendu de l'analyse, rapport
sw.js               service worker (fonctionnement hors ligne)
serveur.js          serveur statique de développement
test/               suite de tests
```

## Vie privée

Aucune donnée ne quitte l'appareil : pas de requête réseau, pas d'analytics,
pas de compte. Revers de la médaille — effacer les données du navigateur efface
le suivi. **Exportez une sauvegarde JSON régulièrement.**

## Quand consulter sans attendre

Perte de sensibilité qui progresse, faiblesse musculaire, plaie du pied qui ne
guérit pas, ou douleur qui devient brutalement beaucoup plus intense.
