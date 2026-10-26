/**
 * Outputs that go through the OS instead of Bluetooth.
 *  - downloadPNG: 1-bit PNG → `t02 print ticket.png` or drag into any app
 *  - systemPrint: ⌘P → "Phomemo T02" queue of the macOS driver
 *    (its "Ticket 48 mm" paper size trims the blank space automatically)
 */
import { MAX_PAGE_MM, mmToDots } from '../engine/constants.js';
import { paginate } from '../engine/paginate.js';

export async function downloadPNG(bitmap, filename = 'rouleau.png') {
  const blob = await bitmap.toPNGBlob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Print through the system dialog at exact physical size (48 mm wide).
 * Tickets longer than the driver's 297 mm page are split at block
 * boundaries into several pages, printed back to back.
 */
export async function systemPrint(bitmap) {
  const pages = paginate(bitmap, mmToDots(MAX_PAGE_MM));
  const urls = await Promise.all(pages.map(async (p) => URL.createObjectURL(await p.toPNGBlob())));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset-inline-start:-9999px;inline-size:0;block-size:0;border:0';
  frame.srcdoc = `<!doctype html><html><head><style>
    @page { size: 48mm ${MAX_PAGE_MM}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .page { width: 48mm; height: ${MAX_PAGE_MM}mm; overflow: hidden; break-after: page; }
    .page:last-child { break-after: auto; }
    img { display: block; width: 48mm; height: auto; image-rendering: pixelated; }
  </style></head><body>${urls.map((u) => `<div class="page"><img src="${u}" alt=""></div>`).join('')}</body></html>`;
  document.body.append(frame);
  await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  await Promise.all(
    [...frame.contentDocument.images].map((img) =>
      img.complete ? null : new Promise((r) => img.addEventListener('load', r, { once: true })),
    ),
  );
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => {
    frame.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
  }, 60_000);
}
