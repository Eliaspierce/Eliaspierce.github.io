class GlobalAirQuality {
  constructor(runtime) {
    this.runtime = runtime;
    this._data = null;
    this._geocode = null;
    this._apiKey = "e1f10a1e78da46f5b10a1e78da96f525";
  }
  getInfo() {
    return {
      id: "GlobalAirQuality",
      name: "Global Air Quality",
      color1: "#7196A6",
      blockIconURI: "https://www.airnow.gov/sites/default/files/2017-12/AirNow_Logo_White.svg",
      blocks: [
        {
          opcode: "getAirQuality",
          blockType: Scratch.BlockType.COMMAND,
          text: "Get Air Quality geocode [Geocode]",
          arguments: {
            Geocode: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: "39.92,116.4"
            }
          }
        },
        {
          opcode: "getAirQualityIndex",
          blockType: Scratch.BlockType.REPORTER,
          text: "Get Air Quality Index"
        },
        {
          opcode: "getAirQualityCategory",
          blockType: Scratch.BlockType.REPORTER,
          text: "Get Air Quality Category"
        },
        {
          opcode: "getPrimaryPollutant",
          blockType: Scratch.BlockType.REPORTER,
          text: "Highest Primary Pollutant"
        }
      ]
    };
  }
  _url(geocode) {
    return "https://api.weather.com/v3/wx/globalAirQuality?geocode=" + geocode + "&format=json&language=en-US&apiKey=" + this._apiKey + "&scale=EPA";
  }
  async _fetch(geocode) {
    const res = await fetch(this._url(geocode));
    this._data = await res.json();
    this._geocode = geocode;
  }
  _aq() {
    return (this._data && this._data["globalairquality"]) || null;
  }
  async getAirQuality(args) {
    await this._fetch(args.Geocode);
  }
  getAirQualityIndex() {
    const d = this._aq();
    return d ? String(d.airQualityIndex) : "";
  }
  getAirQualityCategory() {
    const d = this._aq();
    return d ? String(d.airQualityCategory) : "";
  }
  getPrimaryPollutant() {
    const d = this._aq();
    return d ? String(d.primaryPollutant) : "";
  }
}
Scratch.extensions.register(new GlobalAirQuality());
