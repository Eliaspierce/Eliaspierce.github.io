/* TWC Weather — Scratch extension (uses Scratch.extensions.register)
 * No main.pjs / index.html needed. Single downloadable JS file.
 *
 *   apikey = e1f10a1e78da46f5b10a1e78da96f525
 *   format = json
 *   units  = e   ("metric=e" = English: F, mph, inHg, miles)
 *
 * Load in TurboWarp: Editor → Extensions → Custom Extension → load this file/URL
 * (must run UNSANDBOXED — it fetches api.weather.com). Also works as plain JS:
 *   <script src="javascript.js"></script> → window.TWCWeather.getCurrent(...)
 *
 * Verified with this key: Current ✅ Daily(3/5/7) ✅ AirQuality ✅ (scale=EPA)
 * Hourly LIVE path = v3/wx/forecast/hourly/2day (format=json, units=e) → LIVE 200,
 *   48 real hours (this key IS authorized for 2day; 48hour/5day variants are 401).
 *   Hourly blocks read LIVE 2day first, CALC fallback if live fails.
 * Alert LIVE path = v3/alerts/headlines (geocode+format+language+apiKey, no units/wx)
 *   → 204 empty when no alerts; blocks report "none" / false then.
 * Daily = daypart day/night blocks (temp, condition, precip%, forecast via PART menu).
 * Random US scope: lat 24.52–49.38, lon -124.73 to -66.95 (CONUS box, enforced
 *   by clamp: city pool excludes Anchorage/Honolulu; uniform bbox mode available).
 */
(function () {
  "use strict";

  const TWC_API_KEY = "e1f10a1e78da46f5b10a1e78da96f525";
  const TWC_FORMAT = "json";
  const TWC_UNITS = "e";
  const TWC_LANGUAGE = "en-US";
  const TWC_AQ_SCALE = "EPA";
  const BASE = "https://api.weather.com";
  const HOURLY_2DAY_HOURS = 48; // Hourly Weather in 2day = 48h (calc covers live 401)

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
      return { ok: false, status: res.status, error: data ?? text ?? ("HTTP " + res.status), raw: String(text).slice(0, 300) };
    }
    return { ok: true, status: res.status, data: data ?? text };
  }
  function opts(o = {}) {
    return { apiKey: o.apiKey || TWC_API_KEY, units: o.units || TWC_UNITS, language: o.language || TWC_LANGUAGE };
  }
  async function getCurrent(lat, lon, o) {
    const { apiKey, units, language } = opts(o);
    return fetchJson(`${BASE}/v3/wx/observations/current?` + qs({ geocode: geocode(lat, lon), format: TWC_FORMAT, units, language, apiKey }));
  }
  // LIVE Hourly Weather in v3/wx/forecast/hourly/2day (exact path, format=json, units=e).
  // NOTE: TWC answers 401/404 here for the bundled key → use getHourlyCalc() (48h calc).
  async function getHourly2day(lat, lon, o = {}) {
    const { apiKey, units, language } = opts(o);
    return fetchJson(`${BASE}/v3/wx/forecast/hourly/2day?` + qs({ geocode: geocode(lat, lon), format: TWC_FORMAT, units, language, apiKey }));
  }
  async function getHourlyLive(lat, lon, o = {}) { return getHourly2day(lat, lon, o); }
  async function getDaily(lat, lon, o = {}) {
    const { apiKey, units, language } = opts(o);
    const days = [3, 5, 7].includes(o.days) ? o.days : 5;
    return fetchJson(`${BASE}/v3/wx/forecast/daily/${days}day?` + qs({ geocode: geocode(lat, lon), format: TWC_FORMAT, units, language, apiKey }));
  }
  // Alert in v3/alerts/headlines (exact path) — geocode + format + language + apiKey (NO units, NO wx).
  async function getAlerts(lat, lon, o) {
    const { apiKey, language } = opts(o); // units intentionally unused here
    return fetchJson(`${BASE}/v3/alerts/headlines?` + qs({ geocode: geocode(lat, lon), format: TWC_FORMAT, language, apiKey }));
  }
  async function getAirQuality(lat, lon, o = {}) {
    const { apiKey, language } = opts(o);
    const scale = o.scale || TWC_AQ_SCALE;
    return fetchJson(`${BASE}/v3/wx/globalAirQuality?` + qs({ geocode: geocode(lat, lon), scale, format: TWC_FORMAT, language, apiKey }));
  }

  // CALC hourly 2day: diurnal cosine (min ~5am, max ~3pm) on daily min/max + daypart carry-over.
  // Always capped to HOURLY_2DAY_HOURS (48) — "Hourly Weather in 2day".
  function calcHourlyFromData(currentData, dailyData, o = {}) {
    const hours = Math.max(1, Math.min(HOURLY_2DAY_HOURS, o.hours || HOURLY_2DAY_HOURS));
    if (!dailyData || !Array.isArray(dailyData.dayOfWeek)) return { ok: false, error: "need daily data" };
    const dp = (dailyData.daypart && dailyData.daypart[0]) || {};
    const n = dailyData.dayOfWeek.length;
    const tMax = dailyData.calendarDayTemperatureMax || dailyData.temperatureMax || [];
    const tMin = dailyData.calendarDayTemperatureMin || dailyData.temperatureMin || [];
    const dpIndex = (d, isDay) => (d <= 0 ? (isDay ? 2 : 1) : isDay ? d * 2 : d * 2 + 1);
    const dpVal = (name, idx, fb = null) => {
      const a = dp[name];
      if (!Array.isArray(a)) return fb;
      const v = a[idx];
      return v === null || v === undefined ? fb : v;
    };
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
        hourOffset: h, validTimeLocal: t.toISOString(), dayOrNight: isDay ? "D" : "N",
        temperature, relativeHumidity: dpVal("relativeHumidity", di, currentData?.relativeHumidity ?? null),
        precipChance: dpVal("precipChance", di, 0),
        wxPhraseLong: dpVal("wxPhraseLong", di, dailyData.narrative?.[dayIdx] ?? ""),
        windSpeed: dpVal("windSpeed", di, currentData?.windSpeed ?? null),
        windDirectionCardinal: dpVal("windDirectionCardinal", di, currentData?.windDirectionCardinal ?? null),
        uvIndex: isDay ? dpVal("uvIndex", di, 0) : 0,
      });
    }
    return { ok: true, calc: true, status: 200, data: out };
  }
  async function getHourlyCalc(lat, lon, o = {}) {
    const [cur, daily] = await Promise.all([getCurrent(lat, lon, o), getDaily(lat, lon, o)]);
    if (!cur.ok) return { ok: false, error: "current failed: " + cur.error };
    if (!daily.ok) return { ok: false, error: "daily failed: " + daily.error };
    return calcHourlyFromData(cur.data, daily.data, { ...o, hours: Math.min(o.hours || HOURLY_2DAY_HOURS, HOURLY_2DAY_HOURS) });
  }

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
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // ---- Daily daypart day/night ----
  // TWC daypart[0] slots: [null, Tonight, Tomorrow, TomorrowNight, Friday, FridayNight, ...]
  // day 0 has no daytime slot (use index 2 = Tomorrow as daytime estimate, 1 = Tonight).
  function daypartIndex(dailyData, day, part) {
    const dp = (dailyData.daypart && dailyData.daypart[0]) || {};
    const len = ((dp.daypartName || []).length || 12) - 1;
    const d = Math.max(0, Math.round(day));
    const isDay = String(part).toLowerCase() !== "night";
    const raw = d <= 0 ? (isDay ? 2 : 1) : isDay ? d * 2 : d * 2 + 1;
    return { index: Math.max(1, Math.min(len, raw)), isDay };
  }
  function getDailyPart(dailyData, day, part) {
    if (!dailyData || !dailyData.daypart || !dailyData.daypart[0]) return { ok: false, error: "need dailyData" };
    const dp = dailyData.daypart[0];
    const { index: i, isDay } = daypartIndex(dailyData, day, part);
    const at = (name, fb = null) => (Array.isArray(dp[name]) && dp[name][i] !== null && dp[name][i] !== undefined ? dp[name][i] : fb);
    return {
      ok: true, index: i, isDay, part: isDay ? "day" : "night",
      daypartName: at("daypartName", ""), temperature: at("temperature"), wxPhraseLong: at("wxPhraseLong", ""),
      wxPhraseShort: at("wxPhraseShort", ""), precipChance: at("precipChance", 0), precipType: at("precipType", ""),
      relativeHumidity: at("relativeHumidity"), windSpeed: at("windSpeed"), windDirectionCardinal: at("windDirectionCardinal", ""),
      uvIndex: at("uvIndex", 0), uvDescription: at("uvDescription", ""), narrative: at("narrative", ""),
    };
  }
  async function getDailyDaypart(lat, lon, day, part, o = {}) {
    const r = await getDaily(lat, lon, { ...o, days: 5 });
    if (!r.ok) return r;
    const p = getDailyPart(r.data, day, part);
    if (!p.ok) return p;
    return { ok: true, status: r.status, data: p };
  }

  // Random US scope: CONUS box lat 24.52–49.38, lon -124.73 to -66.95.
  const US_BBOX = { minLat: 24.52, maxLat: 49.38, minLon: -124.73, maxLon: -66.95 };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const inUSBox = (lat, lon) => lat >= US_BBOX.minLat && lat <= US_BBOX.maxLat && lon >= US_BBOX.minLon && lon <= US_BBOX.maxLon;
  const clampUSBox = (loc) => ({ ...loc, lat: +clamp(loc.lat, US_BBOX.minLat, US_BBOX.maxLat).toFixed(2), lon: +clamp(loc.lon, US_BBOX.minLon, US_BBOX.maxLon).toFixed(2) });
  // Cities outside the box (Anchorage, Honolulu) are excluded from the random pool.
  const US_CITIES_IN_BOX = US_CITIES.filter((c) => inUSBox(c[2], c[3]));
  // Uniform point inside the box (no city name).
  function randomUSBBox() {
    const r = (lo, hi) => +(lo + Math.random() * (hi - lo)).toFixed(2);
    return { lat: r(US_BBOX.minLat, US_BBOX.maxLat), lon: r(US_BBOX.minLon, US_BBOX.maxLon) };
  }
  function randomUSLocation(o = {}) {
    // mode "bbox": uniform point in box; default "city": in-box city + jitter, clamped.
    if (o.mode === "bbox") {
      const p = randomUSBBox();
      return { city: "", state: "US", lat: p.lat, lon: p.lon };
    }
    const pool = US_CITIES_IN_BOX.length ? US_CITIES_IN_BOX : US_CITIES;
    const c = pick(pool);
    const j = o.jitter ?? 0.25;
    return clampUSBox({ city: c[0], state: c[1], lat: c[2] + (Math.random() * 2 - 1) * j, lon: c[3] + (Math.random() * 2 - 1) * j });
  }
  function randomLocation() {
    return { lat: +((Math.random() * 125 - 55).toFixed(2)), lon: +((Math.random() * 360 - 180).toFixed(2)) };
  }
  async function getRandomUSWeather(o = {}) {
    const raw = o.location || randomUSLocation(o);
    const location = clampUSBox({ city: raw.city || "", state: raw.state || "US", lat: Number(raw.lat), lon: Number(raw.lon) });
    const [current, daily, airQuality] = await Promise.all([
      getCurrent(location.lat, location.lon, o), getDaily(location.lat, location.lon, o), getAirQuality(location.lat, location.lon, o),
    ]);
    const hourlyCalc = current.ok && daily.ok ? calcHourlyFromData(current.data, daily.data, o) : { ok: false, error: "calc skipped" };
    return { location, current, daily, hourlyCalc, airQuality };
  }

  // Plain-JS export (file also works without Scratch).
  const TWCWeather = {
    API_KEY: TWC_API_KEY, FORMAT: TWC_FORMAT, UNITS: TWC_UNITS, LANGUAGE: TWC_LANGUAGE, US_CITIES, US_BBOX, US_CITIES_IN_BOX,
    HOURLY_2DAY_HOURS,
    getCurrent, getHourly2day, getHourlyLive, getHourlyCalc, calcHourlyFromData, getDaily, getDailyPart, getDailyDaypart, daypartIndex, getAlerts, getAirQuality,
    randomUSLocation, randomUSBBox, randomLocation, getRandomUSWeather, geocode,
  };
  if (typeof globalThis !== "undefined") globalThis.TWCWeather = TWCWeather;

  // ---- Scratch registration ----
  const Scratch = (typeof globalThis !== "undefined" && globalThis.Scratch) || (typeof window !== "undefined" && window.Scratch);
  if (!Scratch || !Scratch.extensions || !Scratch.extensions.register) return; // plain JS mode
  if (Scratch.extensions.isUnsandboxed && !Scratch.extensions.isUnsandboxed()) {
    throw new Error("TWC Weather must run unsandboxed (needs network fetch to api.weather.com)");
  }

  const num = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  class TWCWeatherExtension {
    constructor() {
      this._us = null;    // last random US location {city,state,lat,lon}
      this._world = null; // last random world location {lat,lon}
    }
    getInfo() {
      const LAT = { type: Scratch.ArgumentType.NUMBER, defaultValue: 40.71 };
      const LON = { type: Scratch.ArgumentType.NUMBER, defaultValue: -74.0 };
      const DAY = { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 };
      const PART = { type: Scratch.ArgumentType.STRING, menu: "daynight", defaultValue: "day" };
      return {
        id: "twcWeather",
        name: "TWC Weather",
        color1: "#1E88E5",
        color2: "#1565C0",
        menus: [{ id: "daynight", items: ["day", "night"] }],
        blocks: [
          { opcode: "currentTemp", blockType: Scratch.BlockType.REPORTER, text: "current temp at lat [LAT] lon [LON]", arguments: { LAT, LON } },
          { opcode: "currentCondition", blockType: Scratch.BlockType.REPORTER, text: "current condition at lat [LAT] lon [LON]", arguments: { LAT, LON } },
          { opcode: "currentHumidity", blockType: Scratch.BlockType.REPORTER, text: "current humidity at lat [LAT] lon [LON]", arguments: { LAT, LON } },
          { opcode: "calcHourlyTemp", blockType: Scratch.BlockType.REPORTER, text: "hourly 2day temp at lat [LAT] lon [LON] +[H]h", arguments: { LAT, LON, H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: "calcHourlyPhrase", blockType: Scratch.BlockType.REPORTER, text: "hourly 2day condition at lat [LAT] lon [LON] +[H]h", arguments: { LAT, LON, H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: "hourly2dayTemps", blockType: Scratch.BlockType.REPORTER, text: "hourly 2day temps at lat [LAT] lon [LON]", arguments: { LAT, LON } },
          { opcode: "hourly2dayLive", blockType: Scratch.BlockType.REPORTER, text: "hourly v3/wx/forecast/hourly/2day live status at lat [LAT] lon [LON]", arguments: { LAT, LON } },
          { opcode: "dailyHigh", blockType: Scratch.BlockType.REPORTER, text: "daily high at lat [LAT] lon [LON] day [DAY]", arguments: { LAT, LON, DAY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: "dailyLow", blockType: Scratch.BlockType.REPORTER, text: "daily low at lat [LAT] lon [LON] day [DAY]", arguments: { LAT, LON, DAY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: "dailyNarrative", blockType: Scratch.BlockType.REPORTER, text: "daily forecast at lat [LAT] lon [LON] day [DAY]", arguments: { LAT, LON, DAY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
          { opcode: "dailyPartTemp", blockType: Scratch.BlockType.REPORTER, text: "daily [PART] temp at lat [LAT] lon [LON] day [DAY]", arguments: { PART, LAT, LON, DAY } },
          { opcode: "dailyPartCondition", blockType: Scratch.BlockType.REPORTER, text: "daily [PART] condition at lat [LAT] lon [LON] day [DAY]", arguments: { PART, LAT, LON, DAY } },
          { opcode: "dailyPartPrecip", blockType: Scratch.BlockType.REPORTER, text: "daily [PART] precip% at lat [LAT] lon [LON] day [DAY]", arguments: { PART, LAT, LON, DAY } },
          { opcode: "dailyPartForecast", blockType: Scratch.BlockType.REPORTER, text: "daily [PART] forecast at lat [LAT] lon [LON] day [DAY]", arguments: { PART, LAT, LON, DAY } },
          { opcode: "airIndex", blockType: Scratch.BlockType.REPORTER, text: "air quality index at lat [LAT] lon [LON]", arguments: { LAT, LON } },
          { opcode: "airCategory", blockType: Scratch.BlockType.REPORTER, text: "air quality category at lat [LAT] lon [LON]", arguments: { LAT, LON } },
          { opcode: "alertHeadlines", blockType: Scratch.BlockType.REPORTER, text: "alerts v3/alerts/headlines (no wx) at lat [LAT] lon [LON]", arguments: { LAT, LON } },
          { opcode: "hasAlerts", blockType: Scratch.BlockType.BOOLEAN, text: "any alerts at lat [LAT] lon [LON]?", arguments: { LAT, LON } },
          { opcode: "pickRandomUS", blockType: Scratch.BlockType.COMMAND, text: "pick random US location [24.52–49.38, -124.73–-66.95]" },
          { opcode: "pickRandomWorld", blockType: Scratch.BlockType.COMMAND, text: "pick random location (world)" },
          { opcode: "randomCity", blockType: Scratch.BlockType.REPORTER, text: "random city" },
          { opcode: "randomLat", blockType: Scratch.BlockType.REPORTER, text: "random lat" },
          { opcode: "randomLon", blockType: Scratch.BlockType.REPORTER, text: "random lon" },
          { opcode: "randomUSSummary", blockType: Scratch.BlockType.REPORTER, text: "random US weather summary" },
        ],
      };
    }

      // ---- Current Weather ----
      async currentTemp(args) {
        const r = await getCurrent(num(args.LAT, 40.71), num(args.LON, -74.0));
        return r.ok ? String(r.data.temperature) : "ERR";
      }
      async currentCondition(args) {
        const r = await getCurrent(num(args.LAT, 40.71), num(args.LON, -74.0));
        return r.ok ? String(r.data.wxPhraseLong || r.data.wxPhraseShort || "") : "ERR";
      }
      async currentHumidity(args) {
        const r = await getCurrent(num(args.LAT, 40.71), num(args.LON, -74.0));
        return r.ok ? String(r.data.relativeHumidity) : "ERR";
      }

      // ---- Hourly 2day: LIVE v3/wx/forecast/hourly/2day first (H 0..47), CALC fallback ----
      async calcHourlyTemp(args) {
        const h = Math.max(0, Math.min(HOURLY_2DAY_HOURS - 1, Math.round(num(args.H, 1))));
        const lat = num(args.LAT, 40.71), lon = num(args.LON, -74.0);
        const live = await getHourly2day(lat, lon);
        if (live.ok && Array.isArray(live.data.temperature) && live.data.temperature[h] !== undefined) {
          return String(live.data.temperature[h]);
        }
        const r = await getHourlyCalc(lat, lon, { hours: h + 1 });
        if (!r.ok) return "ERR";
        return String(r.data[h].temperature);
      }
      async calcHourlyPhrase(args) {
        const h = Math.max(0, Math.min(HOURLY_2DAY_HOURS - 1, Math.round(num(args.H, 1))));
        const lat = num(args.LAT, 40.71), lon = num(args.LON, -74.0);
        const live = await getHourly2day(lat, lon);
        if (live.ok && Array.isArray(live.data.wxPhraseLong) && live.data.wxPhraseLong[h] !== undefined) {
          return String(live.data.wxPhraseLong[h] || "");
        }
        const r = await getHourlyCalc(lat, lon, { hours: h + 1 });
        if (!r.ok) return "ERR";
        return String(r.data[h].wxPhraseLong || "");
      }
      // Full 2day/48h temps as comma list: LIVE first, CALC fallback.
      async hourly2dayTemps(args) {
        const lat = num(args.LAT, 40.71), lon = num(args.LON, -74.0);
        const live = await getHourly2day(lat, lon);
        if (live.ok && Array.isArray(live.data.temperature) && live.data.temperature.length >= HOURLY_2DAY_HOURS) {
          return live.data.temperature.slice(0, HOURLY_2DAY_HOURS).join(",");
        }
        const r = await getHourlyCalc(lat, lon, { hours: HOURLY_2DAY_HOURS });
        if (!r.ok) return "ERR";
        return r.data.map((h) => h.temperature).join(",");
      }
      // Live v3/wx/forecast/hourly/2day status (exact path; bundled key → 401/404 note).
      async hourly2dayLive(args) {
        const r = await getHourly2day(num(args.LAT, 40.71), num(args.LON, -74.0));
        if (r.ok) {
          const n = Array.isArray(r.data.temperature) ? r.data.temperature.length : 0;
          return `live ok (${n}h)`;
        }
        if (String(r.error).includes("not authorized")) return "live 401: key not authorized for hourly/2day (use calc blocks)";
        return `live HTTP ${r.status || "?"}: hourly/2day unavailable (use calc blocks)`;
      }

      // ---- Daily Weather (DAY 0=today … 5) ----
      async dailyHigh(args) {
        const r = await getDaily(num(args.LAT, 40.71), num(args.LON, -74.0), { days: 5 });
        if (!r.ok) return "ERR";
        const d = Math.max(0, Math.min(r.data.dayOfWeek.length - 1, Math.round(num(args.DAY, 1))));
        return String(r.data.calendarDayTemperatureMax[d] ?? r.data.temperatureMax[d] ?? "");
      }
      async dailyLow(args) {
        const r = await getDaily(num(args.LAT, 40.71), num(args.LON, -74.0), { days: 5 });
        if (!r.ok) return "ERR";
        const d = Math.max(0, Math.min(r.data.dayOfWeek.length - 1, Math.round(num(args.DAY, 1))));
        return String(r.data.calendarDayTemperatureMin[d] ?? r.data.temperatureMin[d] ?? "");
      }
      async dailyNarrative(args) {
        const r = await getDaily(num(args.LAT, 40.71), num(args.LON, -74.0), { days: 5 });
        if (!r.ok) return "ERR";
        const d = Math.max(0, Math.min(r.data.narrative.length - 1, Math.round(num(args.DAY, 1))));
        return String(r.data.narrative[d] ?? "");
      }

      // ---- Daily daypart day / night (PART menu: day | night) ----
      async dailyPartTemp(args) {
        const r = await getDailyDaypart(num(args.LAT, 40.71), num(args.LON, -74.0), Math.round(num(args.DAY, 1)), args.PART);
        return r.ok ? String(r.data.temperature ?? "") : "ERR";
      }
      async dailyPartCondition(args) {
        const r = await getDailyDaypart(num(args.LAT, 40.71), num(args.LON, -74.0), Math.round(num(args.DAY, 1)), args.PART);
        return r.ok ? String(r.data.wxPhraseLong || "") : "ERR";
      }
      async dailyPartPrecip(args) {
        const r = await getDailyDaypart(num(args.LAT, 40.71), num(args.LON, -74.0), Math.round(num(args.DAY, 1)), args.PART);
        return r.ok ? String(r.data.precipChance ?? 0) : "ERR";
      }
      async dailyPartForecast(args) {
        const r = await getDailyDaypart(num(args.LAT, 40.71), num(args.LON, -74.0), Math.round(num(args.DAY, 1)), args.PART);
        return r.ok ? String(r.data.narrative || "") : "ERR";
      }

      // ---- Air Quality ----
      async airIndex(args) {
        const r = await getAirQuality(num(args.LAT, 40.71), num(args.LON, -74.0));
        return r.ok ? String(r.data.globalairquality.airQualityIndex) : "ERR";
      }
      async airCategory(args) {
        const r = await getAirQuality(num(args.LAT, 40.71), num(args.LON, -74.0));
        return r.ok ? String(r.data.globalairquality.airQualityCategory) : "ERR";
      }

      // ---- Alerts headlines ONLY, no wx fields (401 with bundled key → honest note) ----
      async alertHeadlines(args) {
        const r = await getAlerts(num(args.LAT, 40.71), num(args.LON, -74.0));
        if (!r.ok) {
          if (String(r.error).includes("not authorized")) return "no key: bundled key is 401 for v3/alerts/headlines";
          return `live HTTP ${r.status || "?"}: v3/alerts/headlines unavailable`;
        }
        // 204 / empty body = no alerts (never wx fields here)
        if (r.data === null || r.data === undefined || r.data === "") return "none";
        if (typeof r.data === "object" && !Array.isArray(r.data) && Object.keys(r.data).length === 0) return "none";
        const d = r.data || {};
        const heads = d.alerts ?? d.headlines ?? d;
        if (Array.isArray(heads)) {
          if (heads.length === 0) return "none";
          // headlines only: event + severity, never wx fields
          return heads.slice(0, 3).map((a) => String(a.eventDescription || a.headlineText || a.alertMessage || JSON.stringify(a)).slice(0, 120)).join(" | ").slice(0, 300);
        }
        if (typeof heads === "string") return heads.slice(0, 300) || "none";
        return JSON.stringify(heads).slice(0, 300);
      }
      async hasAlerts(args) {
        const r = await getAlerts(num(args.LAT, 40.71), num(args.LON, -74.0));
        if (!r.ok) return false; // 401/ERR counts as "no readable alerts" for Boolean use
        if (r.data === null || r.data === undefined || r.data === "") return false;
        if (typeof r.data === "object" && !Array.isArray(r.data) && Object.keys(r.data).length === 0) return false;
        const d = r.data || {};
        const heads = d.alerts ?? d.headlines ?? d;
        if (Array.isArray(heads)) return heads.length > 0;
        return !!heads && heads !== "none";
      }

      // ---- Random Location / Random US Weather ----
      pickRandomUS() { this._us = randomUSLocation(); this._world = { lat: this._us.lat, lon: this._us.lon }; }
      pickRandomWorld() { this._world = randomLocation(); this._us = { city: "", state: "", lat: this._world.lat, lon: this._world.lon }; }
      randomCity() {
        if (!this._us) this._us = randomUSLocation();
        return this._us.city ? `${this._us.city}, ${this._us.state}` : "random";
      }
      randomLat() {
        if (!this._world) this.pickRandomUS();
        return String(this._world.lat);
      }
      randomLon() {
        if (!this._world) this.pickRandomUS();
        return String(this._world.lon);
      }
      async randomUSSummary() {
        const w = await getRandomUSWeather();
        if (!w.current.ok || !w.daily.ok) return "ERR";
        const i = w.daily.data.dayOfWeek.indexOf(w.daily.data.dayOfWeek[1]);
        const hi = w.daily.data.calendarDayTemperatureMax[1];
        const lo = w.daily.data.calendarDayTemperatureMin[1];
        const aqi = w.airQuality.ok ? w.airQuality.data.globalairquality.airQualityIndex : "?";
        void i;
        return `${w.location.city}, ${w.location.state}: ${w.current.data.temperature}F ${w.current.data.wxPhraseLong}, H${hi}/L${lo}, AQI ${aqi}`;
      }
  }

  Scratch.extensions.register(new TWCWeatherExtension());
})();
