/**
 * Outputs that go through the OS instead of Bluetooth.
 *  - downloadPNG: 1-bit PNG → `t02 print ticket.png` or drag into any app
 *  - systemPrint: ⌘P → "Phomemo T02" queue of the macOS driver
 *    (its "Ticket 48 mm" paper size trims the blank space automatically)
 */
import { dotsToMm } from '../engine/constants.js';

export async function downloadPNG(bitmap, filename = 'rouleau.png') {
  const blob = await bitmap.toPNGBlob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Print through the system dialog, at exact physical size (48 mm wide). */
export async function systemPrint(bitmap) {
  const blob = await bitmap.toPNGBlob();
  const url = URL.createObjectURL(blob);
  const heightMm = dotsToMm(bitmap.height).toFixed(2);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset-inline-start:-9999px;inline-size:0;block-size:0;border:0';
  frame.srcdoc = `<!doctype html><html><head><style>
    @page { size: 48mm ${heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: 48mm; height: ${heightMm}mm; image-rendering: pixelated; }
  </style></head><body><img src="${url}" alt=""></body></html>`;
  document.body.append(frame);
  await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  const img = frame.contentDocument.querySelector('img');
  if (!img.complete) await new Promise((r) => img.addEventListener('load', r, { once: true }));
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}
