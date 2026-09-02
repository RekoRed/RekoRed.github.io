// Publish the sheet to the web as CSV, then paste its URL here.
// Example: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/gviz/tq?tqx=out:csv&gid=0
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/10lhGj1dX_mY3YvROHlg3JRBzdBUJMh7dHH3ifICndC8/gviz/tq?tqx=out:csv&gid=0";
const REFRESH_INTERVAL_MS = 60 * 1000;

const RegionDatabase = {
    recordsByName: new Map(),
    recordsByTile: new Map(),
    isLoaded: false,
    loadPromise: null,
    refreshPromise: null,

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
            const callbackName = `sheetData_${Date.now()}`;
            const script = document.createElement('script');
            const sheetUrl = new URL(GOOGLE_SHEET_CSV_URL);
            sheetUrl.searchParams.set('tqx', `out:json;responseHandler:${callbackName}`);
            sheetUrl.searchParams.set('t', Date.now());
            script.src = sheetUrl.href;

            const finish = (error) => {
                delete window[callbackName];
                script.remove();
                if (error) {
                    reject(error);
                }
            };

            window[callbackName] = (response) => {
                if (!response || response.status !== 'ok' || !response.table) {
                    finish(new Error('Google Sheet returned no usable data. Publish the sheet or allow anyone with the link to view it.'));
                    return;
                }

                const columnIndexes = Object.fromEntries(
                    response.table.cols.map((column, index) => [column.label, index])
                );

                this.recordsByName.clear();
                this.recordsByTile.clear();

                response.table.rows.forEach(row => {
                    const values = row.c || [];
                    const getValue = (columnName) => values[columnIndexes[columnName]]?.v;
                    const regionName = getValue('Region Name');
                    const rawX = parseFloat(getValue('Grid X'));
                    const rawY = parseFloat(getValue('Grid Y'));
                    const updatedEpoch = parseInt(getValue('Updated Epoch'), 10);
                    const jsonString = getValue('Parameters JSON');

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
                console.log(`RegionData: Loaded ${this.recordsByTile.size} regions from Google Sheets.`);

                window.dispatchEvent(new Event('regionDataLoaded'));
                finish();
                resolve();
            };

            script.onerror = () => finish(new Error('Could not reach the Google Sheet. Check its sharing settings.'));
            document.body.appendChild(script);
        });

        return this.loadPromise;
    },

    async refresh() {
        if (this.refreshPromise) return this.refreshPromise;

        // Do not start a second request while the initial load is still running.
        if (this.loadPromise && !this.isLoaded) {
            try {
                await this.loadPromise;
            } catch (err) {
                console.error("RegionData: Initial load failed", err);
            }
            return;
        }

        this.loadPromise = null;
        this.refreshPromise = this.loadCSV().catch(function(err) {
            console.error("RegionData: Refresh failed", err);
        }).finally(() => {
            this.refreshPromise = null;
        });
        return this.refreshPromise;
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
setInterval(() => RegionDatabase.refresh(), REFRESH_INTERVAL_MS);
