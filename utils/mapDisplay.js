import { createCircleMarker } from './markers.js';

// Store markers and lines for cleanup (exported for use in app.js)
export let currentMarkers = [];
export let currentLineMarkers = [];

// Feature registry for @feature command
let featureRegistry = {
    lines: [],
    markers: [],
    buffers: [],
    polygons: [],
    isochrones: []
};

// Register a feature in the registry
function registerFeature(type, featureData) {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const feature = {
        id,
        type,
        ...featureData,
        addedAt: Date.now()
    };
    featureRegistry[type].push(feature);
    return id;
}

// Clear selection indicator
export function clearSelectionIndicator(map) {
    // Remove selection indicator layers
    if (map.getLayer('selected-feature-indicator')) {
        map.removeLayer('selected-feature-indicator');
    }
    if (map.getLayer('selected-feature-indicator-outline')) {
        map.removeLayer('selected-feature-indicator-outline');
    }
    if (map.getSource('selected-feature-indicator')) {
        map.removeSource('selected-feature-indicator');
    }
}

// Display selection indicator for a feature
export function displaySelectionIndicator(featureData, map) {
    // Clear any existing selection indicator
    clearSelectionIndicator(map);
    
    if (!featureData || !featureData.type) {
        return;
    }
    
    let coordinates = null;
    
    if (featureData.type === 'line') {
        // For lines, use the coordinates directly
        if (featureData.coordinates && featureData.coordinates.length > 0) {
            coordinates = featureData.coordinates;
        }
    } else if (featureData.type === 'marker') {
        // For markers, we could add a highlight circle, but for now skip
        // Could add a circle buffer around the marker
        return;
    } else if (featureData.type === 'polygon') {
        // For polygons, use coordinates (they form a closed loop)
        if (featureData.coordinates && featureData.coordinates.length > 0) {
            // Ensure polygon is closed (first == last)
            coordinates = [...featureData.coordinates];
            const first = coordinates[0];
            const last = coordinates[coordinates.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
                coordinates.push(first);
            }
        }
    } else if (featureData.type === 'buffer' || featureData.type === 'isochrone') {
        // For buffers/isochrones, we could add a highlight, but for now skip
        return;
    }
    
    if (!coordinates || coordinates.length < 2) {
        return;
    }
    
    // Add selection indicator source
    map.addSource('selected-feature-indicator', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: {
                type: featureData.type === 'polygon' ? 'Polygon' : 'LineString',
                coordinates: featureData.type === 'polygon' ? [coordinates] : coordinates
            }
        }
    });
    
    // Add selection indicator layer (green, 11px width, 50% opacity)
    // Layer order should be: green (bottom) → white stroke (middle) → blue route (top)
    if (featureData.type === 'polygon') {
        // For polygons, add fill + outline
        map.addLayer({
            id: 'selected-feature-indicator',
            type: 'fill',
            source: 'selected-feature-indicator',
            paint: {
                'fill-color': '#00ff00',
                'fill-opacity': 0.5
            }
        });
        
        // Add outline
        map.addLayer({
            id: 'selected-feature-indicator-outline',
            type: 'line',
            source: 'selected-feature-indicator',
            paint: {
                'line-color': '#00ff00',
                'line-width': 11,
                'line-opacity': 0.5
            }
        });
    } else {
        // For lines, add green overlay line at the bottom
        // Layer order should be: green (bottom) → white stroke (middle) → blue route (top)
        // Mapbox draws layers bottom-to-top in the order they're added
        // We need to insert green BEFORE the white stroke layer
        
        let beforeId = null;
        
        // Find the white stroke layer to insert green before it
        // This ensures: green (bottom) → white stroke (middle) → blue route (top)
        if (map.getLayer('route-stroke')) {
            // For routes, insert green before white stroke (route-stroke)
            // This creates: green → route-stroke → route
            beforeId = 'route-stroke';
        } else if (map.getLayer('route-line-stroke')) {
            // For direct lines, insert green before white stroke (route-line-stroke)
            // This creates: green → route-line-stroke → route-line
            beforeId = 'route-line-stroke';
        } else if (map.getLayer('route')) {
            // If no stroke layer exists, insert before blue route
            beforeId = 'route';
        } else if (map.getLayer('route-line')) {
            // If no stroke layer exists, insert before blue line
            beforeId = 'route-line';
        }
        
        // Add green layer, inserting it before the found layer
        // This ensures proper stacking: green (bottom) → white (middle) → blue (top)
        map.addLayer({
            id: 'selected-feature-indicator',
            type: 'line',
            source: 'selected-feature-indicator',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#00ff00',
                'line-width': 11,
                'line-opacity': 0.5
            }
        }, beforeId); // Insert before white stroke so order is: green → white → blue
    }
}

// Get all features for @feature command
export function getAllFeatures() {
    const allFeatures = [];
    
    // Lines (routes and direct lines)
    featureRegistry.lines.forEach((line, index) => {
        allFeatures.push({
            name: `Line ${index + 1}: ${line.name || 'Route'}`,
            type: 'line',
            id: line.id,
            coordinates: line.coordinates,
            description: `${line.type === 'route' ? 'Route' : 'Direct line'} with ${line.coordinates.length} points`
        });
    });
    
    // Markers
    featureRegistry.markers.forEach((marker, index) => {
        allFeatures.push({
            name: `Marker ${index + 1}: ${marker.name || 'Location'}`,
            type: 'marker',
            id: marker.id,
            coordinates: [marker.lngLat],
            description: `Location at ${marker.lngLat[1].toFixed(4)}, ${marker.lngLat[0].toFixed(4)}`
        });
    });
    
    // Buffers
    featureRegistry.buffers.forEach((buffer, index) => {
        allFeatures.push({
            name: `Buffer ${index + 1}: ${buffer.radius}km radius`,
            type: 'buffer',
            id: buffer.id,
            coordinates: buffer.center,
            description: `Buffer with ${buffer.radius}km radius`
        });
    });
    
    // Polygons
    featureRegistry.polygons.forEach((polygon, index) => {
        allFeatures.push({
            name: `Polygon ${index + 1}: ${polygon.name || 'Custom area'}`,
            type: 'polygon',
            id: polygon.id,
            coordinates: polygon.coordinates,
            description: `Polygon with ${polygon.coordinates.length} points`
        });
    });
    
    // Isochrones
    featureRegistry.isochrones.forEach((isochrone, index) => {
        allFeatures.push({
            name: `Isochrone ${index + 1}: ${isochrone.name || 'Reachable area'}`,
            type: 'isochrone',
            id: isochrone.id,
            coordinates: isochrone.center,
            description: `Isochrone with ${isochrone.contours || 1} contour(s)`
        });
    });
    
    // Sort by type (Lines → Markers → Buffers → Polygons → Isochrones), then by creation order
    const typeOrder = { line: 0, marker: 1, buffer: 2, polygon: 3, isochrone: 4 };
    allFeatures.sort((a, b) => {
        if (typeOrder[a.type] !== typeOrder[b.type]) {
            return typeOrder[a.type] - typeOrder[b.type];
        }
        return a.id.localeCompare(b.id); // Creation order
    });
    
    return allFeatures;
}

// Store current map features for restoration after style change
let storedFeatures = {
    buffers: null,
    routes: null,
    markers: [],
    animationState: false,
    terrainEnabled: false,
    isochrones: null,
    polygons: null
};

// Buffer animation state
let bufferAnimationState = {
    isAnimating: false,
    animationId: null,
    step: 0
};

// Dash array sequence for ant-line animation (based on Mapbox example)
const dashArraySequence = [
    [0, 4, 3],
    [0.5, 4, 2.5],
    [1, 4, 2],
    [1.5, 4, 1.5],
    [2, 4, 1],
    [2.5, 4, 0.5],
    [3, 4, 0],
    [0, 0.5, 3, 3.5],
    [0, 1, 3, 3],
    [0, 1.5, 3, 2.5],
    [0, 2, 3, 2],
    [0, 2.5, 3, 1.5],
    [0, 3, 3, 1],
    [0, 3.5, 3, 0.5]
];

// Store current map features before style change
export function storeMapFeatures(map) {
    storedFeatures.markers = [];
    storedFeatures.buffers = null;
    storedFeatures.routes = null;
    storedFeatures.animationState = bufferAnimationState.isAnimating; // Store animation state
    storedFeatures.terrainEnabled = map.getTerrain() !== null; // Store terrain state
    
    // Store markers (positions and numbers)
    currentMarkers.forEach((marker, index) => {
        const lngLat = marker.getLngLat();
        storedFeatures.markers.push({
            lngLat: [lngLat.lng, lngLat.lat],
            number: index + 1
        });
    });
    
    // Store buffer data
    if (map.getSource('buffer')) {
        const source = map.getSource('buffer');
        if (source._data) {
            storedFeatures.buffers = [{ 
                polygon: source._data.geometry.coordinates[0],
                center: source._data.geometry.coordinates[0][0],
                radius: source._data.properties?.radius || 5
            }];
        }
    }
    
    // Store multiple buffers
    const multipleBuffers = [];
    for (let i = 0; i < 10; i++) {
        const sourceId = `buffer-${i}`;
        if (map.getSource(sourceId)) {
            const source = map.getSource(sourceId);
            if (source._data) {
                multipleBuffers.push({
                    polygon: source._data.geometry.coordinates[0],
                    center: source._data.geometry.coordinates[0][0],
                    radius: source._data.properties?.radius || 5
                });
            }
        }
    }
    if (multipleBuffers.length > 0) {
        storedFeatures.buffers = multipleBuffers;
    }
    
    // Store route data
    if (map.getSource('route')) {
        const source = map.getSource('route');
        if (source._data) {
            storedFeatures.routes = {
                type: 'route',
                coordinates: source._data.geometry.coordinates
            };
        }
    }
    if (map.getSource('route-line')) {
        const source = map.getSource('route-line');
        if (source._data) {
            storedFeatures.routes = {
                type: 'line',
                coordinates: source._data.geometry.coordinates
            };
        }
    }
    
    // Store isochrone data
    const isochrones = [];
    for (let i = 0; i < 4; i++) {
        const sourceId = `isochrone-${i}`;
        if (map.getSource(sourceId)) {
            const source = map.getSource(sourceId);
            if (source._data) {
                isochrones.push(source._data);
            }
        }
    }
    if (isochrones.length > 0) {
        // Also store center coordinates from first isochrone label
        const firstLabelSource = map.getSource('isochrone-0-label');
        let centerCoordinates = null;
        if (firstLabelSource && firstLabelSource._data) {
            centerCoordinates = firstLabelSource._data.geometry.coordinates;
        }
        storedFeatures.isochrones = {
            features: isochrones,
            centerCoordinates: centerCoordinates
        };
    }
    
    // Store polygon data
    const polygons = [];
    for (let i = 0; i < 10; i++) {
        const sourceId = `polygon-${i}`;
        if (map.getSource(sourceId)) {
            const source = map.getSource(sourceId);
            if (source._data) {
                polygons.push({
                    coordinates: source._data.geometry.coordinates[0],
                    name: source._data.properties?.name || `Polygon ${i + 1}`
                });
            }
        }
    }
    if (polygons.length > 0) {
        storedFeatures.polygons = polygons;
    }
}

// Restore map features after style change
export function restoreMapFeatures(map) {
    // Wait for style to load
    map.once('style.load', () => {
        // Clear existing markers first to prevent duplicates
        currentMarkers.forEach(marker => marker.remove());
        currentMarkers = [];
        
        // Clear existing line markers
        currentLineMarkers.forEach(marker => marker.remove());
        currentLineMarkers = [];
        
        // Restore markers
        storedFeatures.markers.forEach(markerData => {
            const el = createCircleMarker(markerData.number);
            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat(markerData.lngLat)
                .addTo(map);
            currentMarkers.push(marker);
        });
        
        // Restore buffers
        if (storedFeatures.buffers) {
            // Clear any existing buffers first to prevent duplicates
            if (map.getSource('buffer')) {
                if (map.getLayer('buffer-stroke')) map.removeLayer('buffer-stroke');
                if (map.getLayer('buffer-stroke-background')) map.removeLayer('buffer-stroke-background');
                if (map.getLayer('buffer-fill')) map.removeLayer('buffer-fill');
                if (map.getLayer('buffer-label')) map.removeLayer('buffer-label');
                if (map.getSource('buffer-label')) map.removeSource('buffer-label');
                map.removeSource('buffer');
            }
            for (let i = 0; i < 10; i++) {
                const sourceId = `buffer-${i}`;
                if (map.getSource(sourceId)) {
                    if (map.getLayer(`${sourceId}-stroke`)) map.removeLayer(`${sourceId}-stroke`);
                    if (map.getLayer(`${sourceId}-stroke-background`)) map.removeLayer(`${sourceId}-stroke-background`);
                    if (map.getLayer(`${sourceId}-fill`)) map.removeLayer(`${sourceId}-fill`);
                    if (map.getLayer(`${sourceId}-label`)) map.removeLayer(`${sourceId}-label`);
                    if (map.getSource(`${sourceId}-label`)) map.removeSource(`${sourceId}-label`);
                    map.removeSource(sourceId);
                }
            }
            
            if (storedFeatures.buffers.length === 1) {
                const buffer = storedFeatures.buffers[0];
                // Extract center from polygon (first point)
                const center = buffer.polygon[0];
                const polygonWithoutLast = buffer.polygon.slice(0, -1); // Remove last duplicate point
                
                map.addSource('buffer', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [buffer.polygon]
                        }
                    }
                });
                
                map.addLayer({
                    id: 'buffer-fill',
                    type: 'fill',
                    source: 'buffer',
                    paint: {
                        'fill-color': '#089BDF',
                        'fill-opacity': 0.2
                    }
                });
                
                map.addLayer({
                    id: 'buffer-stroke-background',
                    type: 'line',
                    source: 'buffer',
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    paint: {
                        'line-color': '#089BDF',
                        'line-width': 3,
                        'line-opacity': 0.4
                    }
                });
                
                map.addLayer({
                    id: 'buffer-stroke',
                    type: 'line',
                    source: 'buffer',
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    paint: {
                        'line-color': '#089BDF',
                        'line-width': 3,
                        'line-opacity': 1,
                        'line-dasharray': [4, 2]
                    }
                });
                
                // Add center marker
                const el = createCircleMarker(1);
                const centerMarker = new mapboxgl.Marker({ element: el })
                    .setLngLat(center)
                    .addTo(map);
                currentMarkers.push(centerMarker);
                
                // Calculate area (π * r²) in km²
                const radius = buffer.radius || 5;
                const areaKm2 = Math.PI * radius * radius;
                
                // Add label source (point at center)
                map.addSource('buffer-label', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: center
                        },
                        properties: {
                            label: `${radius.toFixed(0)} km\n${areaKm2.toFixed(0)} km²`
                        }
                    }
                });
                
                // Add label layer
                map.addLayer({
                    id: 'buffer-label',
                    type: 'symbol',
                    source: 'buffer-label',
                    layout: {
                        'text-field': ['get', 'label'],
                        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                        'text-size': 12,
                        'text-anchor': 'center',
                        'text-justify': 'center'
                    },
                    paint: {
                        'text-color': '#ffffff',
                        'text-halo-color': '#089BDF',
                        'text-halo-width': 2
                    }
                });
            } else {
                // Multiple buffers
                storedFeatures.buffers.forEach((buffer, index) => {
                    const sourceId = `buffer-${index}`;
                    const center = buffer.polygon[0];
                    
                    map.addSource(sourceId, {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            geometry: {
                                type: 'Polygon',
                                coordinates: [buffer.polygon]
                            }
                        }
                    });
                    
                    map.addLayer({
                        id: `${sourceId}-fill`,
                        type: 'fill',
                        source: sourceId,
                        paint: {
                            'fill-color': '#089BDF',
                            'fill-opacity': 0.2
                        }
                    });
                    
                    map.addLayer({
                        id: `${sourceId}-stroke-background`,
                        type: 'line',
                        source: sourceId,
                        layout: {
                            'line-cap': 'round',
                            'line-join': 'round'
                        },
                        paint: {
                            'line-color': '#089BDF',
                            'line-width': 3,
                            'line-opacity': 0.4
                        }
                    });
                    
                    map.addLayer({
                        id: `${sourceId}-stroke`,
                        type: 'line',
                        source: sourceId,
                        layout: {
                            'line-cap': 'round',
                            'line-join': 'round'
                        },
                        paint: {
                            'line-color': '#089BDF',
                            'line-width': 3,
                            'line-opacity': 1,
                            'line-dasharray': [4, 2]
                        }
                    });
                    
                    const el = createCircleMarker(index + 1);
                    const centerMarker = new mapboxgl.Marker({ element: el })
                        .setLngLat(center)
                        .addTo(map);
                    currentMarkers.push(centerMarker);
                    
                    // Calculate area (π * r²) in km²
                    const radius = buffer.radius || 5;
                    const areaKm2 = Math.PI * radius * radius;
                    
                    // Add label source (point at center)
                    map.addSource(`${sourceId}-label`, {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: center
                            },
                            properties: {
                                label: `${radius.toFixed(0)} km\n${areaKm2.toFixed(0)} km²`
                            }
                        }
                    });
                    
                    // Add label layer
                    map.addLayer({
                        id: `${sourceId}-label`,
                        type: 'symbol',
                        source: `${sourceId}-label`,
                        layout: {
                            'text-field': ['get', 'label'],
                            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                            'text-size': 12,
                            'text-anchor': 'center',
                            'text-justify': 'center'
                        },
                        paint: {
                            'text-color': '#ffffff',
                            'text-halo-color': '#089BDF',
                            'text-halo-width': 2
                        }
                    });
                });
            }
        }
        
        // Restore routes
        if (storedFeatures.routes) {
            if (storedFeatures.routes.type === 'route') {
                map.addSource('route', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: storedFeatures.routes.coordinates
                        }
                    }
                });
                
                map.addLayer({
                    id: 'route-stroke',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    paint: {
                        'line-color': '#ffffff',
                        'line-width': 6,
                        'line-opacity': 0.8
                    }
                });
                
                map.addLayer({
                    id: 'route',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    paint: {
                        'line-color': '#089BDF',
                        'line-width': 4,
                        'line-opacity': 1
                    }
                });
            } else {
                // Simple line
                map.addSource('route-line', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: storedFeatures.routes.coordinates
                        }
                    }
                });
                
                map.addLayer({
                    id: 'route-line-stroke',
                    type: 'line',
                    source: 'route-line',
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    paint: {
                        'line-color': '#ffffff',
                        'line-width': 6,
                        'line-opacity': 0.8
                    }
                });
                
                map.addLayer({
                    id: 'route-line',
                    type: 'line',
                    source: 'route-line',
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    paint: {
                        'line-color': '#089BDF',
                        'line-width': 4,
                        'line-opacity': 1
                    }
                });
            }
        }
        
        // Restore animation state if it was on
        if (storedFeatures.animationState) {
            // Wait a bit for layers to be fully loaded
            setTimeout(() => {
                startBufferAnimation(map);
            }, 100);
        }
        
        // Restore terrain state if it was enabled
        if (storedFeatures.terrainEnabled) {
            // Add DEM source if it doesn't exist
            if (!map.getSource('mapbox-dem')) {
                map.addSource('mapbox-dem', {
                    type: 'raster-dem',
                    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                    tileSize: 256,
                    maxzoom: 14
                });
            }
            
            // Enable terrain
            map.setTerrain({
                source: 'mapbox-dem',
                exaggeration: 1.5
            });
        }
        
        // Restore isochrones if they were enabled
        if (storedFeatures.isochrones && storedFeatures.isochrones.features) {
            const { features, centerCoordinates } = storedFeatures.isochrones;
            if (centerCoordinates) {
                displayIsochroneOnMap({ features }, centerCoordinates, map);
            }
        }
        
        // Restore polygons if they were enabled
        if (storedFeatures.polygons && storedFeatures.polygons.length > 0) {
            displayPolygonOnMap(storedFeatures.polygons, map);
        }
    });
}

// Display coordinates on map (POINTS workflow)
export function displayCoordinatesOnMap(coordinatesString, map) {
    // Clear existing point markers
    currentMarkers.forEach(marker => marker.remove());
    currentMarkers = [];
    
    // Clear line if exists (points take precedence)
    if (map.getSource('route-line')) {
        if (map.getLayer('route-line-stroke')) {
            map.removeLayer('route-line-stroke');
        }
        if (map.getLayer('route-line')) {
            map.removeLayer('route-line');
        }
        map.removeSource('route-line');
    }
    if (map.getSource('route')) {
        if (map.getLayer('route-stroke')) {
            map.removeLayer('route-stroke');
        }
        if (map.getLayer('route')) {
            map.removeLayer('route');
        }
        map.removeSource('route');
    }
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers = [];
    
    // Parse coordinates string: "lat1,lon1 | lat2,lon2"
    const coordPairs = coordinatesString.split(' | ').map(coord => coord.trim());
    
    coordPairs.forEach((coordPair, index) => {
        const [lat, lon] = coordPair.split(',').map(Number);
        
        if (!isNaN(lat) && !isNaN(lon)) {
            // Create custom numbered marker (1-indexed for display)
            const el = createCircleMarker(index + 1);
            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([lon, lat])
                .addTo(map);
            
            currentMarkers.push(marker);
            
            // Center map on first location
            if (index === 0) {
                map.flyTo({
                    center: [lon, lat],
                    zoom: 15,
                    duration: 1500
                });
            }
        }
    });
    
    console.log(`Added ${coordPairs.length} marker(s) to map`);
    
    // Register markers in feature registry
    coordPairs.forEach((coordPair, index) => {
        const [lat, lon] = coordPair.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lon)) {
            registerFeature('markers', {
                lngLat: [lon, lat],
                name: `Marker ${index + 1}`
            });
        }
    });
}

// Display route on map (ROUTING workflow)
export function displayRouteOnMap(routeData, coordinates, map) {
    // Clear existing point markers (route takes precedence)
    currentMarkers.forEach(marker => marker.remove());
    currentMarkers = [];
    
    // Clear existing route if any
    if (map.getSource('route')) {
        if (map.getLayer('route-stroke')) {
            map.removeLayer('route-stroke');
        }
        if (map.getLayer('route')) {
            map.removeLayer('route');
        }
        map.removeSource('route');
    }
    if (map.getSource('route-line')) {
        if (map.getLayer('route-line-stroke')) {
            map.removeLayer('route-line-stroke');
        }
        if (map.getLayer('route-line')) {
            map.removeLayer('route-line');
        }
        map.removeSource('route-line');
    }
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers = [];
    
    if (!routeData || !routeData.geometry) {
        console.error('Invalid route data');
        return;
    }
    
    // Add route source
    map.addSource('route', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: routeData.geometry
        }
    });
    
    // Add white stroke layer (beneath the colored line)
    map.addLayer({
        id: 'route-stroke',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#ffffff',
            'line-width': 7, // Slightly thicker for stroke effect
            'line-opacity': 1
        }
    });
    
    // Add route layer (colored line on top)
    map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#089BDF',
            'line-width': 5,
            'line-opacity': 0.8
        }
    });
    
    // Add markers at waypoints (use custom numbered markers)
    coordinates.forEach((coord, index) => {
        // Number markers (1-indexed for display)
        const el = createCircleMarker(index + 1);
        // All markers use blue fill, keep border colors same
        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(coord)
            .addTo(map);
        currentLineMarkers.push(marker);
    });
    
    // Fit map to show entire route
    const bounds = routeData.geometry.coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
    }, new mapboxgl.LngLatBounds(routeData.geometry.coordinates[0], routeData.geometry.coordinates[0]));
    
    map.fitBounds(bounds, {
        padding: 50,
        duration: 1500
    });
    
    console.log(`Added route with ${coordinates.length} waypoints`);
    console.log(`Route distance: ${(routeData.distance / 1000).toFixed(2)} km`);
    console.log(`Route duration: ${(routeData.duration / 60).toFixed(1)} minutes`);
    
    // Register route in feature registry
    registerFeature('lines', {
        coordinates: routeData.geometry.coordinates,
        type: 'route',
        name: 'Route'
    });
}

// Display line/polyline on map (LINE workflow)
export function displayLineOnMap(coordinatesString, map) {
    // Clear existing point markers (line takes precedence)
    currentMarkers.forEach(marker => marker.remove());
    currentMarkers = [];
    
    // Clear existing line if any
    if (map.getSource('route-line')) {
        if (map.getLayer('route-line-stroke')) {
            map.removeLayer('route-line-stroke');
        }
        if (map.getLayer('route-line')) {
            map.removeLayer('route-line');
        }
        map.removeSource('route-line');
    }
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers = [];
    
    // Parse coordinates string: "lat1,lon1 | lat2,lon2 | lat3,lon3"
    const coordPairs = coordinatesString.split(' | ').map(coord => coord.trim());
    const coordinates = [];
    
    coordPairs.forEach((coordPair) => {
        const [lat, lon] = coordPair.split(',').map(Number);
        
        if (!isNaN(lat) && !isNaN(lon)) {
            coordinates.push([lon, lat]); // Mapbox format: [lon, lat]
        }
    });
    
    if (coordinates.length < 2) {
        console.log('Need at least 2 points for a line');
        return;
    }
    
    // Add line source
    map.addSource('route-line', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            }
        }
    });
    
    // Add white stroke layer (beneath the colored line)
    map.addLayer({
        id: 'route-line-stroke',
        type: 'line',
        source: 'route-line',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#ffffff',
            'line-width': 6, // Slightly thicker for stroke effect
            'line-opacity': 1
        }
    });
    
    // Add line layer (colored line on top)
    map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#089BDF',
            'line-width': 4,
            'line-opacity': 0.8
        }
    });
    
    // Add markers at each point (use custom numbered markers)
    coordinates.forEach((coord, index) => {
        // Number markers (1-indexed for display)
        const el = createCircleMarker(index + 1);
        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(coord)
            .addTo(map);
        currentLineMarkers.push(marker);
    });
    
    // Fit map to show entire line
    const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
    }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
    
    map.fitBounds(bounds, {
        padding: 50,
        duration: 1500
    });
    
    console.log(`Added line with ${coordinates.length} points`);
    
    // Register line in feature registry
    registerFeature('lines', {
        coordinates: coordinates,
        type: 'line',
        name: 'Direct line'
    });
}

// Display buffer/geofence on map (BUFFER workflow)
export function displayBufferOnMap(bufferData, map) {
    // Clear existing point markers (buffer takes precedence)
    currentMarkers.forEach(marker => marker.remove());
    currentMarkers = [];
    
    // Clear existing line if exists
    if (map.getSource('route-line')) {
        if (map.getLayer('route-line-stroke')) {
            map.removeLayer('route-line-stroke');
        }
        if (map.getLayer('route-line')) {
            map.removeLayer('route-line');
        }
        map.removeSource('route-line');
    }
    if (map.getSource('route')) {
        if (map.getLayer('route-stroke')) {
            map.removeLayer('route-stroke');
        }
        if (map.getLayer('route')) {
            map.removeLayer('route');
        }
        map.removeSource('route');
    }
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers = [];
    
    // Clear existing buffer if any
    if (map.getSource('buffer')) {
        if (map.getLayer('buffer-stroke')) {
            map.removeLayer('buffer-stroke');
        }
        if (map.getLayer('buffer-stroke-background')) {
            map.removeLayer('buffer-stroke-background');
        }
        if (map.getLayer('buffer-fill')) {
            map.removeLayer('buffer-fill');
        }
        if (map.getLayer('buffer-label')) {
            map.removeLayer('buffer-label');
        }
        if (map.getSource('buffer-label')) {
            map.removeSource('buffer-label');
        }
        map.removeSource('buffer');
    }
    
    if (!bufferData || !bufferData.polygon || bufferData.polygon.length === 0) {
        console.error('Invalid buffer data');
        return;
    }
    
    // Create polygon (close the circle by adding first point at end)
    const polygonCoords = [...bufferData.polygon, bufferData.polygon[0]];
    
    // Add buffer source
    map.addSource('buffer', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {
                radius: bufferData.radius
            },
            geometry: {
                type: 'Polygon',
                coordinates: [polygonCoords]
            }
        }
    });
    
    // Add fill layer (semi-transparent)
    map.addLayer({
        id: 'buffer-fill',
        type: 'fill',
        source: 'buffer',
        paint: {
            'fill-color': '#089BDF',
            'fill-opacity': 0.2 // Semi-transparent
        }
    });
    
    // Add background stroke layer (solid, fills gaps when dashed line animates)
    map.addLayer({
        id: 'buffer-stroke-background',
        type: 'line',
        source: 'buffer',
        layout: {
            'line-cap': 'round',
            'line-join': 'round'
        },
        paint: {
            'line-color': '#089BDF',
            'line-width': 3,
            'line-opacity': 0.4 // Semi-transparent background
        }
    });
    
    // Add stroke layer (dotted pattern, animated)
    map.addLayer({
        id: 'buffer-stroke',
        type: 'line',
        source: 'buffer',
        layout: {
            'line-cap': 'round',
            'line-join': 'round'
        },
        paint: {
            'line-color': '#089BDF',
            'line-width': 3,
            'line-opacity': 1,
            'line-dasharray': [4, 2] // Dotted pattern
        }
    });
    
    // Add center marker
    const el = createCircleMarker(1);
    const centerMarker = new mapboxgl.Marker({ element: el })
        .setLngLat(bufferData.center)
        .addTo(map);
    currentMarkers.push(centerMarker);
    
    // Calculate area (π * r²) in km²
    const areaKm2 = Math.PI * bufferData.radius * bufferData.radius;
    
    // Add label source (point at center)
    map.addSource('buffer-label', {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: bufferData.center
            },
            properties: {
                label: `${bufferData.radius.toFixed(0)} km\n${areaKm2.toFixed(0)} km²`
            }
        }
    });
    
    // Add label layer
    map.addLayer({
        id: 'buffer-label',
        type: 'symbol',
        source: 'buffer-label',
        layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-anchor': 'center',
            'text-justify': 'center'
        },
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#089BDF',
            'text-halo-width': 2
        }
    });
    
    // Fit map to show entire buffer
    const bounds = polygonCoords.reduce((bounds, coord) => {
        return bounds.extend(coord);
    }, new mapboxgl.LngLatBounds(bufferData.center, bufferData.center));
    
    map.fitBounds(bounds, {
        padding: 50,
        duration: 1500
    });
    
    console.log(`Added buffer with radius ${bufferData.radius.toFixed(2)} km`);
    console.log(`Center: ${bufferData.center[1]}, ${bufferData.center[0]}`);
    
    // Register buffer in feature registry
    registerFeature('buffers', {
        center: bufferData.center,
        radius: bufferData.radius,
        polygon: polygonCoords
    });
}

// Display multiple buffers/geofences on map (MULTIPLE BUFFER workflow)
export function displayMultipleBuffersOnMap(buffersArray, map) {
    // Clear existing point markers (buffers take precedence)
    currentMarkers.forEach(marker => marker.remove());
    currentMarkers = [];
    
    // Clear existing line if exists
    if (map.getSource('route-line')) {
        if (map.getLayer('route-line-stroke')) {
            map.removeLayer('route-line-stroke');
        }
        if (map.getLayer('route-line')) {
            map.removeLayer('route-line');
        }
        map.removeSource('route-line');
    }
    if (map.getSource('route')) {
        if (map.getLayer('route-stroke')) {
            map.removeLayer('route-stroke');
        }
        if (map.getLayer('route')) {
            map.removeLayer('route');
        }
        map.removeSource('route');
    }
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers = [];
    
    // Clear existing buffers if any
    for (let i = 0; i < 10; i++) { // Support up to 10 buffers
        const sourceId = `buffer-${i}`;
        if (map.getSource(sourceId)) {
            if (map.getLayer(`${sourceId}-stroke`)) {
                map.removeLayer(`${sourceId}-stroke`);
            }
            if (map.getLayer(`${sourceId}-stroke-background`)) {
                map.removeLayer(`${sourceId}-stroke-background`);
            }
            if (map.getLayer(`${sourceId}-fill`)) {
                map.removeLayer(`${sourceId}-fill`);
            }
            if (map.getLayer(`${sourceId}-label`)) {
                map.removeLayer(`${sourceId}-label`);
            }
            if (map.getSource(`${sourceId}-label`)) {
                map.removeSource(`${sourceId}-label`);
            }
            map.removeSource(sourceId);
        }
    }
    
    if (!buffersArray || buffersArray.length === 0) {
        console.error('Invalid buffer data');
        return;
    }
    
    // Add each buffer
    buffersArray.forEach((bufferData, index) => {
        if (!bufferData || !bufferData.polygon || bufferData.polygon.length === 0) {
            return;
        }
        
        const sourceId = `buffer-${index}`;
        
        // Create polygon (close the circle by adding first point at end)
        const polygonCoords = [...bufferData.polygon, bufferData.polygon[0]];
        
        // Add buffer source
        map.addSource(sourceId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {
                    radius: bufferData.radius
                },
                geometry: {
                    type: 'Polygon',
                    coordinates: [polygonCoords]
                }
            }
        });
        
        // Add fill layer (semi-transparent)
        map.addLayer({
            id: `${sourceId}-fill`,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': '#089BDF',
                'fill-opacity': 0.2 // Semi-transparent
            }
        });
        
        // Add background stroke layer (solid, fills gaps when dashed line animates)
        map.addLayer({
            id: `${sourceId}-stroke-background`,
            type: 'line',
            source: sourceId,
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#089BDF',
                'line-width': 3,
                'line-opacity': 0.4 // Semi-transparent background
            }
        });
        
        // Add stroke layer (dotted pattern, animated)
        map.addLayer({
            id: `${sourceId}-stroke`,
            type: 'line',
            source: sourceId,
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#089BDF',
                'line-width': 3,
                'line-opacity': 1,
                'line-dasharray': [4, 2] // Dotted pattern
            }
        });
        
        // Add center marker
        const el = createCircleMarker(index + 1);
        const centerMarker = new mapboxgl.Marker({ element: el })
            .setLngLat(bufferData.center)
            .addTo(map);
        currentMarkers.push(centerMarker);
        
        // Calculate area (π * r²) in km²
        const areaKm2 = Math.PI * bufferData.radius * bufferData.radius;
        
        // Add label source (point at center)
        map.addSource(`${sourceId}-label`, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: bufferData.center
                },
                properties: {
                    label: `${bufferData.radius.toFixed(0)} km\n${areaKm2.toFixed(0)} km²`
                }
            }
        });
        
        // Add label layer
        map.addLayer({
            id: `${sourceId}-label`,
            type: 'symbol',
            source: `${sourceId}-label`,
            layout: {
                'text-field': ['get', 'label'],
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                'text-size': 12,
                'text-anchor': 'center',
                'text-justify': 'center'
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#089BDF',
                'text-halo-width': 2
            }
        });
    });
    
    // Fit map to show all buffers
    let bounds = null;
    buffersArray.forEach((bufferData) => {
        const polygonCoords = [...bufferData.polygon, bufferData.polygon[0]];
        if (!bounds) {
            bounds = new mapboxgl.LngLatBounds(bufferData.center, bufferData.center);
        }
        polygonCoords.forEach(coord => {
            bounds.extend(coord);
        });
    });
    
    if (bounds) {
        map.fitBounds(bounds, {
            padding: 50,
            duration: 1500
        });
    }
    
    console.log(`Added ${buffersArray.length} buffer(s):`);
    buffersArray.forEach((buffer, index) => {
        console.log(`  Buffer ${index + 1}: radius ${buffer.radius.toFixed(2)} km`);
        
        // Register each buffer in feature registry
        registerFeature('buffers', {
            center: buffer.center,
            radius: buffer.radius,
            polygon: buffer.polygon
        });
    });
}

// Get all buffer stroke layers
function getBufferStrokeLayers(map) {
    const layers = [];
    
    // Check single buffer (only the animated stroke layer, not the background)
    if (map.getLayer('buffer-stroke')) {
        layers.push('buffer-stroke');
    }
    
    // Check multiple buffers (buffer-0-stroke to buffer-9-stroke, only animated layers)
    for (let i = 0; i < 10; i++) {
        const layerId = `buffer-${i}-stroke`;
        if (map.getLayer(layerId)) {
            layers.push(layerId);
        }
    }
    
    return layers;
}

// Buffer animation loop (based on Mapbox example)
function animateBufferLoop(map, timestamp) {
    if (!bufferAnimationState.isAnimating) {
        return;
    }
    
    // Update step based on timestamp (50ms per step = slower animation)
    const newStep = Math.floor((timestamp / 50) % dashArraySequence.length);
    
    // Only update if step changed
    if (newStep !== bufferAnimationState.step) {
        bufferAnimationState.step = newStep;
        
        // Get all buffer stroke layers
        const layers = getBufferStrokeLayers(map);
        
        // Update each layer's dash array
        layers.forEach(layerId => {
            try {
                map.setPaintProperty(
                    layerId,
                    'line-dasharray',
                    dashArraySequence[bufferAnimationState.step]
                );
            } catch (e) {
                // Layer might not exist yet, ignore
            }
        });
    }
    
    // Continue animation
    bufferAnimationState.animationId = requestAnimationFrame((ts) => animateBufferLoop(map, ts));
}

// Start buffer animation
export function startBufferAnimation(map) {
    if (bufferAnimationState.isAnimating) {
        return; // Already animating
    }
    
    bufferAnimationState.isAnimating = true;
    bufferAnimationState.step = 0;
    
    // Start animation loop
    animateBufferLoop(map, 0);
    
    console.log('✅ Buffer animation started');
}

// Stop buffer animation
export function stopBufferAnimation(map) {
    if (!bufferAnimationState.isAnimating) {
        return; // Not animating
    }
    
    bufferAnimationState.isAnimating = false;
    
    // Cancel animation frame
    if (bufferAnimationState.animationId) {
        cancelAnimationFrame(bufferAnimationState.animationId);
        bufferAnimationState.animationId = null;
    }
    
    // Reset dash arrays to default
    const layers = getBufferStrokeLayers(map);
    layers.forEach(layerId => {
        try {
            map.setPaintProperty(layerId, 'line-dasharray', [4, 2]);
        } catch (e) {
            // Layer might not exist, ignore
        }
    });
    
    bufferAnimationState.step = 0;
    console.log('⏹️ Buffer animation stopped');
}

// Toggle buffer animation
export function toggleBufferAnimation(map) {
    if (bufferAnimationState.isAnimating) {
        stopBufferAnimation(map);
        return { success: true, message: 'Buffer animation stopped', isAnimating: false };
    } else {
        startBufferAnimation(map);
        return { success: true, message: 'Buffer animation started', isAnimating: true };
    }
}

// Get buffer animation state
export function getBufferAnimationState() {
    return {
        isAnimating: bufferAnimationState.isAnimating
    };
}

// Display isochrone on map
export function displayIsochroneOnMap(isochroneData, centerCoordinates, map) {
    if (!isochroneData || !isochroneData.features || isochroneData.features.length === 0) {
        console.error('No isochrone data to display');
        return;
    }
    
    // Clear existing isochrones
    cleanIsochrones(map);
    
    // Add center marker
    const centerMarker = createCircleMarker(1);
    const marker = new mapboxgl.Marker({ element: centerMarker })
        .setLngLat(centerCoordinates)
        .addTo(map);
    currentMarkers.push(marker);
    
    // Color scheme for isochrones (from outer to inner)
    const defaultColors = [
        'ff6b6b', // Red
        '4ecdc4', // Teal
        '45b7d1', // Blue
        '96ceb4'  // Green
    ];
    
    // Display each isochrone contour
    isochroneData.features.forEach((feature, index) => {
        const sourceId = `isochrone-${index}`;
        const contour = feature.properties.contour;
        const metric = feature.properties.metric;
        const color = feature.properties.fillColor || feature.properties.fill || `#${defaultColors[index % defaultColors.length]}`;
        
        // Remove # from color if present
        const colorHex = color.replace('#', '');
        
        // Add source
        map.addSource(sourceId, {
            type: 'geojson',
            data: feature
        });
        
        // Add fill layer
        map.addLayer({
            id: `${sourceId}-fill`,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': color,
                'fill-opacity': 0.2
            }
        });
        
        // Add stroke layer
        map.addLayer({
            id: `${sourceId}-stroke`,
            type: 'line',
            source: sourceId,
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': color,
                'line-width': 3,
                'line-opacity': 0.8
            }
        });
        
        // Add label at center
        const labelText = metric === 'time' 
            ? `${contour} min` 
            : `${(contour / 1000).toFixed(1)} km`;
        
        map.addSource(`${sourceId}-label`, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: centerCoordinates
                },
                properties: {
                    label: labelText
                }
            }
        });
        
        map.addLayer({
            id: `${sourceId}-label`,
            type: 'symbol',
            source: `${sourceId}-label`,
            layout: {
                'text-field': ['get', 'label'],
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                'text-size': 12,
                'text-anchor': 'center',
                'text-justify': 'center'
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': color,
                'text-halo-width': 2
            }
        });
    });
    
    // Fit map to isochrone bounds
    const bounds = new mapboxgl.LngLatBounds();
    isochroneData.features.forEach(feature => {
        if (feature.geometry.type === 'Polygon') {
            feature.geometry.coordinates[0].forEach(coord => {
                bounds.extend(coord);
            });
        } else if (feature.geometry.type === 'LineString') {
            feature.geometry.coordinates.forEach(coord => {
                bounds.extend(coord);
            });
        }
    });
    
    map.fitBounds(bounds, {
        padding: 50,
        duration: 1000
    });
    
    console.log(`✅ Added ${isochroneData.features.length} isochrone contour(s)`);
    
    // Register isochrone in feature registry
    registerFeature('isochrones', {
        center: centerCoordinates,
        contours: isochroneData.features.length,
        features: isochroneData.features
    });
}

// Clean isochrones
export function cleanIsochrones(map) {
    let removed = 0;
    
    // Remove isochrone layers (max 4 contours)
    for (let i = 0; i < 4; i++) {
        const sourceId = `isochrone-${i}`;
        
        if (map.getSource(sourceId)) {
            // Remove layers
            if (map.getLayer(`${sourceId}-fill`)) {
                map.removeLayer(`${sourceId}-fill`);
            }
            if (map.getLayer(`${sourceId}-stroke`)) {
                map.removeLayer(`${sourceId}-stroke`);
            }
            if (map.getLayer(`${sourceId}-label`)) {
                map.removeLayer(`${sourceId}-label`);
            }
            
            // Remove sources
            if (map.getSource(`${sourceId}-label`)) {
                map.removeSource(`${sourceId}-label`);
            }
            map.removeSource(sourceId);
            removed++;
        }
    }
    
    if (removed > 0) {
        console.log(`✅ Removed ${removed} isochrone contour(s)`);
    }
    
    return { success: true, message: `Removed ${removed} isochrone contour(s)` };
}

// Display polygon(s) on map
export function displayPolygonOnMap(polygons, map) {
    if (!polygons || polygons.length === 0) {
        console.error('No polygon data to display');
        return;
    }
    
    // Clear existing polygons
    cleanPolygons(map);
    
    // Display each polygon
    polygons.forEach((polygon, index) => {
        const sourceId = `polygon-${index}`;
        
        // Create GeoJSON feature
        const feature = {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [polygon.coordinates]
            },
            properties: {
                name: polygon.name || `Polygon ${index + 1}`
            }
        };
        
        // Add source
        map.addSource(sourceId, {
            type: 'geojson',
            data: feature
        });
        
        // Add fill layer (same style as buffer - semi-transparent blue)
        map.addLayer({
            id: `${sourceId}-fill`,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': '#089BDF',
                'fill-opacity': 0.2
            }
        });
        
        // Add stroke layer (same style as buffer - blue with dotted stroke)
        map.addLayer({
            id: `${sourceId}-stroke`,
            type: 'line',
            source: sourceId,
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#089BDF',
                'line-width': 3,
                'line-opacity': 1,
                'line-dasharray': [4, 2]
            }
        });
    });
    
    // Fit map to polygon bounds
    const bounds = new mapboxgl.LngLatBounds();
    polygons.forEach(polygon => {
        polygon.coordinates.forEach(coord => {
            bounds.extend(coord);
        });
    });
    
    map.fitBounds(bounds, {
        padding: 50,
        duration: 1000
    });
    
    console.log(`✅ Added ${polygons.length} polygon(s)`);
    
    // Register polygons in feature registry
    polygons.forEach((polygon, index) => {
        registerFeature('polygons', {
            coordinates: polygon.coordinates,
            name: polygon.name || `Polygon ${index + 1}`
        });
    });
}

// Clean polygons
export function cleanPolygons(map) {
    let removed = 0;
    
    // Remove polygon layers (max 10 polygons)
    for (let i = 0; i < 10; i++) {
        const sourceId = `polygon-${i}`;
        
        if (map.getSource(sourceId)) {
            // Remove layers
            if (map.getLayer(`${sourceId}-fill`)) {
                map.removeLayer(`${sourceId}-fill`);
            }
            if (map.getLayer(`${sourceId}-stroke`)) {
                map.removeLayer(`${sourceId}-stroke`);
            }
            
            // Remove source
            map.removeSource(sourceId);
            removed++;
        }
    }
    
    if (removed > 0) {
        console.log(`✅ Removed ${removed} polygon(s)`);
    }
    
    return { success: true, message: `Removed ${removed} polygon(s)` };
}

