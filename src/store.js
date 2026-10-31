/** Per-user settings in localStorage, one JSON object per key (`rouleau:<key>`). */
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`rouleau:${key}`);
      return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
    } catch {
      return { ...fallback };
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`rouleau:${key}`, JSON.stringify(value));
    } catch {
      // Private mode or storage disabled: settings just won't persist.
    }
  },
};
