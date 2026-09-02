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
var highlightLayer = L.layerGroup().addTo(map);
var visualizationLayer = L.layerGroup().addTo(map);

// Edit these colors to customize each visualization.
var visualizationColors = {
    rating: {
        General: '#00ff62',
        Moderate: '#f0b429',
        Adult: '#e05252',
        Unknown: '#88909a'
    },
    server: {
        'Second Life Server': '#00b646',
        'Second Life RC Magnum': '#fce355',
        'Second Life RC LeTigre': '#ff6e1a',
        'Second Life RC BlueSteel': '#0061bd',
        Unknown: '#da0000'
    },
    regionType: {
        'Mainland / Full Region': '#ff0000',
        'Mainland / Homestead': '#ff8800',
        'Linden Homes / Full Region': '#02b881',
        'Mainland / Openspace': '#5e00ac',
        Unknown: '#888888'
    },
    normalServer: {
        normal: '#007bff',
        rc: '#ff0000'
    },
    numeric: {
        low: '#ff3535',
        middle: '#ffef08',
        high: '#00ff6a'
    }
};

var visualizationDefinitions = {
    region_rating: { label: 'Sim Rating', type: 'rating' },
    agent_limit: { label: 'Player Limit', type: 'number', highIsGood: true },
    agent_reserved: { label: 'Premium Priority Slots', type: 'number', highIsGood: true },
    normal_player_balance: { label: 'Normal Player Balance', type: 'ratio', highIsGood: true },
    region_product_name: { label: 'Region Type', type: 'category' },
    region_max_prims: { label: 'Max Prims', type: 'number', highIsGood: true },
    sim_channel: { label: 'Server Type', type: 'server' },
    server_normal_rc: { label: 'Server Normal VS RC', type: 'normalRc' }
};

function getTileCoordinates(latlng) {
    var tileX = Math.floor(latlng.lng);
    var tileY = Math.floor(latlng.lat);
    return { tileX: tileX, tileY: tileY };
}

function highlightTile(latlng) {
    var coordinates = getTileCoordinates(latlng);
    highlightLayer.clearLayers();
    L.rectangle([
        [coordinates.tileY, coordinates.tileX],
        [coordinates.tileY + 1, coordinates.tileX + 1]
    ], {
        color: '#00ffcc',
        weight: 2,
        fill: false,
        interactive: false
    }).addTo(highlightLayer);
}

function getVisualizationValue(record, field) {
    if (field === 'region_rating') {
        var rating = (record.params.DATA_SIM_RATING || record.params.region_rating || 'UNKNOWN').toUpperCase();
        return { PG: 'General', MATURE: 'Moderate', ADULT: 'Adult' }[rating] || 'Unknown';
    }
    if (field === 'normal_player_balance') {
        var playerLimit = Number(record.params.agent_limit);
        var premiumSlots = Number(record.params.agent_reserved);
        if (!Number.isFinite(playerLimit) || playerLimit <= 0 || !Number.isFinite(premiumSlots)) return null;
        return Math.max(0, Math.min(1, (playerLimit - premiumSlots) / playerLimit));
    }
    if (field === 'server_normal_rc') {
        return record.params.sim_channel || 'Unknown';
    }
    return record.params[field];
}

function getVisualizationColor(value, definition, values) {
    if (definition.type === 'rating') {
        return visualizationColors.rating[value] || visualizationColors.rating.Unknown;
    }

    if (definition.type === 'number' || definition.type === 'ratio') {
        var numericValue = Number(value);
        var min = Math.min.apply(null, values);
        var max = Math.max.apply(null, values);
        var ratio = max === min ? 0.5 : (numericValue - min) / (max - min);
        if (definition.type === 'ratio') {
            ratio = numericValue;
        }
        if (!definition.highIsGood) ratio = 1 - ratio;
        var startColor = ratio < 0.5 ? visualizationColors.numeric.low : visualizationColors.numeric.middle;
        var endColor = ratio < 0.5 ? visualizationColors.numeric.middle : visualizationColors.numeric.high;
        var segmentRatio = ratio < 0.5 ? ratio * 2 : (ratio - 0.5) * 2;
        return blendColors(startColor, endColor, segmentRatio);
    }

    if (definition.type === 'server') {
        return visualizationColors.server[value] || visualizationColors.server.Unknown;
    }

    if (definition.type === 'normalRc') {
        return String(value).startsWith('Second Life RC ')
            ? visualizationColors.normalServer.rc
            : visualizationColors.normalServer.normal;
    }

    if (definition.type === 'category' && definition === visualizationDefinitions.region_product_name) {
        return visualizationColors.regionType[value] || visualizationColors.regionType.Unknown;
    }

    var categoryIndex = values.indexOf(value);
    var categoryHue = (categoryIndex * 137.5) % 360;
    return `hsl(${categoryHue}, 68%, 45%)`;
}

function blendColors(firstColor, secondColor, ratio) {
    var first = firstColor.replace('#', '').match(/.{2}/g).map(function(value) { return parseInt(value, 16); });
    var second = secondColor.replace('#', '').match(/.{2}/g).map(function(value) { return parseInt(value, 16); });
    var channels = first.map(function(value, index) {
        return Math.round(value + ((second[index] - value) * ratio));
    });
    return '#' + channels.map(function(value) { return value.toString(16).padStart(2, '0'); }).join('');
}

function updateVisualizationLegend(field, values) {
    var legend = document.getElementById('visualizationLegend');
    var definition = visualizationDefinitions[field];
    if (!definition) {
        legend.hidden = true;
        legend.innerHTML = '';
        return;
    }

    legend.hidden = false;
    if (definition.type === 'number' || definition.type === 'ratio') {
        var min = Math.min.apply(null, values);
        var max = Math.max.apply(null, values);
        var lowLabel = definition.type === 'ratio' ? `${Math.round(min * 100)}%` : min;
        var highLabel = definition.type === 'ratio' ? `${Math.round(max * 100)}%` : max;
        var gradient = definition.highIsGood
            ? `linear-gradient(90deg, ${visualizationColors.numeric.low}, ${visualizationColors.numeric.middle}, ${visualizationColors.numeric.high})`
            : `linear-gradient(90deg, ${visualizationColors.numeric.high}, ${visualizationColors.numeric.middle}, ${visualizationColors.numeric.low})`;
        legend.innerHTML = `<span>${lowLabel}</span><i class="numeric-gradient" style="background:${gradient}"></i><span>${highLabel}</span>`;
    } else if (definition.type === 'rating') {
        legend.innerHTML = ['General', 'Moderate', 'Adult', 'Unknown'].map(function(rating) {
            return `<span><i class="legend-swatch" style="background:${getVisualizationColor(rating, definition, values)}"></i>${rating}</span>`;
        }).join('');
    } else if (definition.type === 'normalRc') {
        legend.innerHTML = `<span><i class="legend-swatch" style="background:${visualizationColors.normalServer.normal}"></i>Normal</span>`
            + `<span><i class="legend-swatch" style="background:${visualizationColors.normalServer.rc}"></i>RC</span>`;
    } else {
        legend.innerHTML = [...new Set(values)].slice(0, 5).map(function(category, index) {
            return `<span><i class="legend-swatch" style="background:${getVisualizationColor(category, definition, [...new Set(values)])}"></i>${category}</span>`;
        }).join('');
    }
}

function drawVisualization() {
    visualizationLayer.clearLayers();
    var field = document.getElementById('visualizationSelect').value;
    var definition = visualizationDefinitions[field];
    if (!definition || !RegionDatabase.isLoaded) {
        updateVisualizationLegend(null, []);
        return;
    }

    var records = Array.from(RegionDatabase.recordsByTile.values());
    var entries = records.map(function(record) {
        return { record: record, value: getVisualizationValue(record, field) };
    }).filter(function(entry) {
        return (definition.type === 'number' || definition.type === 'ratio')
            ? Number.isFinite(Number(entry.value))
            : Boolean(entry.value);
    });
    var values = entries.map(function(entry) {
        return (definition.type === 'number' || definition.type === 'ratio') ? Number(entry.value) : entry.value;
    });
    var colorValues = definition.type === 'category' || definition.type === 'server' ? [...new Set(values)] : values;

    entries.forEach(function(entry) {
        var record = entry.record;
        var color = getVisualizationColor(
            (definition.type === 'number' || definition.type === 'ratio') ? Number(entry.value) : entry.value,
            definition,
            colorValues
        );
        L.rectangle([[record.tileY, record.tileX], [record.tileY + 1, record.tileX + 1]], {
            color: color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.38,
            interactive: false
        }).addTo(visualizationLayer);
    });
    updateVisualizationLegend(field, values);
}

// --- DRAW GRID & REGION LABELS ---
function drawGridAndLabels() {
    gridLayer.clearLayers();
    labelsLayer.clearLayers();
    drawVisualization();

    var currentZoom = map.getZoom();
    var bounds = map.getBounds();
    var startX = Math.floor(bounds.getWest());
    var endX = Math.ceil(bounds.getEast());
    var startY = Math.floor(bounds.getSouth());
    var endY = Math.ceil(bounds.getNorth());

    if (document.getElementById('toggleGrid').checked) {
        for (var x = startX; x <= endX; x++) {
            gridLayer.addLayer(L.polyline([[startY, x], [endY, x]], { color: 'rgba(255,255,255,0.2)', weight: 1 }));
        }
        for (var y = startY; y <= endY; y++) {
            gridLayer.addLayer(L.polyline([[y, startX], [y, endX]], { color: 'rgba(255,255,255,0.2)', weight: 1 }));
        }
    }

    // Region labels
    if (document.getElementById('toggleRegions').checked && currentZoom >= 5 && RegionDatabase.isLoaded) {
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

                    labelMarker.on('dblclick', function(event) {
                        L.DomEvent.stopPropagation(event.originalEvent);
                        handleRegionClick(map.mouseEventToLatLng(event.originalEvent));
                    });
                    labelMarker.on('mousemove', function(event) {
                        highlightTile(map.mouseEventToLatLng(event.originalEvent));
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

        var visualFields = [
            ['Sim Rating', ratingLabel],
            ['Player Limit', p.agent_limit],
            ['Premium Priority Slots', p.agent_reserved],
            ['Region Type', p.region_product_name],
            ['Max Prims', p.region_max_prims],
            ['Server Type', p.sim_channel],
            ['Sim Version', p.sim_version]
        ];
        hudDetails = `
            <hr style="border: 0; border-top: 1px solid #444; margin: 6px 0;">
            <div class="popup-meta">
                ${visualFields.map(function(field) { return `<b>${field[0]}:</b> ${field[1] ?? 'N/A'}<br>`; }).join('')}
                ${activeFlags.length ? `<b>Flags:</b> ${activeFlags.join(', ')}<br>` : ''}
            </div>
        `;
    }

    return `
        <b>${regionName}</b><br>
        Grid: (${rx}, ${ry}) | Local: (${localX}, ${localY})<br>
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

function handleRegionClick(latlng) {
    var clickedY = latlng.lat;
    var clickedX = latlng.lng;
    var coordinates = getTileCoordinates(latlng);
    var rx = coordinates.tileX;
    var ry = coordinates.tileY;

    var localX = Math.floor((clickedX - rx) * 256);
    var localY = Math.floor((clickedY - ry) * 256);

    clickedMarkersLayer.clearLayers();
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
}

// --- DOUBLE-CLICK HANDLER ---
map.on('dblclick', function(e) {
    handleRegionClick(e.latlng);
});

map.on('mousemove', function(e) {
    highlightTile(e.latlng);
});
map.on('mouseout', function() {
    highlightLayer.clearLayers();
});

// --- EVENTS ---
document.getElementById('toggleGrid').addEventListener('change', drawGridAndLabels);
document.getElementById('toggleRegions').addEventListener('change', drawGridAndLabels);
document.getElementById('visualizationSelect').addEventListener('change', drawVisualization);
map.on('moveend zoomend', drawGridAndLabels);

window.addEventListener('regionDataLoaded', function() {
    drawGridAndLabels();
});

drawGridAndLabels();
