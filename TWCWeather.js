class TWCWeather {
  constructor(runtime) {
    this.runtime = runtime;
    this._data = null;
    this._apiKey = "e1f10a1e78da46f5b10a1e78da96f525";
  }
  getInfo() {
    return {
      id: "TWCWeather",
      name: "The Weather Channel",
      blockIconURI: "https://weather.com/favicon.ico",
      blocks: [
        {
          opcode: "getMosesLake",
          blockType: Scratch.BlockType.COMMAND,
          text: "Get location Moses Lake, WA"
        },
        {
          opcode: "getRandomLocation",
          blockType: Scratch.BlockType.COMMAND,
          text: "Get Random Location"
        },
        {
          opcode: "getRandomUSLocation",
          blockType: Scratch.BlockType.COMMAND,
          text: "Get Random US Location"
        },
        {
          opcode: "currentWeather",
          blockType: Scratch.BlockType.REPORTER,
          text: "Current Weather"
        },
        {
          opcode: "currentVisibility",
          blockType: Scratch.BlockType.REPORTER,
          text: "Current Visibility"
        },
        {
          opcode: "currentIcon",
          blockType: Scratch.BlockType.REPORTER,
          text: "Current Icon"
        },
        {
          opcode: "currentTemperature",
          blockType: Scratch.BlockType.REPORTER,
          text: "Current Temperature"
        },
        {
          opcode: "currentWindSpeed",
          blockType: Scratch.BlockType.REPORTER,
          text: "Current Wind Speed"
        },
        {
          opcode: "currentHumidity",
          blockType: Scratch.BlockType.REPORTER,
          text: "Current Humidity"
        },
        {
          opcode: "currentCloudCover",
          blockType: Scratch.BlockType.REPORTER,
          text: "Current Cloud Cover"
        },
        {
          opcode: "nextHourlyTemperature",
          blockType: Scratch.BlockType.REPORTER,
          text: "Next Hourly Temperature"
        },
        {
          opcode: "nextHourlyForecast",
          blockType: Scratch.BlockType.REPORTER,
          text: "Next Hourly Weather Forecast"
        },
        {
          opcode: "nextHourlyWindSpeed",
          blockType: Scratch.BlockType.REPORTER,
          text: "Next Hourly Wind Speed"
        },
        {
          opcode: "nextHourlyVisibility",
          blockType: Scratch.BlockType.REPORTER,
          text: "Next Hourly Visibility"
        },
        {
          opcode: "nextHourlyIcon",
          blockType: Scratch.BlockType.REPORTER,
          text: "Next Hourly Icon"
        },
        {
          opcode: "nextHourlyCloudCover",
          blockType: Scratch.BlockType.REPORTER,
          text: "Next Hourly Cloud Cover"
        },
        {
          opcode: "nextHourlyHumidity",
          blockType: Scratch.BlockType.REPORTER,
          text: "Next Hourly Humidity"
        },
        {
          opcode: "nextHourlyPrecipChance",
          blockType: Scratch.BlockType.REPORTER,
          text: "Next Hourly Precipitation Chance"
        },
        {
          opcode: "dailyForecast",
          blockType: Scratch.BlockType.REPORTER,
          text: "Daily Weather Forecast"
        },
        {
          opcode: "dailyFullForecast",
          blockType: Scratch.BlockType.REPORTER,
          text: "Daily Full Weather Forecast"
        },
        {
          opcode: "dailyTemperature",
          blockType: Scratch.BlockType.REPORTER,
          text: "Daily Temperature"
        },
        {
          opcode: "dailyWindSpeed",
          blockType: Scratch.BlockType.REPORTER,
          text: "Daily Wind Speed"
        },
        {
          opcode: "dailyHumidity",
          blockType: Scratch.BlockType.REPORTER,
          text: "Daily Humidity"
        },
        {
          opcode: "dailyCloudCover",
          blockType: Scratch.BlockType.REPORTER,
          text: "Daily Cloud Cover"
        },
        {
          opcode: "dailyPrecipChance",
          blockType: Scratch.BlockType.REPORTER,
          text: "Daily Precipitation Chance"
        },
        {
          opcode: "dailyIcon",
          blockType: Scratch.BlockType.REPORTER,
          text: "Daily Icon"
        },
        {
          opcode: "liveTime",
          blockType: Scratch.BlockType.REPORTER,
          text: "Live Time"
        },
        {
          opcode: "getGeocode",
          blockType: Scratch.BlockType.REPORTER,
          text: "Get Geocode"
        },
        {
          opcode: "alertsHeadlines",
          blockType: Scratch.BlockType.REPORTER,
          text: "Alerts Headlines"
        }
      ]
    };
  }
  getRandomCoordinate(min, max) {
    return (Math.random() * (max - min) + min).toFixed(3);
  }
  _url(lat, lon) {
    return "https://api.weather.com/v3/aggcommon/v3-wx-observations-current;v3-wx-forecast-daily-3day;v3-wx-forecast-hourly-6hour;v3alertsHeadlines?geocode=" + lat + "," + lon + "&units=e&language=en-US&format=json&apiKey=" + this._apiKey;
  }
  async _fetch(lat, lon) {
    const res = await fetch(this._url(lat, lon));
    this._data = await res.json();
    this._geocode = lat + "," + lon;
  }
  async getMosesLake() {
    await this._fetch("47.131", "-119.279");
  }
  async getRandomLocation() {
    await this._fetch(this.getRandomCoordinate(-90, 90), this.getRandomCoordinate(-180, 180));
  }
  async getRandomUSLocation() {
    await this._fetch(this.getRandomCoordinate(24.5, 49.5), this.getRandomCoordinate(-124.8, -66.9));
  }
  _cur() {
    return (this._data && this._data["v3-wx-observations-current"]) || null;
  }
  _hour() {
    return (this._data && this._data["v3-wx-forecast-hourly-6hour"]) || null;
  }
  _daily() {
    return (this._data && this._data["v3-wx-forecast-daily-3day"]) || null;
  }
  _dp() {
    const d = this._daily();
    if (!d || !d.daypart || !d.daypart[0]) return null;
    return d.daypart[0];
  }
  _tempIdx() {
    const dp = this._dp();
    if (!dp || !dp.temperature) return 0;
    return dp.temperature[0] === null ? 1 : 0;
  }
  _coverIdx() {
    const dp = this._dp();
    if (!dp || !dp.cloudCover) return 0;
    return dp.cloudCover[0] === null ? 1 : 0;
  }
  currentWeather() {
    const c = this._cur();
    return c ? String(c.wxPhraseLong) : "";
  }
  currentVisibility() {
    const c = this._cur();
    return c ? String(c.visibility) + " mi" : "";
  }
  currentIcon() {
    const c = this._cur();
    return c ? String(c.iconCode) : "";
  }
  currentTemperature() {
    const c = this._cur();
    return c ? String(c.temperature) + "°F" : "";
  }
  currentWindSpeed() {
    const c = this._cur();
    return c ? String(c.windSpeed) + " mph" : "";
  }
  currentHumidity() {
    const c = this._cur();
    return c ? String(c.relativeHumidity) + "%" : "";
  }
  currentCloudCover() {
    const c = this._cur();
    return c ? String(c.cloudCover) + "% is " + String(c.cloudCoverPhrase) : "";
  }
  nextHourlyTemperature() {
    const h = this._hour();
    return h && h.temperature ? String(h.temperature[0]) + "°F" : "";
  }
  nextHourlyForecast() {
    const h = this._hour();
    return h && h.wxPhraseLong ? String(h.wxPhraseLong[0]) : "";
  }
  nextHourlyWindSpeed() {
    const h = this._hour();
    if (!h || !h.windSpeed) return "";
    return String(h.windDirectionCardinal ? h.windDirectionCardinal[0] : "") + " " + String(h.windSpeed[0]) + " mph";
  }
  nextHourlyVisibility() {
    const h = this._hour();
    return h && h.visibility ? String(h.visibility[0]) + " mi" : "";
  }
  nextHourlyIcon() {
    const h = this._hour();
    return h && h.iconCode ? String(h.iconCode[0]) : "";
  }
  nextHourlyCloudCover() {
    const h = this._hour();
    return h && h.cloudCover ? String(h.cloudCover[0]) + "%" : "";
  }
  nextHourlyHumidity() {
    const h = this._hour();
    return h && h.relativeHumidity ? String(h.relativeHumidity[0]) + "%" : "";
  }
  nextHourlyPrecipChance() {
    const h = this._hour();
    if (!h || !h.precipChance) return "";
    const type = h.precipType !== undefined ? h.precipType : h.PrecipType;
    return String(h.precipChance[0]) + "% in " + String(type ? type[0] : "");
  }
  dailyForecast() {
    const dp = this._dp();
    return dp && dp.wxPhraseLong ? String(dp.wxPhraseLong[this._tempIdx()]) : "";
  }
  dailyFullForecast() {
    const dp = this._dp();
    return dp && dp.narrative ? String(dp.narrative[this._tempIdx()]) : "";
  }
  dailyTemperature() {
    const dp = this._dp();
    return dp && dp.temperature ? String(dp.temperature[this._tempIdx()]) + "°F" : "";
  }
  dailyWindSpeed() {
    const dp = this._dp();
    if (!dp) return "";
    const i = this._tempIdx();
    return String(dp.windPhrase ? dp.windPhrase[i] : "") + " is " + String(dp.windSpeed ? dp.windSpeed[i] : "") + " mph";
  }
  dailyHumidity() {
    const dp = this._dp();
    return dp && dp.relativeHumidity ? String(dp.relativeHumidity[this._tempIdx()]) + "%" : "";
  }
  dailyCloudCover() {
    const dp = this._dp();
    return dp && dp.cloudCover ? String(dp.cloudCover[this._coverIdx()]) + "%" : "";
  }
  dailyPrecipChance() {
    const dp = this._dp();
    if (!dp || !dp.precipChance) return "";
    const i = this._coverIdx();
    const type = dp.PrecipType !== undefined ? dp.PrecipType : dp.precipType;
    return String(dp.precipChance[i]) + "% is " + String(type ? type[i] : "");
  }
  dailyIcon() {
    const dp = this._dp();
    if (!dp || !dp.iconCode) return "";
    return String(dp.iconCode[this._coverIdx()]);
  }
  _alerts() {
    return (this._data && this._data["v3alertsHeadlines"]) || null;
  }
  liveTime() {
    const c = this._cur();
    return c ? String(c.dayOrNight) : "";
  }
  getGeocode() {
    return this._geocode || "";
  }
  alertsHeadlines() {
    const a = this._alerts();
    if (!a || !a.alerts) return "";
    return a.alerts.map(x => x.headlineText || x.eventDescription || "").filter(Boolean).join("; ");
  }
}
Scratch.extensions.register(new TWCWeather());
