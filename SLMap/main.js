const MAX_ZOOM = 8;

var map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: 1,
    maxZoom: MAX_ZOOM,
    zoomSnap: 1,
    zoomDelta: 1,
    doubleClickZoom: false
});

// --- BASE TILE LAYER ---
var SLMapLayer = L.TileLayer.extend({
    getTileUrl: function(coords) {
        var slZoom = 9 - coords.z; 
        var regionsPerTile = Math.pow(2, slZoom - 1);
        var slX = coords.x * regionsPerTile;
        var slY = (-coords.y - 1) * regionsPerTile;

        if (slX < 0 || slY < 0 || slX > 4096 || slY > 4096) {
            return 'https://map.secondlife.com/map-1-0-0-objects.jpg';
        }
        return `https://map.secondlife.com/map-${slZoom}-${slX}-${slY}-objects.jpg`;
    },
    getTileSize: function() { return new L.Point(256, 256); }
});

var baseLayer = new SLMapLayer({
    noWrap: true,
    bounds: [[0, 0], [4096, 4096]],
    errorTileUrl: 'https://map.secondlife.com/map-1-0-0-objects.jpg'
}).addTo(map);

baseLayer.on('tileerror', function(errorEvent) {
    errorEvent.tile.src = 'https://map.secondlife.com/map-1-0-0-objects.jpg';
});

map.setView([921, 1020], 6);

// --- LAYERS ---
var gridLayer = L.layerGroup().addTo(map);
var labelsLayer = L.layerGroup().addTo(map);
var clickedMarkersLayer = L.layerGroup().addTo(map);

// --- DRAW GRID & REGION LABELS ---
function drawGridAndLabels() {
    gridLayer.clearLayers();
    labelsLayer.clearLayers();

    if (!document.getElementById('toggleGrid').checked) return;

    var currentZoom = map.getZoom();
    var bounds = map.getBounds();
    var startX = Math.floor(bounds.getWest());
    var endX = Math.ceil(bounds.getEast());
    var startY = Math.floor(bounds.getSouth());
    var endY = Math.ceil(bounds.getNorth());

    // Grid lines
    for (var x = startX; x <= endX; x++) {
        gridLayer.addLayer(L.polyline([[startY, x], [endY, x]], { color: 'rgba(255,255,255,0.2)', weight: 1 }));
    }
    for (var y = startY; y <= endY; y++) {
        gridLayer.addLayer(L.polyline([[y, startX], [y, endX]], { color: 'rgba(255,255,255,0.2)', weight: 1 }));
    }

    // Region labels
    if (currentZoom >= 5 && RegionDatabase.isLoaded) {
        for (var x = startX; x < endX; x++) {
            for (var y = startY; y < endY; y++) {

                // CORRECT: map coords already equal region grid coords
                var record = RegionDatabase.getByCoordinates(x, y);

                if (record) {
                    var tileTopLeft = map.project([y + 1, x], currentZoom);
                    var tileBottomRight = map.project([y, x + 1], currentZoom);
                    var tileWidth = Math.max(1, Math.round(tileBottomRight.x - tileTopLeft.x));
                    var tileHeight = Math.max(1, Math.round(Math.abs(tileBottomRight.y - tileTopLeft.y)));
                    var labelIcon = L.divIcon({
                        className: 'region-tile-label',
                        html: `<span>${record.name}</span>`,
                        iconSize: [tileWidth, tileHeight],
                        iconAnchor: [0, tileHeight]
                    });
                    var labelMarker = L.marker([y, x], {
                        icon: labelIcon,
                        interactive: true,
                        zIndexOffset: 100
                    });

                    labelMarker.bindPopup(generatePopupHtml(record.name, x, y, 0, 0, record));
                    labelMarker.on('dblclick', function(event) {
                        L.DomEvent.stopPropagation(event.originalEvent);
                        this.openPopup();
                    });
                    labelMarker.addTo(labelsLayer);
                }
            }
        }
    }
}

// --- POPUP GENERATOR ---
function generatePopupHtml(regionName, rx, ry, localX, localY, record) {
    var encodedName = encodeURIComponent(regionName);
    var webUrl = `https://maps.secondlife.com/secondlife/${encodedName}/${localX}/${localY}/24`;
    var tpUrl = `secondlife://${regionName}/${localX}/${localY}/24`;

    var hudDetails = '';
    if (record && record.params) {
        var p = record.params;
        var ratingLabel = RegionDatabase.formatRating(p.DATA_SIM_RATING || p.region_rating);
        var activeFlags = RegionDatabase.decodeFlags(p.region_flags);

        hudDetails = `
            <hr style="border: 0; border-top: 1px solid #444; margin: 6px 0;">
            <div style="font-size: 11px; line-height: 1.4;">
                <b>Maturity:</b> ${ratingLabel}<br>
                <b>Type:</b> ${p.region_product_name || 'N/A'}<br>
                <b>Agent Limit:</b> ${p.agent_limit || 'N/A'}<br>
                <b>Sim Version:</b> ${p.sim_version || 'N/A'}<br>
                ${activeFlags.length ? `<b>Flags:</b> ${activeFlags.join(', ')}<br>` : ''}
            </div>
        `;
    }

    return `
        <b>${regionName}</b><br>
        Grid: (${rx}, ${ry}) | Local: (${localX}, ${localY})
        ${hudDetails}<br>
        <a href="${webUrl}" target="_blank">Open Web SLURL</a><br>
        <a href="${tpUrl}">TP In-Viewer</a>
    `;
}

// --- REMOTE FALLBACK ---
function queryRemoteServer(rx, ry, localX, localY, marker) {
    var callbackName = `ll_lookup_${rx}_${ry}`.replace(/-/g, '_');
    var script = document.createElement('script');
    script.src = `https://cap.secondlife.com/cap/0/b713fe80-283b-4585-af4d-a3b7d9a32492?var=${callbackName}&grid_x=${rx}&grid_y=${ry}`;

    window[callbackName] = function(data) {
        var regionName = (typeof data === 'string') ? data : (data && data.name ? data.name : null);

        if (regionName && regionName.trim() !== '' && regionName !== 'None') {
            marker.setPopupContent(generatePopupHtml(regionName, rx, ry, localX, localY, null)).openPopup();
        } else {
            marker.setPopupContent(`<b>Void / Empty Space</b><br>Grid: (${rx}, ${ry})<br>No active region found.`);
        }
        delete window[callbackName];
    };

    script.onerror = function() {
        marker.setPopupContent(`<b>Error</b><br>Could not reach Linden Lab API.`);
        delete window[callbackName];
    };

    document.body.appendChild(script);
    script.onload = () => document.body.removeChild(script);
}

// --- DOUBLE-CLICK HANDLER ---
map.on('dblclick', function(e) {
    var clickedY = e.latlng.lat;
    var clickedX = e.latlng.lng;
    
    var rx = Math.floor(clickedX);
    var ry = Math.floor(clickedY);

    var localX = Math.floor((clickedX - rx) * 256);
    var localY = Math.floor((clickedY - ry) * 256);

    var marker = L.marker([clickedY, clickedX]).addTo(clickedMarkersLayer);

    // CORRECT: rx, ry ARE region grid coords
    var localRecord = RegionDatabase.getByCoordinates(rx, ry);

    if (localRecord) {
        var content = generatePopupHtml(localRecord.name, rx, ry, localX, localY, localRecord);
        marker.bindPopup(content).openPopup();
    } else {
        marker.bindPopup(`<b>Grid:</b> (${rx}, ${ry})<br>Querying region name...`).openPopup();
        queryRemoteServer(rx, ry, localX, localY, marker);
    }
});

// --- EVENTS ---
document.getElementById('toggleGrid').addEventListener('change', drawGridAndLabels);
map.on('moveend zoomend', drawGridAndLabels);

window.addEventListener('regionDataLoaded', function() {
    drawGridAndLabels();
});

drawGridAndLabels();
