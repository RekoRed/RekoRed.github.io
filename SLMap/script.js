// Initialize the map (centered on the grid)
const map = L.map('map', {
    crs: L.CRS.Simple, // Crucial for custom coordinate grids
    minZoom: 1,
    maxZoom: 8
});

// Configure the SL Tile Layer
// Note: SL uses an {z}/{x}/{y} structure
L.tileLayer('http://map.secondlife.com/map-{z}-{x}-{y}-objects.jpg', {
    tms: true, // Needed for specific coordinate orientations
    attribution: '© Linden Lab'
}).addTo(map);

// Set initial view (Da Boom is at roughly 1000, 1000)
map.setView([1000, 1000], 4);

// Add a marker for testing
L.marker([1000, 1000]).addTo(map).bindPopup("Da Boom");