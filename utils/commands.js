import { currentMarkers, currentLineMarkers, storeMapFeatures, restoreMapFeatures, toggleBufferAnimation, getBufferAnimationState, stopBufferAnimation, cleanIsochrones, cleanPolygons, getAllFeatures, displaySelectionIndicator, clearSelectionIndicator } from './mapDisplay.js';
import { createUserMarker } from './markers.js';
import { cleanElevationProfile } from './elevationDisplay.js';

// Default map settings
const DEFAULT_CENTER = [-74.006, 40.7128]; // New York
const DEFAULT_ZOOM = 12;

// Command registry with aliases and shortcuts
const commands = {
    // Clean commands
    'clean': {
        aliases: ['cl', 'clear'],
        description: 'REMOVE ALL FEATURES FROM MAP',
        execute: (map) => cleanAll(map)
    },
    'clean markers': {
        aliases: ['cl markers', 'clear markers'],
        description: 'REMOVE ALL MARKERS',
        execute: (map) => cleanMarkers(map)
    },
    'clean lines': {
        aliases: ['cl lines', 'clear lines'],
        description: 'REMOVE ALL LINES AND ROUTES',
        execute: (map) => cleanLines(map)
    },
    'clean buffers': {
        aliases: ['cl buffers', 'clear buffers'],
        description: 'REMOVE ALL BUFFERS AND GEOFENCES',
        execute: (map) => cleanBuffers(map)
    },
    'clean polygons': {
        aliases: ['cl polygons', 'clear polygons'],
        description: 'REMOVE ALL POLYGONS',
        execute: (map) => cleanPolygons(map)
    },
    'clean elevation profile': {
        aliases: ['cl elevation', 'clear elevation', 'cl elevation profile', 'clear elevation profile'],
        description: 'REMOVE ELEVATION PROFILE CHART AND LINE',
        execute: (map) => cleanElevationProfileWithLine(map)
    },
    
    // Reset commands
    'reset': {
        aliases: ['rs', 'home'],
        description: 'RESET MAP TO DEFAULT VIEW',
        execute: (map) => resetMap(map)
    },
    'fresh': {
        aliases: ['f'],
        description: 'CLEAR ALL FEATURES AND RESET MAP',
        execute: (map) => {
            cleanAll(map);
            resetMap(map);
            return { success: true, message: 'Map cleaned and reset to default view' };
        }
    },
    
    // Help & Info
    'help': {
        aliases: ['h', 'commands', 'cmds'],
        description: 'SHOW ALL AVAILABLE COMMANDS',
        execute: () => showHelp()
    },
    'info': {
        aliases: ['i'],
        description: 'SHOW MAP STATUS AND FEATURE COUNTS',
        execute: (map) => showMapInfo(map)
    },
    
    // Style commands
    'dark': {
        aliases: ['d'],
        description: 'SWITCH TO DARK MAP STYLE',
        execute: (map) => setMapStyle(map, 'mapbox://styles/mapbox/dark-v11')
    },
    'light': {
        aliases: ['l'],
        description: 'SWITCH TO LIGHT MAP STYLE',
        execute: (map) => setMapStyle(map, 'mapbox://styles/mapbox/light-v11')
    },
    'satellite': {
        aliases: ['sat'],
        description: 'SWITCH TO SATELLITE MAP STYLE',
        execute: (map) => setMapStyle(map, 'mapbox://styles/mapbox/satellite-v9')
    },
    'streets': {
        aliases: ['street', 's'],
        description: 'SWITCH TO STREETS MAP STYLE',
        execute: (map) => setMapStyle(map, 'mapbox://styles/mapbox/streets-v12')
    },
    'outdoors': {
        aliases: ['outdoor', 'o'],
        description: 'SWITCH TO OUTDOORS MAP STYLE',
        execute: (map) => setMapStyle(map, 'mapbox://styles/mapbox/outdoors-v12')
    },
    'navigation day': {
        aliases: ['nav day', 'navd', 'nd'],
        description: 'SWITCH TO NAVIGATION DAY STYLE',
        execute: (map) => setMapStyle(map, 'mapbox://styles/mapbox/navigation-day-v1')
    },
    'navigation night': {
        aliases: ['nav night', 'navn', 'nn'],
        description: 'SWITCH TO NAVIGATION NIGHT STYLE',
        execute: (map) => setMapStyle(map, 'mapbox://styles/mapbox/navigation-night-v1')
    },
    
    // Terrain commands
    'terrain': {
        aliases: ['t', '3d'],
        description: 'TOGGLE 3D TERRAIN ELEVATION',
        execute: (map) => toggleTerrain(map)
    },
    
    // Zoom commands
    'zoom in': {
        aliases: ['zi', 'zoom+'],
        description: 'ZOOM IN BY 2 LEVELS',
        execute: (map) => zoomMap(map, 'in')
    },
    'zoom out': {
        aliases: ['zo', 'zoom-'],
        description: 'ZOOM OUT BY 2 LEVELS',
        execute: (map) => zoomMap(map, 'out')
    },
    'fit': {
        aliases: ['fit bounds', 'fb'],
        description: 'FIT MAP TO SHOW ALL FEATURES',
        execute: (map) => fitToFeatures(map)
    },
    'zoom': {
        aliases: ['z'],
        description: 'SET ZOOM LEVEL (EXAMPLE: @ZOOM 10)',
        execute: (map, args) => setZoomLevel(map, args)
    },
    
    // Location commands
    'center': {
        aliases: ['c'],
        description: 'CENTER MAP ON COORDINATES',
        execute: (map, args) => centerMap(map, args)
    },
    'copy coordinates': {
        aliases: ['copy coords', 'cc'],
        description: 'COPY MAP CENTER COORDINATES',
        execute: (map) => copyCoordinates(map)
    },
    'my location': {
        aliases: ['here', 'location', 'loc'],
        description: 'CENTER MAP ON YOUR LOCATION',
        execute: (map) => centerOnUserLocation(map)
    },
    
    // View commands
    'fullscreen': {
        aliases: ['fs', 'full'],
        description: 'TOGGLE FULLSCREEN MODE',
        execute: () => toggleFullscreen()
    },
    
    // Animation commands
    'animate buffers': {
        aliases: ['ab', 'animate buffer', 'abuffers'],
        description: 'TOGGLE ANIMATED BUFFER STROKES',
        execute: (map) => animateBuffers(map)
    }
};

// Clean all features
function cleanAll(map) {
    // Remove all markers
    currentMarkers.forEach(marker => marker.remove());
    currentMarkers.length = 0;
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers.length = 0;
    
    // Remove user location marker if exists
    if (window.userLocationMarker) {
        window.userLocationMarker.remove();
        window.userLocationMarker = null;
    }
    
    // Remove route sources
    if (map.getSource('route')) {
        if (map.getLayer('route-stroke')) map.removeLayer('route-stroke');
        if (map.getLayer('route')) map.removeLayer('route');
        map.removeSource('route');
    }
    
    // Remove route-line sources
    if (map.getSource('route-line')) {
        if (map.getLayer('route-line-stroke')) map.removeLayer('route-line-stroke');
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        map.removeSource('route-line');
    }
    
    // Remove single buffer
    if (map.getSource('buffer')) {
        if (map.getLayer('buffer-stroke')) map.removeLayer('buffer-stroke');
        if (map.getLayer('buffer-stroke-background')) map.removeLayer('buffer-stroke-background');
        if (map.getLayer('buffer-fill')) map.removeLayer('buffer-fill');
        map.removeSource('buffer');
    }
    
    // Remove multiple buffers (buffer-0 to buffer-9)
    for (let i = 0; i < 10; i++) {
        const sourceId = `buffer-${i}`;
        if (map.getSource(sourceId)) {
            if (map.getLayer(`${sourceId}-stroke`)) map.removeLayer(`${sourceId}-stroke`);
            if (map.getLayer(`${sourceId}-stroke-background`)) map.removeLayer(`${sourceId}-stroke-background`);
            if (map.getLayer(`${sourceId}-fill`)) map.removeLayer(`${sourceId}-fill`);
            map.removeSource(sourceId);
        }
    }
    
    // Remove isochrones
    cleanIsochrones(map);
    
    // Remove polygons
    cleanPolygons(map);
    
    // Remove elevation profile
    cleanElevationProfile();
    
    // Clear selection indicator
    clearSelectionIndicator(map);
    
    console.log('✅ All features cleaned');
    return { success: true, message: 'All features cleaned' };
}

// Clean only markers
function cleanMarkers(map) {
    let markerCount = currentMarkers.length + currentLineMarkers.length;
    
    currentMarkers.forEach(marker => marker.remove());
    currentMarkers.length = 0;
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers.length = 0;
    
    // Also remove user location marker if it exists
    if (window.userLocationMarker) {
        window.userLocationMarker.remove();
        window.userLocationMarker = null;
        markerCount++;
    }
    
    console.log(`✅ Removed ${markerCount} marker(s)`);
    return { success: true, message: `Removed ${markerCount} marker(s)` };
}

// Clean elevation profile and its associated line
function cleanElevationProfileWithLine(map) {
    let removed = 0;
    
    // Remove elevation profile marker
    cleanElevationProfile();
    
    // Remove the line that was used for elevation (if it exists)
    // Check if it's a route or route-line
    if (map.getSource('route')) {
        if (map.getLayer('route-stroke')) map.removeLayer('route-stroke');
        if (map.getLayer('route')) map.removeLayer('route');
        map.removeSource('route');
        removed++;
    }
    
    if (map.getSource('route-line')) {
        if (map.getLayer('route-line-stroke')) map.removeLayer('route-line-stroke');
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        map.removeSource('route-line');
        removed++;
    }
    
    // Remove line markers
    const lineMarkerCount = currentLineMarkers.length;
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers.length = 0;
    
    console.log(`✅ Removed elevation profile and ${removed} line(s)`);
    return { success: true, message: `Removed elevation profile and ${removed} line(s)` };
}

// Clean only lines and routes
function cleanLines(map) {
    let removed = 0;
    
    // Remove route
    if (map.getSource('route')) {
        if (map.getLayer('route-stroke')) map.removeLayer('route-stroke');
        if (map.getLayer('route')) map.removeLayer('route');
        map.removeSource('route');
        removed++;
    }
    
    // Remove route-line
    if (map.getSource('route-line')) {
        if (map.getLayer('route-line-stroke')) map.removeLayer('route-line-stroke');
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        map.removeSource('route-line');
        removed++;
    }
    
    // Remove line markers
    const lineMarkerCount = currentLineMarkers.length;
    currentLineMarkers.forEach(marker => marker.remove());
    currentLineMarkers.length = 0;
    
    console.log(`✅ Removed ${removed} line/route(s) and ${lineMarkerCount} marker(s)`);
    return { success: true, message: `Removed ${removed} line/route(s)` };
}

// Clean only buffers
function cleanBuffers(map) {
    // Stop animation if running
    stopBufferAnimation(map);
    
    let removed = 0;
    
    // Remove single buffer
    if (map.getSource('buffer')) {
        if (map.getLayer('buffer-stroke')) map.removeLayer('buffer-stroke');
        if (map.getLayer('buffer-stroke-background')) map.removeLayer('buffer-stroke-background');
        if (map.getLayer('buffer-fill')) map.removeLayer('buffer-fill');
        if (map.getLayer('buffer-label')) map.removeLayer('buffer-label');
        if (map.getSource('buffer-label')) map.removeSource('buffer-label');
        map.removeSource('buffer');
        removed++;
    }
    
    // Remove multiple buffers
    for (let i = 0; i < 10; i++) {
        const sourceId = `buffer-${i}`;
        if (map.getSource(sourceId)) {
            if (map.getLayer(`${sourceId}-stroke`)) map.removeLayer(`${sourceId}-stroke`);
            if (map.getLayer(`${sourceId}-stroke-background`)) map.removeLayer(`${sourceId}-stroke-background`);
            if (map.getLayer(`${sourceId}-fill`)) map.removeLayer(`${sourceId}-fill`);
            if (map.getLayer(`${sourceId}-label`)) map.removeLayer(`${sourceId}-label`);
            if (map.getSource(`${sourceId}-label`)) map.removeSource(`${sourceId}-label`);
            map.removeSource(sourceId);
            removed++;
        }
    }
    
    console.log(`✅ Removed ${removed} buffer(s)`);
    return { success: true, message: `Removed ${removed} buffer(s)` };
}

// Reset map view
function resetMap(map) {
    map.flyTo({
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        duration: 1500
    });
    
    console.log(`✅ Map reset to default view (${DEFAULT_CENTER[1]}, ${DEFAULT_CENTER[0]}, zoom: ${DEFAULT_ZOOM})`);
    return { success: true, message: 'Map reset to default view' };
}

// Show help
function showHelp() {
    console.log('\n📋 Available Commands:\n');
    
    Object.entries(commands).forEach(([name, cmd]) => {
        const aliases = cmd.aliases.join(', ');
        console.log(`  @${name}${aliases ? ` (or @${aliases})` : ''}`);
        console.log(`    → ${cmd.description}\n`);
    });
    
    return { success: true, message: 'Help displayed in console' };
}

// Show map info
function showMapInfo(map) {
    const center = map.getCenter();
    const zoom = map.getZoom().toFixed(2);
    const markerCount = currentMarkers.length + currentLineMarkers.length;
    
    // Count sources
    let lineCount = 0;
    let bufferCount = 0;
    
    if (map.getSource('route')) lineCount++;
    if (map.getSource('route-line')) lineCount++;
    
    if (map.getSource('buffer')) bufferCount++;
    for (let i = 0; i < 10; i++) {
        if (map.getSource(`buffer-${i}`)) bufferCount++;
    }
    
    console.log('\n📍 Map Information:');
    console.log(`  Center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
    console.log(`  Zoom: ${zoom}`);
    console.log(`  Markers: ${markerCount}`);
    console.log(`  Lines/Routes: ${lineCount}`);
    console.log(`  Buffers: ${bufferCount}\n`);
    
    return { 
        success: true, 
        message: `Map info: Center (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}), Zoom ${zoom}, ${markerCount} markers, ${lineCount} lines, ${bufferCount} buffers` 
    };
}

// Toggle terrain
function toggleTerrain(map) {
    // Wait for style to load if it's still loading
    if (!map.isStyleLoaded()) {
        map.once('style.load', () => toggleTerrain(map));
        return { success: true, message: 'Waiting for style to load...' };
    }
    
    // Check current terrain state
    const terrainEnabled = map.getTerrain() !== null;
    
    if (!terrainEnabled) {
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
        
        // Get current camera state
        const currentPitch = map.getPitch();
        const currentBearing = map.getBearing();
        const currentZoom = map.getZoom();
        const currentCenter = map.getCenter();
        
        // Calculate new bearing (flip 180 degrees)
        let newBearing = currentBearing + 180;
        // Normalize to 0-360 range
        if (newBearing >= 360) newBearing -= 360;
        if (newBearing < 0) newBearing += 360;
        
        // Animate camera for terrain enabled
        map.flyTo({
            pitch: 45,
            bearing: newBearing,
            zoom: Math.max(currentZoom - 2, 0), // Zoom out 2 levels, but not below 0
            center: currentCenter,
            duration: 3000,
            essential: true
        });
        
        console.log('✅ Terrain enabled');
        return { success: true, message: 'Terrain enabled' };
    } else {
        // Disable terrain
        map.setTerrain(null);
        
        // Get current camera state
        const currentPitch = map.getPitch();
        const currentZoom = map.getZoom();
        const currentCenter = map.getCenter();
        
        // Animate camera for terrain disabled
        // Only animate pitch if it's not already 0
        const flyToOptions = {
            bearing: 0, // North up
            zoom: DEFAULT_ZOOM,
            center: currentCenter,
            duration: 2000,
            essential: true
        };
        
        // Only add pitch if not already 0
        if (currentPitch !== 0) {
            flyToOptions.pitch = 0;
        }
        
        map.flyTo(flyToOptions);
        
        console.log('✅ Terrain disabled');
        return { success: true, message: 'Terrain disabled' };
    }
}

// Set map style
function setMapStyle(map, styleUrl) {
    // Store current features before style change
    storeMapFeatures(map);
    
    // Change style
    map.setStyle(styleUrl);
    
    // restoreMapFeatures already waits for style.load event internally
    restoreMapFeatures(map);
    
    const styleName = styleUrl.includes('dark') ? 'dark' : 
                     styleUrl.includes('light') ? 'light' : 
                     styleUrl.includes('satellite') ? 'satellite' :
                     styleUrl.includes('streets') ? 'streets' :
                     styleUrl.includes('outdoors') ? 'outdoors' :
                     styleUrl.includes('navigation-day') ? 'navigation day' :
                     styleUrl.includes('navigation-night') ? 'navigation night' : 'unknown';
    
    console.log(`✅ Map style changed to ${styleName}`);
    return { success: true, message: `Map style changed to ${styleName}` };
}

// Zoom map
function zoomMap(map, direction) {
    const currentZoom = map.getZoom();
    const newZoom = direction === 'in' ? currentZoom + 2 : currentZoom - 2;
    const clampedZoom = Math.max(0, Math.min(22, newZoom));
    
    map.flyTo({
        zoom: clampedZoom,
        duration: 1000
    });
    
    console.log(`✅ Zoomed ${direction} from ${currentZoom.toFixed(2)} to ${clampedZoom.toFixed(2)}`);
    return { success: true, message: `Zoomed ${direction} to ${clampedZoom.toFixed(2)}` };
}

// Fit map to show all features
function fitToFeatures(map) {
    let bounds = null;
    
    // Collect all marker coordinates
    const allMarkers = [...currentMarkers, ...currentLineMarkers];
    allMarkers.forEach(marker => {
        const lngLat = marker.getLngLat();
        if (!bounds) {
            bounds = new mapboxgl.LngLatBounds(lngLat, lngLat);
        } else {
            bounds.extend(lngLat);
        }
    });
    
    // Collect route coordinates
    if (map.getSource('route')) {
        const routeData = map.getSource('route')._data;
        if (routeData && routeData.geometry && routeData.geometry.coordinates) {
            routeData.geometry.coordinates.forEach(coord => {
                if (!bounds) {
                    bounds = new mapboxgl.LngLatBounds(coord, coord);
                } else {
                    bounds.extend(coord);
                }
            });
        }
    }
    
    // Collect line coordinates
    if (map.getSource('route-line')) {
        const lineData = map.getSource('route-line')._data;
        if (lineData && lineData.geometry && lineData.geometry.coordinates) {
            lineData.geometry.coordinates.forEach(coord => {
                if (!bounds) {
                    bounds = new mapboxgl.LngLatBounds(coord, coord);
                } else {
                    bounds.extend(coord);
                }
            });
        }
    }
    
    // Collect buffer coordinates
    if (map.getSource('buffer')) {
        const bufferData = map.getSource('buffer')._data;
        if (bufferData && bufferData.geometry && bufferData.geometry.coordinates) {
            bufferData.geometry.coordinates[0].forEach(coord => {
                if (!bounds) {
                    bounds = new mapboxgl.LngLatBounds(coord, coord);
                } else {
                    bounds.extend(coord);
                }
            });
        }
    }
    
    // Collect multiple buffer coordinates
    for (let i = 0; i < 10; i++) {
        const sourceId = `buffer-${i}`;
        if (map.getSource(sourceId)) {
            const bufferData = map.getSource(sourceId)._data;
            if (bufferData && bufferData.geometry && bufferData.geometry.coordinates) {
                bufferData.geometry.coordinates[0].forEach(coord => {
                    if (!bounds) {
                        bounds = new mapboxgl.LngLatBounds(coord, coord);
                    } else {
                        bounds.extend(coord);
                    }
                });
            }
        }
    }
    
    if (bounds) {
        map.fitBounds(bounds, {
            padding: 50,
            duration: 1500
        });
        console.log('✅ Map fitted to show all features');
        return { success: true, message: 'Map fitted to show all features' };
    } else {
        console.log('⚠️ No features to fit to');
        return { success: false, message: 'No features to fit to' };
    }
}

// Set specific zoom level
function setZoomLevel(map, args) {
    if (args.length === 0) {
        console.log('❌ Please provide a zoom level (e.g., @zoom 10)');
        return { success: false, message: 'Please provide a zoom level' };
    }
    
    const zoom = parseFloat(args[0]);
    if (isNaN(zoom) || zoom < 0 || zoom > 22) {
        console.log('❌ Invalid zoom level. Must be between 0 and 22');
        return { success: false, message: 'Invalid zoom level (0-22)' };
    }
    
    map.flyTo({
        zoom: zoom,
        duration: 1000
    });
    
    console.log(`✅ Zoom set to ${zoom}`);
    return { success: true, message: `Zoom set to ${zoom}` };
}

// Center map on coordinates
function centerMap(map, args) {
    if (args.length === 0) {
        console.log('❌ Please provide coordinates (e.g., @center 40.7128,-74.006)');
        return { success: false, message: 'Please provide coordinates' };
    }
    
    const coords = args[0].split(',');
    if (coords.length !== 2) {
        console.log('❌ Invalid coordinates format. Use: lat,lon');
        return { success: false, message: 'Invalid coordinates format (use: lat,lon)' };
    }
    
    const lat = parseFloat(coords[0].trim());
    const lon = parseFloat(coords[1].trim());
    
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        console.log('❌ Invalid coordinates. Lat: -90 to 90, Lon: -180 to 180');
        return { success: false, message: 'Invalid coordinates' };
    }
    
    map.flyTo({
        center: [lon, lat],
        duration: 1500
    });
    
    console.log(`✅ Map centered on ${lat}, ${lon}`);
    return { success: true, message: `Map centered on ${lat}, ${lon}` };
}

// Copy coordinates to clipboard
function copyCoordinates(map) {
    const center = map.getCenter();
    const coords = `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;
    
    navigator.clipboard.writeText(coords).then(() => {
        console.log(`✅ Coordinates copied to clipboard: ${coords}`);
    }).catch(err => {
        console.error('❌ Failed to copy coordinates:', err);
        return { success: false, message: 'Failed to copy coordinates' };
    });
    
    return { success: true, message: `Coordinates copied: ${coords}` };
}

// Center on user's location
function centerOnUserLocation(map) {
    if (!navigator.geolocation) {
        console.error('❌ Geolocation is not supported by this browser');
        return { success: false, message: 'Geolocation not supported' };
    }
    
    // Check if running on HTTPS or local network (for development)
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     /^192\.168\./.test(window.location.hostname) || // Local network IPs
                     /^10\./.test(window.location.hostname) || // Local network IPs
                     /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname); // Local network IPs
    
    if (!isSecure && window.location.protocol !== 'https:') {
        console.warn('⚠️ Geolocation may not work on mobile without HTTPS. Consider using HTTPS for production.');
    }
    
    console.log('📍 Requesting user location...');
    
    // Mobile-friendly options
    const options = {
        enableHighAccuracy: true, // Use GPS if available
        timeout: 15000, // Increased timeout for mobile
        maximumAge: 60000 // Accept cached location up to 1 minute old
    };
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            console.log(`✅ Location found: ${lat.toFixed(6)}, ${lon.toFixed(6)} (accuracy: ${accuracy.toFixed(0)}m)`);
            
            // Center map on user location
            map.flyTo({
                center: [lon, lat],
                zoom: 15,
                duration: 1500
            });
            
            // Add marker at user location
            // Remove existing user location marker if any
            if (window.userLocationMarker) {
                window.userLocationMarker.remove();
            }
            
            // Create custom marker for user location (same style as numbered markers, with user icon)
            const el = createUserMarker();
            
            // Store marker globally
            window.userLocationMarker = new mapboxgl.Marker({ element: el })
                .setLngLat([lon, lat])
                .addTo(map);
            
            return { success: true, message: `Centered on your location: ${lat.toFixed(6)}, ${lon.toFixed(6)}` };
        },
        (error) => {
            let errorMessage = 'Failed to get location';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location access denied. Please enable location permissions in your browser settings.';
                    console.error('❌ PERMISSION_DENIED: User denied location access');
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information unavailable. Please check your GPS/network settings.';
                    console.error('❌ POSITION_UNAVAILABLE: Location unavailable');
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out. Please try again.';
                    console.error('❌ TIMEOUT: Location request timed out');
                    break;
                default:
                    console.error('❌ Unknown error:', error);
            }
            console.error(`❌ ${errorMessage}`);
            alert(errorMessage); // Show alert on mobile so user sees the error
            return { success: false, message: errorMessage };
        },
        options
    );
    
    return { success: true, message: 'Requesting location...' };
}

// Toggle fullscreen
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            console.log('✅ Entered fullscreen mode');
        }).catch(err => {
            console.error('❌ Failed to enter fullscreen:', err);
            return { success: false, message: 'Failed to enter fullscreen' };
        });
        return { success: true, message: 'Entered fullscreen mode' };
    } else {
        document.exitFullscreen().then(() => {
            console.log('✅ Exited fullscreen mode');
        }).catch(err => {
            console.error('❌ Failed to exit fullscreen:', err);
            return { success: false, message: 'Failed to exit fullscreen' };
        });
        return { success: true, message: 'Exited fullscreen mode' };
    }
}

// Toggle buffer animation
function animateBuffers(map) {
    const result = toggleBufferAnimation(map);
    
    if (result.isAnimating) {
        console.log('🎬 Buffer animation: ON');
    } else {
        console.log('⏹️ Buffer animation: OFF');
    }
    
    return result;
}

// Parse command from user message
function parseCommand(message) {
    // Remove @ symbol and trim
    const cmd = message.replace(/^@/, '').trim().toLowerCase();
    
    // Try exact match first
    if (commands[cmd]) {
        return { command: cmd, args: [] };
    }
    
    // Try to match with aliases
    for (const [name, cmdData] of Object.entries(commands)) {
        if (cmdData.aliases.includes(cmd)) {
            return { command: name, args: [] };
        }
        
        // Check if command starts with name and has args
        if (cmd.startsWith(name)) {
            const args = cmd.substring(name.length).trim().split(/\s+/);
            return { command: name, args };
        }
        
        // Check if command starts with alias and has args
        for (const alias of cmdData.aliases) {
            if (cmd.startsWith(alias)) {
                const args = cmd.substring(alias.length).trim().split(/\s+/);
                return { command: name, args };
            }
        }
    }
    
    return null;
}

// Handle command execution
export function handleCommand(message, map) {
    const parsed = parseCommand(message);
    
    if (!parsed) {
        console.log(`❌ Unknown command: ${message}`);
        console.log('💡 Type @help to see all available commands');
        return { success: false, message: `Unknown command: ${message}` };
    }
    
    const { command, args } = parsed;
    const cmdData = commands[command];
    
    if (!cmdData) {
        console.log(`❌ Command not found: ${command}`);
        return { success: false, message: `Command not found: ${command}` };
    }
    
    try {
        const result = cmdData.execute(map, args);
        return result || { success: true, message: `Command executed: ${command}` };
    } catch (error) {
        console.error(`❌ Error executing command ${command}:`, error);
        return { success: false, message: `Error: ${error.message}` };
    }
}

// Check if message is a command
export function isCommand(message) {
    return message.trim().startsWith('@');
}

// Get all commands for autocomplete
export function getAllCommands() {
    const allCommands = [];
    
    Object.entries(commands).forEach(([name, cmd]) => {
        allCommands.push({
            name: name,
            aliases: cmd.aliases,
            description: cmd.description,
            fullCommand: `@${name}`,
            shortcuts: cmd.aliases.map(alias => `@${alias}`)
        });
    });
    
    return allCommands;
}

// Store selected feature globally
let selectedFeature = null;

// Set selected feature (for elevation agent)
export function setSelectedFeature(featureId, map) {
    const features = getAllFeatures();
    selectedFeature = features.find(f => f.id === featureId);
    
    // Display visual indicator on map
    if (selectedFeature && map) {
        displaySelectionIndicator(selectedFeature, map);
    } else if (!selectedFeature && map) {
        // Clear indicator if no feature selected
        clearSelectionIndicator(map);
    }
    
    return selectedFeature;
}

// Get selected feature
export function getSelectedFeature() {
    return selectedFeature;
}

// Search commands for autocomplete
export function searchCommands(query) {
    const searchTerm = query.replace(/^@/, '').toLowerCase().trim();
    
    // Check if user is looking for features (full match or starts with "feature ")
    if (searchTerm === 'feature' || searchTerm.startsWith('feature ')) {
        const features = getAllFeatures();
        
        if (features.length === 0) {
            return [{
                name: 'No features',
                aliases: [],
                description: 'No features on map. Add a line, marker, or buffer first.',
                fullCommand: '@feature',
                shortcuts: [],
                isFeature: false,
                isFeatureCommand: false
            }];
        }
        
        // Filter features if user typed more (e.g., "@feature line")
        const filter = searchTerm.replace('feature', '').trim();
        const filtered = filter ? 
            features.filter(f => f.type.includes(filter) || f.name.toLowerCase().includes(filter)) :
            features;
        
        return filtered.map(feature => ({
            name: feature.name,
            aliases: [],
            description: feature.description,
            fullCommand: `@feature ${feature.id}`,
            shortcuts: [],
            isFeature: true,
            featureData: feature // Store full feature data
        }));
    }
    
    // If just "@" or empty, return all commands
    if (!searchTerm) {
        return getAllCommands();
    }
    
    const matches = [];
    
    // Check if search term partially matches "feature" (e.g., "featur", "featu", "feat")
    if ('feature'.startsWith(searchTerm) && searchTerm.length > 0) {
        matches.push({
            name: 'feature',
            aliases: [],
            description: 'SELECT A FEATURE FROM MAP',
            fullCommand: '@feature',
            shortcuts: [],
            isFeatureCommand: true
        });
    }
    
    Object.entries(commands).forEach(([name, cmd]) => {
        const nameMatch = name.toLowerCase().includes(searchTerm);
        const aliasMatch = cmd.aliases.some(alias => alias.toLowerCase().includes(searchTerm));
        const descMatch = cmd.description.toLowerCase().includes(searchTerm);
        
        if (nameMatch || aliasMatch || descMatch) {
            matches.push({
                name: name,
                aliases: cmd.aliases,
                description: cmd.description,
                fullCommand: `@${name}`,
                shortcuts: cmd.aliases.map(alias => `@${alias}`)
            });
        }
    });
    
    // Sort by relevance (exact matches first, then @feature command)
    matches.sort((a, b) => {
        // Prioritize @feature command if it's a partial match
        if (a.isFeatureCommand && 'feature'.startsWith(searchTerm)) return -1;
        if (b.isFeatureCommand && 'feature'.startsWith(searchTerm)) return 1;
        
        const aExact = a.name.toLowerCase() === searchTerm || a.aliases.some(alias => alias.toLowerCase() === searchTerm);
        const bExact = b.name.toLowerCase() === searchTerm || b.aliases.some(alias => alias.toLowerCase() === searchTerm);
        
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
    });
    
    return matches.slice(0, 10); // Limit to 10 results
}

