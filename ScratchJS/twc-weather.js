/* TWC Weather — standalone JavaScript (no main.pjs / index.html needed)
 *
 * Endpoints covered with:
 *   apikey = e1f10a1e78da46f5b10a1e78da96f525
 *   format = json
 *   units  = e   ("metric=e" = English units: F, mph, inHg, miles)
 *
 * Verified 2026-10-08 with this exact key:
 *   ✅ Current  — GET https://api.weather.com/v3/wx/observations/current
 *   ✅ Daily    — GET https://api.weather.com/v3/wx/forecast/daily/{3,5,7}day
 *   ✅ Air Quality — GET https://api.weather.com/v3/wx/globalAirQuality (needs scale=EPA)
 *   ❌ Hourly  — v3/wx/forecast/hourly/* returns 401 "apikey is not authorized for this product"
 *      → use calcHourly() / getHourlyCalc() below (synthesizes 48h from Current+Daily)
 *   ❌ Alerts  — v3/wx/alerts/headlines returns 401 with this key (kept, needs enabled key)
 *
 * New in this version:
 *   - calcHourlyFromData(currentData, dailyData, {hours})  pure calc, no fetch
 *   - getHourlyCalc(lat, lon)  fetch Current+Daily then calc 48h hourly
 *   - randomUSLocation() / randomLocation()  random coords
 *   - getRandomUSWeather() / getRandomWeather()  random place + live weather
 *
 * Usage (plain <script>, no modules, no perchance lists):
 *   <script src="src/twc-weather.js"></script>
 *   <script>
 *     const cur = await TWCWeather.getCurrent(40.71, -74.00);
 *     const calc = await TWCWeather.getHourlyCalc(40.71, -74.00); // works with this key
 *     const rnd = await TWCWeather.getRandomUSWeather();          // random US city + weather
 *   </script>
 *
 * Every fetch fn returns { ok:true, status, data } or { ok:false, status, error, raw }.
 * Pure helpers (random*, calcHourlyFromData) are synchronous and never throw on HTTP.
 */

(function (global) {
  "use strict";

  const TWC_API_KEY = "e1f10a1e78da46f5b10a1e78da96f525";
  const TWC_FORMAT = "json";
  const TWC_UNITS = "e"; // e = English (°F/mph), m = metric, h = hybrid
  const TWC_LANGUAGE = "en-US";
  const TWC_AQ_SCALE = "EPA"; // required by globalAirQuality, else 400 "field 'scale' is required"

  const BASE = "https://api.weather.com";

  function qs(params) {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
      .join("&");
  }

  function geocode(lat, lon) {
    return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok || (typeof text === "string" && text.includes("apikey is not authorized"))) {
      return { ok: false, status: res.status, error: data ?? text ?? `HTTP ${res.status}`, raw: String(text).slice(0, 500) };
    }
    return { ok: true, status: res.status, data: data ?? text };
  }

  function opts(o = {}) {
    return {
      apiKey: o.apiKey || TWC_API_KEY,
      units: o.units || TWC_UNITS,
      language: o.language || TWC_LANGUAGE,
    };
  }

  // ---- 1. Current Weather ----
  async function getCurrent(lat, lon, o) {
    const { apiKey, units, language } = opts(o);
    const url = `${BASE}/v3/wx/observations/current?` + qs({
      geocode: geocode(lat, lon), format: TWC_FORMAT, units, language, apiKey,
    });
    return fetchJson(url);
  }

  // ---- 2a. Hourly Weather (live API — 401 with bundled key) ----
  async function getHourly(lat, lon, o = {}) {
    const { apiKey, units, language } = opts(o);
    const hours = o.hours === 24 ? 24 : 48;
    const url = `${BASE}/v3/wx/forecast/hourly/${hours}hour?` + qs({
      geocode: geocode(lat, lon), format: TWC_FORMAT, units, language, apiKey,
    });
    const r = await fetchJson(url);
    if (!r.ok && String(r.error).includes("not authorized")) {
      r.error = `Hourly needs a key with hourly product enabled (this key returns 401). Use getHourlyCalc() instead, or override: getHourly(lat,lon,{apiKey:"YOUR_KEY"})`;
    }
    return r;
  }

  // ---- 2b. CALC Hourly (works with this key — no hourly product needed) ----
  // Synthesizes hour-by-hour temp via diurnal cosine curve (min ~5am, max ~3pm)
  // anchored on each calendar day's min/max, and carries that half-day's
  // phrase / precip / humidity / wind / uv from the daily daypart table.
  // currentData = (await getCurrent()).data, dailyData = (await getDaily()).data
  function calcHourlyFromData(currentData, dailyData, o = {}) {
    const hours = Math.max(1, Math.min(120, o.hours || 48));
    if (!dailyData || !Array.isArray(dailyData.dayOfWeek)) {
      return { ok: false, error: "calcHourlyFromData needs dailyData from getDaily().data" };
    }
    const dp = (dailyData.daypart && dailyData.daypart[0]) || {};
    const n = dailyData.dayOfWeek.length;
    const tMax = dailyData.calendarDayTemperatureMax || dailyData.temperatureMax || [];
    const tMin = dailyData.calendarDayTemperatureMin || dailyData.temperatureMin || [];

    // daypart index for calendar day d + day/night flag.
    // TWC daypart: [null, Tonight, Tomorrow, TomorrowNight, ...] — no "Today" slot,
    // so day 0 daytime falls back to index 2 (Tomorrow = best available daytime est).
    function dpIndex(dayIdx, isDay) {
      if (dayIdx <= 0) return isDay ? 2 : 1;
      return isDay ? dayIdx * 2 : dayIdx * 2 + 1;
    }
    function dpVal(name, idx, fallback = null) {
      const arr = dp[name];
      if (!Array.isArray(arr)) return fallback;
      const v = arr[idx];
      return (v === null || v === undefined) ? fallback : v;
    }

    const start = new Date();
    start.setMinutes(0, 0, 0);
    const out = [];
    for (let h = 0; h < hours; h++) {
      const t = new Date(start.getTime() + h * 3600e3);
      const dayIdx = Math.min(Math.floor(h / 24), n - 1);
      const hod = t.getHours();
      const isDay = hod >= 6 && hod < 18;
      const mx = tMax[dayIdx] ?? tMax[dayIdx + 1] ?? currentData?.temperature ?? 70;
      const mn = tMin[dayIdx] ?? currentData?.temperature ?? 60;
      const mean = (mx + mn) / 2, amp = (mx - mn) / 2;
      const temperature = Math.round(mean + amp * Math.cos((2 * Math.PI * (hod - 15)) / 24));
      const di = Math.min(dpIndex(dayIdx, isDay), (dp.daypartName || []).length - 1);
      out.push({
        hourOffset: h,
        validTimeLocal: t.toISOString(),
        dayOfWeek: dailyData.dayOfWeek[dayIdx],
        dayOrNight: isDay ? "D" : "N",
        temperature,
        temperatureFeelsLike: temperature, // approx (no heat-index model here)
        relativeHumidity: dpVal("relativeHumidity", di, currentData?.relativeHumidity ?? null),
        precipChance: dpVal("precipChance", di, 0),
        wxPhraseLong: dpVal("wxPhraseLong", di, dailyData.narrative?.[dayIdx] ?? ""),
        wxPhraseShort: dpVal("wxPhraseShort", di, ""),
        windSpeed: dpVal("windSpeed", di, currentData?.windSpeed ?? null),
        windDirectionCardinal: dpVal("windDirectionCardinal", di, currentData?.windDirectionCardinal ?? null),
        uvIndex: isDay ? dpVal("uvIndex", di, 0) : 0,
        uvDescription: dpVal("uvDescription", di, isDay ? "" : "Low"),
        narrative: dpVal("narrative", di, dailyData.narrative?.[dayIdx] ?? ""),
      });
    }
    return { ok: true, calc: true, status: 200, data: out };
  }

  // One-call calc hourly: fetches Current + Daily (both work with this key) then calcs.
  async function getHourlyCalc(lat, lon, o = {}) {
    const [cur, daily] = await Promise.all([getCurrent(lat, lon, o), getDaily(lat, lon, o)]);
    if (!cur.ok) return { ok: false, status: cur.status, error: "getHourlyCalc: current failed: " + cur.error };
    if (!daily.ok) return { ok: false, status: daily.status, error: "getHourlyCalc: daily failed: " + daily.error };
    const r = calcHourlyFromData(cur.data, daily.data, o);
    r.location = { lat: Number(lat), lon: Number(lon) };
    return r;
  }

  // ---- 3. Daily Weather ----
  async function getDaily(lat, lon, o = {}) {
    const { apiKey, units, language } = opts(o);
    const days = [3, 5, 7].includes(o.days) ? o.days : 5;
    const url = `${BASE}/v3/wx/forecast/daily/${days}day?` + qs({
      geocode: geocode(lat, lon), format: TWC_FORMAT, units, language, apiKey,
    });
    return fetchJson(url);
  }

  // ---- 4. Alerts (401 with bundled key — kept for keys that have it) ----
  async function getAlerts(lat, lon, o) {
    const { apiKey, language } = opts(o);
    const url = `${BASE}/v3/wx/alerts/headlines?` + qs({
      geocode: geocode(lat, lon), format: TWC_FORMAT, language, apiKey,
    });
    const r = await fetchJson(url);
    if (!r.ok && String(r.error).includes("not authorized")) {
      r.error = `Alerts need a key with alerts product enabled (this key returns 401). Override: getAlerts(lat,lon,{apiKey:"YOUR_KEY"})`;
    }
    return r;
  }

  async function getAlertDetail(alertId, o) {
    const { apiKey, language } = opts(o);
    const url = `${BASE}/v3/wx/alerts/detail?` + qs({
      alertId, format: TWC_FORMAT, language, apiKey,
    });
    return fetchJson(url);
  }

  // ---- 5. Air Quality ----
  async function getAirQuality(lat, lon, o = {}) {
    const { apiKey, language } = opts(o);
    const scale = o.scale || TWC_AQ_SCALE;
    const url = `${BASE}/v3/wx/globalAirQuality?` + qs({
      geocode: geocode(lat, lon), scale, format: TWC_FORMAT, language, apiKey,
    });
    return fetchJson(url);
  }

  async function searchLocation(query, o) {
    const { apiKey, language } = opts(o);
    const url = `${BASE}/v3/location/search?` + qs({
      query, locationType: "city", format: TWC_FORMAT, language, apiKey,
    });
    const r = await fetchJson(url);
    if (!r.ok) return r;
    const L = r.data.location || r.data;
    const out = (L.latitude || []).map((lat, i) => ({
      address: L.address?.[i], city: L.city?.[i], country: L.country?.[i],
      lat, lon: L.longitude?.[i], placeId: L.placeId?.[i],
    }));
    return { ok: true, status: r.status, data: out };
  }

  async function getAll(lat, lon, o = {}) {
    const [current, hourly, daily, alerts, airQuality] = await Promise.all([
      getCurrent(lat, lon, o),
      getHourly(lat, lon, o),
      getDaily(lat, lon, o),
      getAlerts(lat, lon, o),
      getAirQuality(lat, lon, o),
    ]);
    return { current, hourly, daily, alerts, airQuality };
  }

  // ---- 6. Random Location ----
  const US_CITIES = [
    ["New York", "NY", 40.71, -74.0], ["Los Angeles", "CA", 34.05, -118.24],
    ["Chicago", "IL", 41.88, -87.63], ["Houston", "TX", 29.76, -95.37],
    ["Phoenix", "AZ", 33.45, -112.07], ["Miami", "FL", 25.76, -80.19],
    ["Seattle", "WA", 47.61, -122.33], ["Denver", "CO", 39.74, -104.99],
    ["Boston", "MA", 42.36, -71.06], ["Atlanta", "GA", 33.75, -84.39],
    ["Dallas", "TX", 32.78, -96.8], ["San Francisco", "CA", 37.77, -122.42],
    ["Las Vegas", "NV", 36.17, -115.14], ["Minneapolis", "MN", 44.98, -93.27],
    ["New Orleans", "LA", 29.95, -90.07], ["Anchorage", "AK", 61.22, -149.9],
    ["Honolulu", "HI", 21.31, -157.86], ["Nashville", "TN", 36.16, -86.78],
    ["Portland", "OR", 45.52, -122.68], ["Kansas City", "MO", 39.1, -94.58],
  ];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // Random US city (+ small jitter so repeated calls don't repeat exact coords)
  function randomUSLocation(o = {}) {
    const c = pick(US_CITIES);
    const j = o.jitter ?? 0.25;
    const lat = +(c[2] + (Math.random() * 2 - 1) * j).toFixed(2);
    const lon = +(c[3] + (Math.random() * 2 - 1) * j).toFixed(2);
    return { city: c[0], state: c[1], lat, lon };
  }

  // Random world coords (lat -55..70 avoids poles/open ocean extremes)
  function randomLocation() {
    return {
      lat: +((Math.random() * 125 - 55).toFixed(2)),
      lon: +((Math.random() * 360 - 180).toFixed(2)),
    };
  }

  // ---- 7. Random US Weather (live: current + daily + air + CALC hourly) ----
  async function getRandomUSWeather(o = {}) {
    const location = o.location || randomUSLocation(o);
    const [current, daily, airQuality, alerts] = await Promise.all([
      getCurrent(location.lat, location.lon, o),
      getDaily(location.lat, location.lon, o),
      getAirQuality(location.lat, location.lon, o),
      o.includeAlerts ? getAlerts(location.lat, location.lon, o) : Promise.resolve({ ok: false, status: 0, error: "skipped (includeAlerts not set; bundled key is 401 for alerts anyway)" }),
    ]);
    const hourlyCalc = (current.ok && daily.ok)
      ? calcHourlyFromData(current.data, daily.data, o)
      : { ok: false, error: "calc skipped: current/daily fetch failed" };
    return { location, current, daily, hourlyCalc, alerts, airQuality };
  }

  // Random world weather (same shape, coords have no city name)
  async function getRandomWeather(o = {}) {
    const location = o.location || randomLocation();
    const [current, daily, airQuality] = await Promise.all([
      getCurrent(location.lat, location.lon, o),
      getDaily(location.lat, location.lon, o),
      getAirQuality(location.lat, location.lon, o),
    ]);
    const hourlyCalc = (current.ok && daily.ok)
      ? calcHourlyFromData(current.data, daily.data, o)
      : { ok: false, error: "calc skipped: current/daily fetch failed" };
    return { location, current, daily, hourlyCalc, airQuality };
  }

  const TWCWeather = {
    API_KEY: TWC_API_KEY, FORMAT: TWC_FORMAT, UNITS: TWC_UNITS,
    LANGUAGE: TWC_LANGUAGE, AQ_SCALE: TWC_AQ_SCALE, US_CITIES,
    getCurrent, getHourly, getHourlyCalc, calcHourlyFromData,
    getDaily, getAlerts, getAlertDetail, getAirQuality,
    searchLocation, getAll, geocode,
    randomUSLocation, randomLocation, getRandomUSWeather, getRandomWeather,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TWCWeather;
  global.TWCWeather = TWCWeather;
  if (typeof globalThis !== "undefined") globalThis.TWCWeather = TWCWeather;

})(typeof window !== "undefined" ? window : globalThis);
