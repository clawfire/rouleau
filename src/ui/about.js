/**
 * "Et plus encore": not a module, nothing to print. Who made this and why, the macOS driver,
 * how to suggest a module, and what leaves the browser. Built with DOM calls, never innerHTML.
 */
export const REPO = 'https://github.com/clawfire/rouleau';
export const DRIVER = 'https://github.com/clawfire/phomemo-t02-macos';
export const AUTHOR = { name: 'Thibault Milan', url: 'https://thibaultmilan.com' };
export const SUGGEST = `${REPO}/issues/new?template=module-suggestion.yml`;

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : String(v));
  node.append(...children);
  return node;
};

const link = (href, label) => el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [label]);

function button(href, label, { icon, variant = 'neutral', appearance = 'outlined', family = 'brands' } = {}) {
  const b = el('wa-button', { href, target: '_blank', rel: 'noopener noreferrer', variant, appearance, size: 'm' }, [label]);
  if (icon) b.prepend(el('wa-icon', { slot: 'start', name: icon, family }));
  return b;
}

const section = (title, ...content) => el('section', { class: 'wa-stack wa-gap-s' }, [el('h2', { class: 'wa-heading-m' }, [title]), ...content]);

export function renderAbout(container) {
  container.replaceChildren(
    el('div', { class: 'wa-stack wa-gap-2xl about' }, [
      el('header', { class: 'wa-stack wa-gap-2xs' }, [
        el('h1', { class: 'wa-heading-l', id: 'about-title' }, ['Et plus encore']),
        el('p', { class: 'wa-body-m' }, [
          'Rouleau est un jouet : un prétexte pour faire parler ma Phomemo T02, une petite imprimante thermique. Du papier de 48 mm de large, 384 points par ligne, du noir ou du blanc, et rien entre les deux.',
        ]),
      ]),

      section(
        'Le driver macOS',
        el('p', {}, [
          'Pour que la T02 serve aussi depuis n’importe quelle appli du Mac (⌘P), j’ai écrit un driver macOS, avec l’aide de Claude. Rouleau imprime de deux façons : en Bluetooth direct depuis Chrome ou Edge, ou par ce driver.',
        ]),
        el('div', { class: 'wa-cluster wa-gap-s' }, [button(DRIVER, 'phomemo-t02-macos', { icon: 'github' })]),
      ),

      section(
        'Une idée de module ?',
        el('p', {}, [
          'Un ticket, un badge, un autocollant que tu aimerais imprimer ? Ouvre une issue sur GitHub : un petit formulaire t’aide à décrire l’idée (il faut un compte GitHub, et la suggestion est publique). Les modules à venir sont dans le menu, marqués « bientôt ».',
        ]),
        el('div', { class: 'wa-cluster wa-gap-s' }, [button(SUGGEST, 'Suggérer un module', { icon: 'lightbulb', family: 'solid', variant: 'brand', appearance: 'accent' })]),
      ),

      section(
        'Le code',
        el('p', {}, ['Rouleau est open source (MIT), sans compte et sans suivi. Il tourne entièrement dans ton navigateur.']),
        el('div', { class: 'wa-cluster wa-gap-s' }, [button(REPO, 'clawfire/rouleau', { icon: 'github' })]),
      ),

      section(
        'Ce qui sort de ton navigateur',
        el('ul', { class: 'wa-stack wa-gap-xs about-list' }, [
          el('li', {}, ['Il n’y a pas de serveur Rouleau. Tes réglages, ta clé Hevy, tes adresses d’agenda et tes photos restent dans ce navigateur.']),
          el('li', {}, ['La météo interroge ', link('https://open-meteo.com', 'Open-Meteo'), ' avec la ville saisie ou ta position.']),
          el('li', {}, ['Hevy et ton agenda passent par un relais de l’hébergeur (Netlify), faute de pouvoir être appelés directement depuis une page web.']),
          el('li', {}, ['Les polices et les icônes du thème sont chargées depuis des CDN (bunny.net et Font Awesome).']),
        ]),
      ),

      el('footer', { class: 'about-credit' }, ['Fait par ', link(AUTHOR.url, AUTHOR.name), '.']),
    ]),
  );
}
