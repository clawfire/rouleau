/**
 * Weather from Open-Meteo (https://open-meteo.com, free, no API key, CORS enabled).
 * The position comes from the browser (Geolocation API), or from a city name
 * resolved with Open-Meteo's geocoding when the user typed one.
 */
export class WeatherError extends Error {}

const GEO_KEY = 'rouleau:geo';

/** Browser position, remembered between sessions so the prompt is not repeated. */
export async function browserPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(GEO_KEY) ?? 'null');
    if (saved && Date.now() - saved.at < 6 * 3600e3) return saved;
  } catch {
    // Ignore a corrupted cache.
  }
  if (!('geolocation' in navigator)) throw new WeatherError('Géolocalisation indisponible : saisis une ville.');
  const pos = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, maximumAge: 3600e3 }),
  ).catch(() => {
    throw new WeatherError('Position refusée ou introuvable : autorise-la dans le navigateur, ou saisis une ville.');
  });
  const here = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now() };
  try {
    localStorage.setItem(GEO_KEY, JSON.stringify(here));
  } catch {
    // Storage disabled: ask again next time.
  }
  return here;
}

async function json(url, what) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new WeatherError(`${what} injoignable.`);
  }
  if (!res.ok) throw new WeatherError(`${what} a répondu ${res.status}.`);
  return res.json();
}

const places = new Map();

/** "Luxembourg" → { lat, lon, name } */
export async function geocode(city) {
  const key = city.trim().toLowerCase();
  if (!places.has(key)) {
    const res = await json(
      `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city.trim(), count: 1, language: 'fr' })}`,
      'La recherche de ville',
    );
    const hit = res.results?.[0];
    places.set(key, hit ? { lat: hit.latitude, lon: hit.longitude, name: hit.name } : null);
  }
  const place = places.get(key);
  if (!place) throw new WeatherError(`Ville introuvable : ${city}.`);
  return place;
}

const forecasts = new Map();

/**
 * Today's forecast.
 * @returns {{ code, tMax, tMin, tNow, rain, wind, sunrise, sunset, hours: {h, t}[] }}
 */
export async function forecast({ lat, lon }) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = forecasts.get(key);
  if (cached && Date.now() - cached.at < 10 * 60e3) return cached.data;
  const res = await json(
    `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
      latitude: lat,
      longitude: lon,
      current: 'temperature_2m',
      hourly: 'temperature_2m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
      timezone: 'auto',
      forecast_days: 1,
    })}`,
    'Open-Meteo',
  );
  const d = res.daily;
  const hourAt = (h) => ({ h, t: Math.round(res.hourly.temperature_2m[h]) });
  const data = {
    code: d.weather_code[0],
    tMax: Math.round(d.temperature_2m_max[0]),
    tMin: Math.round(d.temperature_2m_min[0]),
    tNow: Math.round(res.current.temperature_2m),
    rain: d.precipitation_probability_max[0],
    wind: Math.round(d.wind_speed_10m_max[0]),
    sunrise: d.sunrise[0].slice(11, 16),
    sunset: d.sunset[0].slice(11, 16),
    hours: [9, 14, 19].map(hourAt),
  };
  forecasts.set(key, { at: Date.now(), data });
  return data;
}

/** WMO weather code → drawing kind + French label. */
export function describe(code) {
  if (code === 0) return { kind: 'sun', label: 'Ciel dégagé' };
  if (code <= 2) return { kind: 'partly', label: 'Éclaircies' };
  if (code === 3) return { kind: 'cloud', label: 'Couvert' };
  if (code <= 48) return { kind: 'fog', label: 'Brouillard' };
  if (code <= 57) return { kind: 'rain', label: 'Bruine' };
  if (code <= 67) return { kind: 'rain', label: 'Pluie' };
  if (code <= 77) return { kind: 'snow', label: 'Neige' };
  if (code <= 82) return { kind: 'rain', label: 'Averses' };
  if (code <= 86) return { kind: 'snow', label: 'Averses de neige' };
  return { kind: 'storm', label: 'Orage' };
}
