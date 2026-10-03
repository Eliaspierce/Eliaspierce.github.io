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
        }
      ]
    };
  }
  getRandomCoordinate(min, max) {
    return (Math.random() * (max - min) + min).toFixed(3);
  }
  _url(lat, lon) {
    return "https://api.weather.com/v3/aggcommon/v3-wx-observations-current;v3-wx-forecast-daily-3day;v3-wx-forecast-hourly-6hour?geocode=" + lat + "," + lon + "&units=e&language=en-US&format=json&apiKey=" + this._apiKey;
  }
  async _fetch(lat, lon) {
    const res = await fetch(this._url(lat, lon));
    this._data = await res.json();
  }
  async getMosesLake() {
    await this._fetch("47.131", "-119.279");
  }
  async getRandomLocation() {
    await this._fetch(this.getRandomCoordinate(-90, 90), this.getRandomCoordinate(-180, 180));
  }
  async getRandomUSLocation() {
    await this._fetch(this.getRandomCoordinate(24, 49), this.getRandomCoordinate(-125, -66));
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
  _dayIdx() {
    const d = this._daily();
    if (!d || !d.temperature) return 0;
    return d.temperature[0] === null ? 1 : 0;
  }
  _dayCoverIdx() {
    const d = this._daily();
    if (!d || !d.cloudCover) return 0;
    return d.cloudCover[0] === null ? 1 : 0;
  }
  currentWeather() {
    const c = this._cur();
    return c ? String(c.wxPhraseLong) : "";
  }
  currentVisibility() {
    const c = this._cur();
    return c ? String(c.visibility) + " mi" : "";
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
    return h && h.windSpeed ? String(h.windSpeed[0]) + " mph" : "";
  }
  nextHourlyVisibility() {
    const h = this._hour();
    return h && h.visibility ? String(h.visibility[0]) + " mi" : "";
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
    const d = this._daily();
    return d && d.wxPhraseLong ? String(d.wxPhraseLong[this._dayIdx()]) : "";
  }
  dailyTemperature() {
    const d = this._daily();
    return d && d.temperature ? String(d.temperature[this._dayIdx()]) + "°F" : "";
  }
  dailyWindSpeed() {
    const d = this._daily();
    if (!d) return "";
    const i = this._dayIdx();
    return String(d.windPhrase ? d.windPhrase[i] : "") + " is " + String(d.windSpeed ? d.windSpeed[i] : "") + " mph";
  }
  dailyHumidity() {
    const d = this._daily();
    return d && d.relativeHumidity ? String(d.relativeHumidity[this._dayIdx()]) + "%" : "";
  }
  dailyCloudCover() {
    const d = this._daily();
    return d && d.cloudCover ? String(d.cloudCover[this._dayCoverIdx()]) + "%" : "";
  }
  dailyPrecipChance() {
    const d = this._daily();
    if (!d || !d.precipChance) return "";
    const i = this._dayCoverIdx();
    const type = d.precipType !== undefined ? d.precipType : d.PrecipType;
    return String(d.precipChance[i]) + "% is " + String(type ? type[i] : "");
  }
}
Scratch.extensions.register(new TWCWeather());
