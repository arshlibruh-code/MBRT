import { MAPBOX_ACCESS_TOKEN } from '../config.js';

// Convert coordinates from "lat,lon" string to [lng,lat] array for Directions API
export function convertCoordinatesForDirections(coordinatesString) {
    const coordPairs = coordinatesString.split(' | ').map(coord => coord.trim());
    const coordinates = [];
    
    coordPairs.forEach((coordPair) => {
        const [lat, lon] = coordPair.split(',').map(Number);
        
        if (!isNaN(lat) && !isNaN(lon)) {
            // Directions API expects [lng, lat] format
            coordinates.push([lon, lat]);
        }
    });
    
    return coordinates;
}

// Detect transport mode from user query
export function detectTransportMode(userMessage) {
    const query = userMessage.toLowerCase();
    
    // Check for cycling keywords
    if (query.includes('cycling') || query.includes('bike') || query.includes('bicycle') || query.includes('cycle')) {
        return 'mapbox/cycling';
    }
    
    // Check for walking keywords
    if (query.includes('walking') || query.includes('walk') || query.includes('pedestrian') || query.includes('hiking')) {
        return 'mapbox/walking';
    }
    
    // Check for driving keywords
    if (query.includes('driving') || query.includes('drive') || query.includes('car') || query.includes('vehicle') || query.includes('traffic')) {
        return 'mapbox/driving-traffic';
    }
    
    // Default to driving-traffic
    return 'mapbox/driving-traffic';
}

// Check if query needs actual routing vs simple line
export function needsRouting(userMessage) {
    const query = userMessage.toLowerCase();
    const routingKeywords = ['route', 'directions', 'driving', 'walking', 'cycling', 'bike', 'car', 'walk', 
                            'how to get', 'how do i get', 'distance between', 'from to'];
    
    return routingKeywords.some(keyword => query.includes(keyword));
}

// Call Mapbox Directions API
export async function callMapboxDirections(coordinates, profile = 'mapbox/driving-traffic') {
    try {
        // Format coordinates as semicolon-separated string: "lng1,lat1;lng2,lat2;..."
        const coordsString = coordinates.map(coord => `${coord[0]},${coord[1]}`).join(';');
        
        // Build URL
        const url = `https://api.mapbox.com/directions/v5/${profile}/${coordsString}?geometries=geojson&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`;
        
        console.log(`\n=== CALLING DIRECTIONS API ===`);
        console.log(`Profile: ${profile}`);
        console.log(`Coordinates: ${coordsString}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code !== 'Ok') {
            console.error('Directions API error:', data.code, data.message);
            return null;
        }
        
        if (!data.routes || data.routes.length === 0) {
            console.error('No routes found');
            return null;
        }
        
        const route = data.routes[0];
        const routeData = {
            geometry: route.geometry,
            distance: route.distance,
            duration: route.duration,
            weight: route.weight,
            weight_name: route.weight_name,
            legs: route.legs || []
        };
        
        console.log(`\n=== ROUTE DATA ===`);
        console.log(`Distance: ${(routeData.distance / 1000).toFixed(2)} km`);
        console.log(`Duration: ${(routeData.duration / 60).toFixed(1)} minutes`);
        console.log(`Profile: ${profile}`);
        
        return routeData;
    } catch (error) {
        console.error('Error calling Directions API:', error);
        return null;
    }
}

