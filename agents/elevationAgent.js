import { displayElevationProfileOnMap } from '../utils/elevationDisplay.js';
import { getSelectedFeature } from '../utils/commands.js';
import { extractLineCoordinates } from './lineAgent.js';

/**
 * Elevation Profile Agent
 * Extracts line coordinates (from selected feature or query) and displays elevation profile
 */
export async function extractElevationProfile(userMessage, aiMessage, queryType, map) {
    try {
        let routeCoordinates = null;
        
        // STEP 1: Check if feature is selected via @feature command
        const selectedFeature = getSelectedFeature();
        
        if (selectedFeature && selectedFeature.type === 'line') {
            routeCoordinates = selectedFeature.coordinates;
            console.log('✅ Using selected feature:', selectedFeature.name);
        } else {
            // STEP 2: Fallback - Extract line coordinates from query
            console.log('⚠️ No feature selected, extracting from query...');
            
            // Use lineAgent to extract coordinates
            // We'll need to modify lineAgent to return coordinates instead of displaying
            // For now, let's extract coordinates directly
            const lineResult = await extractLineCoordinatesForElevation(userMessage, aiMessage, queryType);
            
            if (lineResult && lineResult.coordinates) {
                routeCoordinates = lineResult.coordinates;
            } else {
                console.error('Could not extract line coordinates from query');
                return { success: false, message: 'Could not extract line coordinates' };
            }
        }
        
        if (!routeCoordinates || routeCoordinates.length < 2) {
            console.error('Invalid route coordinates for elevation profile');
            return { success: false, message: 'Invalid route coordinates' };
        }
        
        // STEP 3: Display elevation profile on map
        displayElevationProfileOnMap(routeCoordinates, map);
        
        return { success: true };
    } catch (error) {
        console.error('Error in elevation profile extraction:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Helper function to extract line coordinates without displaying
 * Simplified version that just extracts coordinates
 */
async function extractLineCoordinatesForElevation(userMessage, aiMessage, queryType) {
    try {
        // Import coordinate parser
        const { parseCoordinates } = await import('../utils/coordinateParser.js');
        
        // Try to extract coordinates from AI message first
        const coordinates = parseCoordinates(aiMessage);
        
        if (coordinates !== 'none') {
            // Parse coordinates string: "lat1,lon1 | lat2,lon2"
            const coordPairs = coordinates.split(' | ').map(coord => coord.trim());
            const routeCoords = [];
            
            coordPairs.forEach((coordPair) => {
                const [lat, lon] = coordPair.split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lon)) {
                    routeCoords.push([lon, lat]); // Mapbox format: [lon, lat]
                }
            });
            
            if (routeCoords.length >= 2) {
                return { coordinates: routeCoords };
            }
        }
        
        // If extraction failed, return null (will trigger error)
        return null;
    } catch (error) {
        console.error('Error extracting coordinates:', error);
        return null;
    }
}

