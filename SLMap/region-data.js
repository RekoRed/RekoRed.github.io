// Local CSV file path
const PUBLISHED_CSV_URL = "./Regions.csv";

const RegionDatabase = {
    recordsByName: new Map(),
    recordsByTile: new Map(),
    isLoaded: false,
    loadPromise: null,

    ratings: {
        "PG": "General",
        "MATURE": "Moderate",
        "ADULT": "Adult",
        "UNKNOWN": "Unknown"
    },

    flags: {
        0x00000001: "Damage Enabled",
        0x00000010: "Fixed Sun",
        0x00000040: "Block Terraforming",
        0x00000100: "Sandbox",
        0x00001000: "Disable Collisions",
        0x00004000: "Disable Physics",
        0x00080000: "Block Fly",
        0x00100000: "Allow Direct TP",
        0x00400000: "Restrict Push"
    },

    formatRating(raw) {
        const key = (raw || "UNKNOWN").toUpperCase();
        return this.ratings[key] || "Unknown";
    },

    decodeFlags(bitmask) {
        const active = [];
        const mask = parseInt(bitmask, 10);
        if (isNaN(mask)) return active;

        for (const [bit, label] of Object.entries(this.flags)) {
            if ((mask & parseInt(bit, 16)) !== 0) {
                active.push(label);
            }
        }
        return active;
    },

    async loadCSV() {
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = new Promise(async (resolve, reject) => {
            try {
                const response = await fetch(PUBLISHED_CSV_URL);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const csvText = await response.text();

                Papa.parse(csvText, {
                    header: false,          // HUD CSV has NO headers
                    skipEmptyLines: true,
                    complete: (results) => {
                        results.data.forEach(row => {
                            const regionName = row[0];
                            const rawX = parseFloat(row[1]);
                            const rawY = parseFloat(row[2]);
                            const updatedEpoch = parseInt(row[3], 10);
                            const jsonString = row[4];

                            if (!regionName || isNaN(rawX) || isNaN(rawY)) return;

                            let params = {};
                            try {
                                params = JSON.parse(jsonString);
                            } catch (e) {
                                console.error(`Failed to parse JSON for ${regionName}`, e);
                            }

                            // Convert LL meters → region grid coordinates
                            const tileX = Math.floor(rawX / 256);
                            const tileY = Math.floor(rawY / 256);

                            const record = {
                                name: regionName,
                                rawX,
                                rawY,
                                tileX,
                                tileY,
                                lastUpdated: updatedEpoch,
                                params
                            };

                            this.recordsByName.set(regionName.toLowerCase(), record);
                            this.recordsByTile.set(`${tileX},${tileY}`, record);
                        });

                        this.isLoaded = true;
                        console.log(`RegionData: Loaded ${this.recordsByTile.size} regions from local CSV.`);

                        window.dispatchEvent(new Event('regionDataLoaded'));
                        resolve();
                    }
                });
            } catch (err) {
                console.error("RegionData: Error loading local CSV file", err);
                reject(err);
            }
        });

        return this.loadPromise;
    },

    getRecord(regionName) {
        if (!regionName) return null;
        return this.recordsByName.get(regionName.toLowerCase()) || null;
    },

    getByCoordinates(tileX, tileY) {
        return this.recordsByTile.get(`${tileX},${tileY}`) || null;
    }
};

RegionDatabase.loadCSV();
