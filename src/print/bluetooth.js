/**
 * Direct printing over Web Bluetooth (Chrome / Edge / Opera only).
 *
 * Same GATT layout and pacing as the macOS bridge:
 *   service 0xFF00 · write 0xFF02 · notify 0xFF03
 *   128-byte chunks, 20 ms apart.
 *
 * ⚠️ A BLE peripheral accepts one central at a time: if the macOS bridge is
 * holding the T02 (keepalive), the browser will not see it, and vice versa.
 */
import { buildJob } from './raster.js';

const SERVICE = 0xff00;
const WRITE = 0xff02;
const NOTIFY = 0xff03;
const QUERY_PAPER = Uint8Array.from([0x1f, 0x11, 0x11]);
const QUERY_BATTERY = Uint8Array.from([0x1f, 0x11, 0x08]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isBluetoothAvailable = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

/** One printer connection, reused between prints. */
export class T02Bluetooth extends EventTarget {
  device = null;
  writeChar = null;
  battery = null;
  paperOut = false;

  get connected() {
    return Boolean(this.device?.gatt?.connected && this.writeChar);
  }

  /** Must be called from a user gesture (click). */
  async connect() {
    if (!isBluetoothAvailable()) throw new Error('Web Bluetooth indisponible dans ce navigateur');
    if (!this.device) {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'T02' }, { services: [SERVICE] }],
        optionalServices: [SERVICE],
      });
      this.device.addEventListener('gattserverdisconnected', () => {
        this.writeChar = null;
        this.dispatchEvent(new Event('disconnected'));
      });
    }
    if (!this.device.gatt.connected) await this.device.gatt.connect();
    const service = await this.device.gatt.getPrimaryService(SERVICE);
    this.writeChar = await service.getCharacteristic(WRITE);
    try {
      const notify = await service.getCharacteristic(NOTIFY);
      notify.addEventListener('characteristicvaluechanged', (e) => this.#onNotify(e.target.value));
      await notify.startNotifications();
    } catch {
      // Status notifications are a nice-to-have.
    }
    this.dispatchEvent(new Event('connected'));
    return this;
  }

  #onNotify(view) {
    const frame = new Uint8Array(view.buffer);
    if (frame[0] !== 0x1a || frame.length < 3) return;
    if (frame[1] === 0x06) this.paperOut = frame[2] === 0x88;
    if (frame[1] === 0x04) this.battery = { 0xa4: 0, 0xa3: 3, 0xa2: 5, 0xa1: 10 }[frame[2]] ?? frame[2];
    this.dispatchEvent(new CustomEvent('status', { detail: { battery: this.battery, paperOut: this.paperOut } }));
  }

  async #write(bytes) {
    if (this.writeChar.writeValueWithoutResponse) await this.writeChar.writeValueWithoutResponse(bytes);
    else await this.writeChar.writeValue(bytes);
  }

  /**
   * Print a Bitmap.
   * @param {import('../engine/bitmap.js').Bitmap} bitmap
   * @param {{ density?: number, extraFeed?: number, onProgress?: (ratio: number) => void }} [o]
   */
  async print(bitmap, { density = 2, extraFeed = 0, onProgress } = {}) {
    if (!this.connected) await this.connect();
    this.paperOut = false;
    for (const q of [QUERY_PAPER, QUERY_BATTERY]) {
      await this.#write(q);
      await sleep(250);
    }
    if (this.paperOut) throw new Error('Plus de papier dans la T02');

    const job = buildJob(bitmap, { density, extraFeed });
    const CHUNK = 128;
    for (let off = 0; off < job.length; off += CHUNK) {
      await this.#write(job.subarray(off, off + CHUNK));
      await sleep(20);
      onProgress?.(Math.min(1, (off + CHUNK) / job.length));
      if (this.paperOut) throw new Error("Plus de papier pendant l'impression");
    }
  }

  disconnect() {
    this.device?.gatt?.disconnect();
  }
}
