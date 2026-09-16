/**
 * Boîtes de dialogue intégrées à la page.
 *
 * On n'utilise pas window.confirm / window.prompt : ils sont bloqués dès que
 * l'application est affichée dans un cadre (page hébergée, application
 * embarquée), et ils ne peuvent pas être mis au thème de l'application.
 */

function fabriquer(titre) {
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';
  const forme = document.createElement('form');
  forme.method = 'dialog';
  const message = document.createElement('p');
  message.className = 'dialogue-message';
  message.textContent = titre;
  forme.appendChild(message);
  dialogue.appendChild(forme);
  return { dialogue, forme };
}

function ouvrir(dialogue, auRetour) {
  document.body.appendChild(dialogue);
  return new Promise((resoudre) => {
    dialogue.addEventListener('close', () => {
      const valeur = auRetour(dialogue.returnValue);
      dialogue.remove();
      resoudre(valeur);
    }, { once: true });
    dialogue.showModal();
  });
}

function boutons(forme, { valider, annuler, danger }) {
  const rangee = document.createElement('div');
  rangee.className = 'dialogue-actions';

  const bAnnuler = document.createElement('button');
  bAnnuler.type = 'submit';
  bAnnuler.value = 'annuler';
  bAnnuler.className = 'bouton discret';
  bAnnuler.textContent = annuler;

  const bValider = document.createElement('button');
  bValider.type = 'submit';
  bValider.value = 'valider';
  bValider.className = `bouton ${danger ? 'danger' : 'principal'}`;
  bValider.textContent = valider;

  rangee.appendChild(bAnnuler);
  rangee.appendChild(bValider);
  forme.appendChild(rangee);
  return bValider;
}

/** @returns {Promise<boolean>} */
export function demanderConfirmation(message, options = {}) {
  const { valider = 'Confirmer', annuler = 'Annuler', danger = false } = options;
  const { dialogue, forme } = fabriquer(message);
  const bValider = boutons(forme, { valider, annuler, danger });
  const promesse = ouvrir(dialogue, (retour) => retour === 'valider');
  requestAnimationFrame(() => bValider.focus());
  return promesse;
}

/** @returns {Promise<string|null>} null si l'utilisateur annule. */
export function demanderTexte(message, options = {}) {
  const { valider = 'Ajouter', annuler = 'Annuler', valeur = '', exemple = '' } = options;
  const { dialogue, forme } = fabriquer(message);

  const champ = document.createElement('input');
  champ.type = 'text';
  champ.className = 'dialogue-champ';
  champ.value = valeur;
  champ.placeholder = exemple;
  champ.setAttribute('aria-label', message);
  forme.insertBefore(champ, forme.firstChild.nextSibling);

  boutons(forme, { valider, annuler, danger: false });
  const promesse = ouvrir(dialogue, (retour) => (retour === 'valider' ? champ.value.trim() || null : null));
  requestAnimationFrame(() => champ.focus());
  return promesse;
}
