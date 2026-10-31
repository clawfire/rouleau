/**
 * "Buy me a coffee" dialog, shown after a successful print (Bluetooth or ⌘P).
 * The checkbox opts out for good (`rouleau:coffee` in localStorage).
 */
import { COFFEE } from './about.js';
import { store } from '../store.js';

let dialog;
let optOut;

function build() {
  dialog = document.createElement('wa-dialog');
  dialog.setAttribute('label', 'Ton ticket est sorti !');
  dialog.innerHTML = `
    <div class="wa-stack wa-gap-m">
      <p>Rouleau est gratuit et le restera. Si ce ticket t’a servi ou fait sourire, tu peux m’offrir un café.</p>
      <wa-checkbox size="s">Je jure devant le dieu du café que je t’en ai déjà offert un</wa-checkbox>
    </div>
    <div slot="footer" class="wa-stack wa-gap-m" style="inline-size: 100%">
      <div class="wa-cluster wa-gap-s" style="justify-content: flex-end">
        <wa-button appearance="plain" data-dialog="close">Plus tard</wa-button>
        <wa-button variant="brand" appearance="accent" href="${COFFEE}" target="_blank" rel="noopener noreferrer">
          <wa-icon slot="start" name="mug-hot"></wa-icon>
          Offrir un café
        </wa-button>
      </div>
      <a href="#about">Découvre pourquoi j’ai fait cet outil, propose un module, et plus encore…</a>
    </div>`;
  optOut = dialog.querySelector('wa-checkbox');
  // Any way out (button, link, Esc, backdrop) saves the checkbox; links just close the dialog.
  dialog.addEventListener('click', (e) => e.target.closest('wa-button[href], a[href]') && (dialog.open = false));
  dialog.addEventListener('wa-after-hide', (e) => {
    if (e.target !== dialog) return;
    if (optOut.checked) store.set('coffee', { done: true });
  });
  document.body.append(dialog);
}

/** Offer a coffee, unless the user swore they already did. */
export function offerCoffee() {
  if (store.get('coffee', { done: false }).done) return;
  if (!dialog) build();
  if (dialog.open) return;
  optOut.checked = false;
  dialog.open = true;
}
