import { MAPBOX_ACCESS_TOKEN } from '../config.js';

// Detect travel mode from user query
export function detectTravelMode(userMessage) {
    const query = userMessage.toLowerCase();
    
    // Check for cycling keywords
    if (query.includes('cycling') || query.includes('bike') || query.includes('bicycle') || query.includes('cycle')) {
        return 'mapbox/cycling';
    }
    
    // Check for walking keywords
    if (query.includes('walking') || query.includes('walk') || query.includes('pedestrian') || query.includes('hiking')) {
        return 'mapbox/walking';
    }
    
    // Check for driving with traffic
    if (query.includes('traffic')) {
        return 'mapbox/driving-traffic';
    }
    
    // Check for driving keywords
    if (query.includes('driving') || query.includes('drive') || query.includes('car') || query.includes('vehicle')) {
        return 'mapbox/driving-traffic';
    }
    
    // Default to driving-traffic
    return 'mapbox/driving-traffic';
}

// Convert distance units to meters
export function convertToMeters(value, unit) {
    const unitLower = unit.toLowerCase();
    
    if (unitLower === 'km' || unitLower === 'kilometer' || unitLower === 'kilometers') {
        return Math.round(value * 1000);
    } else if (unitLower === 'mile' || unitLower === 'miles') {
        return Math.round(value * 1609.34);
    } else if (unitLower === 'm' || unitLower === 'meter' || unitLower === 'meters') {
        return Math.round(value);
    }
    
    return Math.round(value); // Default to meters
}

// Extract time values from query (in minutes)
export function extractTimeValues(query) {
    const times = [];
    const patterns = [
        /\b(\d+)\s*(min|minute|minutes)\b/gi,
        /\b(\d+)\s*hour\b/gi,
        /\b(\d+)\s*hours\b/gi
    ];
    
    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(query)) !== null) {
            let value = parseInt(match[1]);
            const unit = match[2] || match[0];
            
            // Convert hours to minutes
            if (unit.includes('hour')) {
                value = value * 60;
            }
            
            // Validate: max 60 minutes
            if (value > 0 && value <= 60) {
                times.push(value);
            }
        }
    });
    
    // Remove duplicates and sort
    return [...new Set(times)].sort((a, b) => a - b).slice(0, 4); // Max 4 contours
}

// Extract distance values from query (in meters)
export function extractDistanceValues(query) {
    const distances = [];
    const pattern = /\b(\d+\.?\d*)\s*(km|mile|miles|meter|meters|m)\b/gi;
    
    let match;
    while ((match = pattern.exec(query)) !== null) {
        const value = parseFloat(match[1]);
        const unit = match[2];
        const meters = convertToMeters(value, unit);
        
        // Validate: max 100000 meters (100km)
        if (meters > 0 && meters <= 100000) {
            distances.push(meters);
        }
    }
    
    // Remove duplicates and sort
    return [...new Set(distances)].sort((a, b) => a - b).slice(0, 4); // Max 4 contours
}

// Call Mapbox Isochrone API
export async function callMapboxIsochrone(coordinates, options = {}) {
    try {
        const {
            profile = 'mapbox/driving-traffic',
            contoursMinutes = null,
            contoursMeters = null,
            polygons = true,
            contoursColors = null,
            denoise = 1.0,
            generalize = 0
        } = options;
        
        // Validate: must have either contoursMinutes or contoursMeters
        if (!contoursMinutes && !contoursMeters) {
            throw new Error('Either contoursMinutes or contoursMeters must be provided');
        }
        
        // Validate: cannot have both - prioritize time if both are present
        if (contoursMinutes && contoursMeters) {
            console.warn('Both time and distance found, using time-based contours');
            contoursMeters = null;
        }
        
        // Format coordinates as "lng,lat"
        const coordsString = `${coordinates[0]},${coordinates[1]}`;
        
        // Build URL
        let url = `https://api.mapbox.com/isochrone/v1/${profile}/${coordsString}?`;
        
        // Add contours parameter
        if (contoursMinutes) {
            url += `contours_minutes=${contoursMinutes.join(',')}`;
        } else if (contoursMeters) {
            url += `contours_meters=${contoursMeters.join(',')}`;
        }
        
        // Add optional parameters
        url += `&polygons=${polygons}`;
        url += `&denoise=${denoise}`;
        
        if (generalize > 0) {
            url += `&generalize=${generalize}`;
        }
        
        if (contoursColors && contoursColors.length > 0) {
            url += `&contours_colors=${contoursColors.join(',')}`;
        }
        
        url += `&access_token=${MAPBOX_ACCESS_TOKEN}`;
        
        console.log(`\n=== CALLING ISOCHRONE API ===`);
        console.log(`Profile: ${profile}`);
        console.log(`Coordinates: ${coordsString}`);
        console.log(`Contours: ${contoursMinutes ? contoursMinutes.join(',') + ' min' : contoursMeters.join(',') + ' m'}`);
        console.log(`URL: ${url}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            console.error('Isochrone API error:', data);
            throw new Error(data.message || 'Isochrone API error');
        }
        
        if (!data.features || data.features.length === 0) {
            console.error('No isochrone features found');
            return null;
        }
        
        console.log(`\n=== ISOCHRONE DATA ===`);
        console.log(`Features: ${data.features.length}`);
        data.features.forEach((feature, index) => {
            const contour = feature.properties.contour;
            const metric = feature.properties.metric;
            console.log(`  ${index + 1}. ${contour} ${metric}`);
        });
        
        return data;
    } catch (error) {
        console.error('Error calling Isochrone API:', error);
        return null;
    }
}

