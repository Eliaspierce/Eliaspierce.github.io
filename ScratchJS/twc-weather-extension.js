// TWC Weather — Scratch / TurboWarp unsandboxed extension
// File: twc-weather-extension.js
// No build step. Load it in TurboWarp: Custom Extensions -> Load from file / URL.
//
// Covers with apiKey=e1f10a1e78da46f5b10a1e78da96f525, format=json, units=e (imperial):
//   - Current Weather      : v3/wx/observations/current
//   - Hourly Weather       : v3/wx/forecast/hourly/2day  (48 hours, index 0-47)
//   - Daily Weather        : v3/wx/forecast/daily/5day   (index 0-5)
//   - Daily daypart day/night : same daily payload -> daypart[0] (Day / Night per day)
//   - Alerts               : v3/alerts/headlines
//   - Air Quality          : v3/wx/globalAirQuality?scale=EPA
//   - Random World Location: lat -90..90, lon -180..180
//   - Random US Weather    : lat 24.52..49.38, lon -124.73..-66.95
//
// Usage in Scratch (after loading):
//   current [temperature] at lat [40.71] lon [-74.00], etc. — all reporters take lat/lon.

(function (Scratch) {
  'use strict';

  if (!Scratch || !Scratch.extensions || !Scratch.extensions.register) {
    throw new Error('TWC Weather: Scratch.extensions.register not found. Load as an unsandboxed extension in TurboWarp.');
  }
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('TWC Weather extension must run unsandboxed (TurboWarp custom extension).');
  }

  const DEFAULT_API_KEY = 'e1f10a1e78da46f5b10a1e78da96f525';
  const BASE = 'https://api.weather.com';
  const UNITS = 'e'; // metric=e means English/imperial: F, mph, inHg, miles
  const LANG = 'en-US';

  // ---- tiny cache (60s) to avoid hammering the API when many blocks poll ----
  const cache = new Map(); // url -> {t, data}
  const CACHE_MS = 60 * 1000;

  async function fetchJson(url) {
    const now = Date.now();
    const hit = cache.get(url);
    if (hit && now - hit.t < CACHE_MS) return hit.data;
    const res = await fetch(url);
    if (res.status === 204) {
      cache.set(url, { t: now, data: null });
      return null;
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + txt.slice(0, 200));
    }
    const data = await res.json();
    cache.set(url, { t: now, data });
    return data;
  }

  function num(v, digits) {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    if (digits === undefined) return n;
    return Number(n.toFixed(digits));
  }
  function str(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }
  function clampInt(v, lo, hi, fallback) {
    let n = parseInt(v, 10);
    if (!Number.isFinite(n)) n = fallback;
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return n;
  }
  function randIn(lo, hi, digits) {
    const v = lo + Math.random() * (hi - lo);
    return Number(v.toFixed(digits === undefined ? 4 : digits));
  }

  class TWCWeather {
    constructor() {
      this.apiKey = DEFAULT_API_KEY;
      // last random picks (so lat+lon pairs stay together if user wants)
      this.lastWorld = { lat: 40.71, lon: -74.0 };
      this.lastUS = { lat: 40.71, lon: -74.0 };
    }

    getInfo() {
      return {
        id: 'twcweather',
        name: 'TWC Weather',
        color1: '#1E88E5',
        color2: '#1565C0',
        color3: '#0D47A1',
        menus: {
          currentField: {
            acceptReporters: true,
            items: [
              { text: 'temperature °F', value: 'temperature' },
              { text: 'feels like °F', value: 'feelsLike' },
              { text: 'condition', value: 'phrase' },
              { text: 'humidity %', value: 'humidity' },
              { text: 'dew point °F', value: 'dewPoint' },
              { text: 'heat index °F', value: 'heatIndex' },
              { text: 'wind chill °F', value: 'windChill' },
              { text: 'wind speed mph', value: 'windSpeed' },
              { text: 'wind gust mph', value: 'windGust' },
              { text: 'wind direction', value: 'windDir' },
              { text: 'wind degrees', value: 'windDeg' },
              { text: 'pressure inHg', value: 'pressure' },
              { text: 'visibility mi', value: 'visibility' },
              { text: 'cloud cover %', value: 'cloudCover' },
              { text: 'uv index', value: 'uvIndex' },
              { text: 'uv description', value: 'uvDesc' },
              { text: 'day or night', value: 'dayOrNight' },
              { text: 'sunrise time', value: 'sunrise' },
              { text: 'sunset time', value: 'sunset' },
              { text: 'icon code', value: 'iconCode' }
            ]
          },
          hourlyField: {
            acceptReporters: true,
            items: [
              { text: 'temperature °F', value: 'temperature' },
              { text: 'feels like °F', value: 'feelsLike' },
              { text: 'condition', value: 'phrase' },
              { text: 'humidity %', value: 'humidity' },
              { text: 'precip chance %', value: 'precipChance' },
              { text: 'precip type', value: 'precipType' },
              { text: 'wind speed mph', value: 'windSpeed' },
              { text: 'wind direction', value: 'windDir' },
              { text: 'uv index', value: 'uvIndex' },
              { text: 'uv description', value: 'uvDesc' },
              { text: 'cloud cover %', value: 'cloudCover' },
              { text: 'day or night', value: 'dayOrNight' },
              { text: 'local time', value: 'timeLocal' }
            ]
          },
          dailyField: {
            acceptReporters: true,
            items: [
              { text: 'high °F', value: 'high' },
              { text: 'low °F', value: 'low' },
              { text: 'narrative', value: 'narrative' },
              { text: 'sunrise time', value: 'sunrise' },
              { text: 'sunset time', value: 'sunset' },
              { text: 'moon phase', value: 'moonPhase' },
              { text: 'rain amount in', value: 'qpfRain' }
            ]
          },
          daypartField: {
            acceptReporters: true,
            items: [
              { text: 'temperature °F', value: 'temperature' },
              { text: 'condition', value: 'phrase' },
              { text: 'narrative', value: 'narrative' },
              { text: 'precip chance %', value: 'precipChance' },
              { text: 'precip type', value: 'precipType' },
              { text: 'humidity %', value: 'humidity' },
              { text: 'wind speed mph', value: 'windSpeed' },
              { text: 'wind direction', value: 'windDir' },
              { text: 'wind phrase', value: 'windPhrase' },
              { text: 'uv index', value: 'uvIndex' },
              { text: 'uv description', value: 'uvDesc' },
              { text: 'cloud cover %', value: 'cloudCover' },
              { text: 'daypart name', value: 'daypartName' },
              { text: 'thunder', value: 'thunder' },
              { text: 'qualifier', value: 'qualifier' }
            ]
          },
          dayNight: {
            acceptReporters: true,
            items: [
              { text: 'Day', value: 'D' },
              { text: 'Night', value: 'N' }
            ]
          },
          alertField: {
            acceptReporters: true,
            items: [
              { text: 'event', value: 'event' },
              { text: 'headline', value: 'headline' },
              { text: 'severity', value: 'severity' },
              { text: 'urgency', value: 'urgency' },
              { text: 'certainty', value: 'certainty' },
              { text: 'office', value: 'office' },
              { text: 'area', value: 'area' },
              { text: 'onset', value: 'onset' },
              { text: 'expires', value: 'expires' },
              { text: 'summary', value: 'summary' }
            ]
          },
          aqField: {
            acceptReporters: true,
            items: [
              { text: 'AQI', value: 'aqi' },
              { text: 'category', value: 'category' },
              { text: 'main pollutant', value: 'pollutant' },
              { text: 'PM2.5 µg/m³', value: 'pm25' },
              { text: 'PM10 µg/m³', value: 'pm10' },
              { text: 'O3 µg/m³', value: 'o3' },
              { text: 'NO2 µg/m³', value: 'no2' },
              { text: 'CO µg/m³', value: 'co' },
              { text: 'SO2 µg/m³', value: 'so2' },
              { text: 'advice', value: 'advice' }
            ]
          }
        },
        blocks: [
          {
            opcode: 'setApiKey',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set TWC api key to [KEY]',
            arguments: {
              KEY: { type: Scratch.ArgumentType.STRING, defaultValue: DEFAULT_API_KEY }
            }
          },
          // ---- Current ----
          {
            opcode: 'current',
            blockType: Scratch.BlockType.REPORTER,
            text: 'current [FIELD] at lat [LAT] lon [LON]',
            arguments: {
              FIELD: { type: Scratch.ArgumentType.STRING, menu: 'currentField', defaultValue: 'temperature' },
              LAT: { type: Scratch.ArgumentType.STRING, defaultValue: '40.71' },
              LON: { type: Scratch.ArgumentType.STRING, defaultValue: '-74.00' }
            }
          },
          // ---- Hourly (2day = 48h) ----
          {
            opcode: 'hourly',
            blockType: Scratch.BlockType.REPORTER,
            text: 'hourly [FIELD] +[H] hrs at lat [LAT] lon [LON]',
            arguments: {
              FIELD: { type: Scratch.ArgumentType.STRING, menu: 'hourlyField', defaultValue: 'temperature' },
              H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              LAT: { type: Scratch.ArgumentType.STRING, defaultValue: '40.71' },
              LON: { type: Scratch.ArgumentType.STRING, defaultValue: '-74.00' }
            }
          },
          {
            opcode: 'hourlyTime',
            blockType: Scratch.BlockType.REPORTER,
            text: 'hourly time +[H] hrs at lat [LAT] lon [LON]',
            arguments: {
              H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              LAT: { type: Scratch.ArgumentType.STRING, defaultValue: '40.71' },
              LON: { type: Scratch.ArgumentType.STRING, defaultValue: '-74.00' }
            }
          },
          // ---- Daily + daypart ----
          {
            opcode: 'daily',
            blockType: Scratch.BlockType.REPORTER,
            text: 'daily [FIELD] +[D] days at lat [LAT] lon [LON]',
            arguments: {
              FIELD: { type: Scratch.ArgumentType.STRING, menu: 'dailyField', defaultValue: 'high' },
              D: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              LAT: { type: Scratch.ArgumentType.STRING, defaultValue: '40.71' },
              LON: { type: Scratch.ArgumentType.STRING, defaultValue: '-74.00' }
            }
          },
          {
            opcode: 'daypart',
            blockType: Scratch.BlockType.REPORTER,
            text: 'daypart [FIELD] [DN] +[D] days at lat [LAT] lon [LON]',
            arguments: {
              FIELD: { type: Scratch.ArgumentType.STRING, menu: 'daypartField', defaultValue: 'temperature' },
              DN: { type: Scratch.ArgumentType.STRING, menu: 'dayNight', defaultValue: 'D' },
              D: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              LAT: { type: Scratch.ArgumentType.STRING, defaultValue: '40.71' },
              LON: { type: Scratch.ArgumentType.STRING, defaultValue: '-74.00' }
            }
          },
          // ---- Alerts ----
          {
            opcode: 'alertCount',
            blockType: Scratch.BlockType.REPORTER,
            text: 'alert count at lat [LAT] lon [LON]',
            arguments: {
              LAT: { type: Scratch.ArgumentType.STRING, defaultValue: '40.71' },
              LON: { type: Scratch.ArgumentType.STRING, defaultValue: '-74.00' }
            }
          },
          {
            opcode: 'alertField',
            blockType: Scratch.BlockType.REPORTER,
            text: 'alert #[N] [FIELD] at lat [LAT] lon [LON]',
            arguments: {
              N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              FIELD: { type: Scratch.ArgumentType.STRING, menu: 'alertField', defaultValue: 'headline' },
              LAT: { type: Scratch.ArgumentType.STRING, defaultValue: '40.71' },
              LON: { type: Scratch.ArgumentType.STRING, defaultValue: '-74.00' }
            }
          },
          // ---- Air quality ----
          {
            opcode: 'airQuality',
            blockType: Scratch.BlockType.REPORTER,
            text: 'air quality [FIELD] at lat [LAT] lon [LON]',
            arguments: {
              FIELD: { type: Scratch.ArgumentType.STRING, menu: 'aqField', defaultValue: 'aqi' },
              LAT: { type: Scratch.ArgumentType.STRING, defaultValue: '40.71' },
              LON: { type: Scratch.ArgumentType.STRING, defaultValue: '-74.00' }
            }
          },
          // ---- Random locations ----
          {
            opcode: 'randomWorldLat',
            blockType: Scratch.BlockType.REPORTER,
            text: 'random world latitude'
          },
          {
            opcode: 'randomWorldLon',
            blockType: Scratch.BlockType.REPORTER,
            text: 'random world longitude'
          },
          {
            opcode: 'randomUSLat',
            blockType: Scratch.BlockType.REPORTER,
            text: 'random US latitude (24.52 to 49.38)'
          },
          {
            opcode: 'randomUSLon',
            blockType: Scratch.BlockType.REPORTER,
            text: 'random US longitude (-124.73 to -66.95)'
          },
          {
            opcode: 'randomWorldCurrent',
            blockType: Scratch.BlockType.REPORTER,
            text: 'random world current [FIELD]',
            arguments: {
              FIELD: { type: Scratch.ArgumentType.STRING, menu: 'currentField', defaultValue: 'temperature' }
            }
          },
          {
            opcode: 'randomUSCurrent',
            blockType: Scratch.BlockType.REPORTER,
            text: 'random US current [FIELD]',
            arguments: {
              FIELD: { type: Scratch.ArgumentType.STRING, menu: 'currentField', defaultValue: 'temperature' }
            }
          },
          {
            opcode: 'randomWorldPlace',
            blockType: Scratch.BlockType.REPORTER,
            text: 'random world location lat,lon'
          },
          {
            opcode: 'randomUSPlace',
            blockType: Scratch.BlockType.REPORTER,
            text: 'random US location lat,lon'
          }
        ]
      };
    }

    // ============ internals ============
    _key() {
      return (this.apiKey && String(this.apiKey).trim()) || DEFAULT_API_KEY;
    }
    setApiKey(args) {
      if (args && args.KEY) this.apiKey = String(args.KEY).trim();
    }

    _geo(args) {
      const lat = parseFloat(args.LAT);
      const lon = parseFloat(args.LON);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('bad lat/lon');
      return { lat, lon };
    }

    async _getCurrent(lat, lon) {
      const url = `${BASE}/v3/wx/observations/current?geocode=${lat},${lon}&format=json&units=${UNITS}&language=${LANG}&apiKey=${this._key()}`;
      return fetchJson(url);
    }
    async _getHourly(lat, lon) {
      const url = `${BASE}/v3/wx/forecast/hourly/2day?geocode=${lat},${lon}&format=json&units=${UNITS}&language=${LANG}&apiKey=${this._key()}`;
      return fetchJson(url);
    }
    async _getDaily(lat, lon) {
      const url = `${BASE}/v3/wx/forecast/daily/5day?geocode=${lat},${lon}&format=json&units=${UNITS}&language=${LANG}&apiKey=${this._key()}`;
      return fetchJson(url);
    }
    async _getAlerts(lat, lon) {
      const url = `${BASE}/v3/alerts/headlines?geocode=${lat},${lon}&format=json&language=${LANG}&apiKey=${this._key()}`;
      return fetchJson(url);
    }
    async _getAQ(lat, lon) {
      const url = `${BASE}/v3/wx/globalAirQuality?geocode=${lat},${lon}&format=json&language=${LANG}&scale=EPA&apiKey=${this._key()}`;
      return fetchJson(url);
    }

    // ============ blocks ============
    async current(args) {
      try {
        const { lat, lon } = this._geo(args);
        const d = await this._getCurrent(lat, lon);
        if (!d) return '';
        switch (args.FIELD) {
          case 'temperature': return num(d.temperature);
          case 'feelsLike': return num(d.temperatureFeelsLike);
          case 'phrase': return str(d.wxPhraseLong || d.wxPhraseMedium || d.wxPhraseShort);
          case 'humidity': return num(d.relativeHumidity);
          case 'dewPoint': return num(d.temperatureDewPoint);
          case 'heatIndex': return num(d.temperatureHeatIndex);
          case 'windChill': return num(d.temperatureWindChill);
          case 'windSpeed': return num(d.windSpeed);
          case 'windGust': return d.windGust === null || d.windGust === undefined ? '' : num(d.windGust);
          case 'windDir': return str(d.windDirectionCardinal);
          case 'windDeg': return num(d.windDirection);
          case 'pressure': return num(d.pressureAltimeter);
          case 'visibility': return num(d.visibility);
          case 'cloudCover': return num(d.cloudCover);
          case 'uvIndex': return num(d.uvIndex);
          case 'uvDesc': return str(d.uvDescription);
          case 'dayOrNight': return str(d.dayOrNight);
          case 'sunrise': return str(d.sunriseTimeLocal);
          case 'sunset': return str(d.sunsetTimeLocal);
          case 'iconCode': return num(d.iconCode);
          default: return '';
        }
      } catch (e) { return ''; }
    }

    async hourly(args) {
      try {
        const { lat, lon } = this._geo(args);
        const h = clampInt(args.H, 0, 47, 0);
        const d = await this._getHourly(lat, lon);
        if (!d) return '';
        const at = (arr) => (Array.isArray(arr) && h < arr.length ? arr[h] : '');
        switch (args.FIELD) {
          case 'temperature': return num(at(d.temperature));
          case 'feelsLike': return num(at(d.temperatureFeelsLike));
          case 'phrase': return str(at(d.wxPhraseLong));
          case 'humidity': return num(at(d.relativeHumidity));
          case 'precipChance': return num(at(d.precipChance));
          case 'precipType': return str(at(d.precipType));
          case 'windSpeed': return num(at(d.windSpeed));
          case 'windDir': return str(at(d.windDirectionCardinal));
          case 'uvIndex': return num(at(d.uvIndex));
          case 'uvDesc': return str(at(d.uvDescription));
          case 'cloudCover': return num(at(d.cloudCover));
          case 'dayOrNight': return str(at(d.dayOrNight));
          case 'timeLocal': return str(at(d.validTimeLocal));
          default: return '';
        }
      } catch (e) { return ''; }
    }

    async hourlyTime(args) {
      try {
        const { lat, lon } = this._geo(args);
        const h = clampInt(args.H, 0, 47, 0);
        const d = await this._getHourly(lat, lon);
        if (!d || !Array.isArray(d.validTimeLocal)) return '';
        return str(d.validTimeLocal[h] || '');
      } catch (e) { return ''; }
    }

    async daily(args) {
      try {
        const { lat, lon } = this._geo(args);
        const day = clampInt(args.D, 0, 5, 1);
        const d = await this._getDaily(lat, lon);
        if (!d) return '';
        const at = (arr) => (Array.isArray(arr) && day < arr.length ? arr[day] : '');
        switch (args.FIELD) {
          case 'high': {
            const v = at(d.calendarDayTemperatureMax);
            return v === null || v === undefined ? '' : num(v);
          }
          case 'low': {
            const v = at(d.calendarDayTemperatureMin);
            return v === null || v === undefined ? '' : num(v);
          }
          case 'narrative': return str(at(d.narrative));
          case 'sunrise': return str(at(d.sunriseTimeLocal));
          case 'sunset': return str(at(d.sunsetTimeLocal));
          case 'moonPhase': return str(at(d.moonPhase));
          case 'qpfRain': return num(at(d.qpfRain));
          default: return '';
        }
      } catch (e) { return ''; }
    }

    // daypart[0]: index 0 = null, 1 = day0 Night, 2 = day1 Day, 3 = day1 Night, ...
    _daypartIndex(day, dn) {
      day = clampInt(day, 0, 5, 1);
      if (dn === 'D') {
        if (day === 0) return -1; // no Day part for today in this feed
        return day * 2;
      }
      return day * 2 + 1; // Night
    }

    async daypart(args) {
      try {
        const { lat, lon } = this._geo(args);
        const d = await this._getDaily(lat, lon);
        if (!d || !Array.isArray(d.daypart) || !d.daypart[0]) return '';
        const p = d.daypart[0];
        const i = this._daypartIndex(args.D, args.DN);
        if (i < 1 || i >= 12) return '';
        const at = (arr) => (Array.isArray(arr) && i < arr.length ? arr[i] : '');
        switch (args.FIELD) {
          case 'temperature': return num(at(p.temperature));
          case 'phrase': return str(at(p.wxPhraseLong));
          case 'narrative': return str(at(p.narrative));
          case 'precipChance': return num(at(p.precipChance));
          case 'precipType': return str(at(p.precipType));
          case 'humidity': return num(at(p.relativeHumidity));
          case 'windSpeed': return num(at(p.windSpeed));
          case 'windDir': return str(at(p.windDirectionCardinal));
          case 'windPhrase': return str(at(p.windPhrase));
          case 'uvIndex': return num(at(p.uvIndex));
          case 'uvDesc': return str(at(p.uvDescription));
          case 'cloudCover': return num(at(p.cloudCover));
          case 'daypartName': return str(at(p.daypartName));
          case 'thunder': return str(at(p.thunderCategory));
          case 'qualifier': return str(at(p.qualifierPhrase));
          default: return '';
        }
      } catch (e) { return ''; }
    }

    async alertCount(args) {
      try {
        const { lat, lon } = this._geo(args);
        const d = await this._getAlerts(lat, lon);
        if (!d || !Array.isArray(d.alerts)) return 0;
        return d.alerts.length;
      } catch (e) { return 0; }
    }

    async alertField(args) {
      try {
        const { lat, lon } = this._geo(args);
        const d = await this._getAlerts(lat, lon);
        if (!d || !Array.isArray(d.alerts) || !d.alerts.length) return '';
        const n = clampInt(args.N, 1, d.alerts.length, 1) - 1;
        const a = d.alerts[n];
        if (!a) return '';
        switch (args.FIELD) {
          case 'event': return str(a.eventDescription);
          case 'headline': return str(a.headlineText);
          case 'severity': return str(a.severity);
          case 'urgency': return str(a.urgency);
          case 'certainty': return str(a.certainty);
          case 'office': return str(a.officeName);
          case 'area': return str(a.areaName);
          case 'onset': return str(a.onsetTimeLocal);
          case 'expires': return str(a.expireTimeLocal);
          case 'summary': return str(a.summaryHeadline);
          default: return '';
        }
      } catch (e) { return ''; }
    }

    async airQuality(args) {
      try {
        const { lat, lon } = this._geo(args);
        const d = await this._getAQ(lat, lon);
        const g = d && d.globalairquality ? d.globalairquality : null;
        if (!g) return '';
        const pol = (k) => (g.pollutants && g.pollutants[k] ? g.pollutants[k].amount : '');
        switch (args.FIELD) {
          case 'aqi': return num(g.airQualityIndex);
          case 'category': return str(g.airQualityCategory);
          case 'pollutant': return str(g.primaryPollutant);
          case 'pm25': return num(pol('PM2.5'));
          case 'pm10': return num(pol('PM10'));
          case 'o3': return num(pol('O3'));
          case 'no2': return num(pol('NO2'));
          case 'co': return num(pol('CO'));
          case 'so2': return num(pol('SO2'));
          case 'advice': return str(g.messages && g.messages.General && g.messages.General.text);
          default: return '';
        }
      } catch (e) { return ''; }
    }

    // ---- random ----
    randomWorldLat() { return randIn(-90, 90, 4); }
    randomWorldLon() { return randIn(-180, 180, 4); }
    randomUSLat() { return randIn(24.52, 49.38, 4); }
    randomUSLon() { return randIn(-124.73, -66.95, 4); }

    randomWorldPlace() {
      const lat = this.randomWorldLat();
      const lon = this.randomWorldLon();
      this.lastWorld = { lat, lon };
      return lat + ',' + lon;
    }
    randomUSPlace() {
      const lat = this.randomUSLat();
      const lon = this.randomUSLon();
      this.lastUS = { lat, lon };
      return lat + ',' + lon;
    }

    async randomWorldCurrent(args) {
      const lat = randIn(-90, 90, 4);
      const lon = randIn(-180, 180, 4);
      this.lastWorld = { lat, lon };
      return this.current({ FIELD: args.FIELD, LAT: String(lat), LON: String(lon) });
    }
    async randomUSCurrent(args) {
      const lat = randIn(24.52, 49.38, 4);
      const lon = randIn(-124.73, -66.95, 4);
      this.lastUS = { lat, lon };
      return this.current({ FIELD: args.FIELD, LAT: String(lat), LON: String(lon) });
    }
  }

  Scratch.extensions.register(new TWCWeather());
})(Scratch);
