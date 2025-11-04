import { callPerplexity } from '../utils/apiHelpers.js';
import { parseCoordinates } from '../utils/coordinateParser.js';
import { callMapboxIsochrone, detectTravelMode, extractTimeValues, extractDistanceValues } from '../services/isochrone.js';
import { tracker } from '../utils/performanceTracker.js';

// Isochrone agent - extracts location, time/distance, and travel mode
export async function extractIsochrone(userMessage, aiMessage, queryType, map) {
    try {
        const conversationHistory = [];
        
        // STEP 1: PLAN - Determine what we need to extract
        console.log('\n=== ISOCHRONE STEP 1: PLANNING ===');
        
        let planResponse = '';
        if (queryType) {
            planResponse = `Pre-detected: ${queryType.subtype === 'single' ? 'single' : 'multiple'} contour`;
            console.log('Skipping planning API call - using queryType');
        } else {
            tracker.step('Isochrone planning (Perplexity API)');
            const planPrompt = `Analyze this query: "${userMessage}"
            
            Is this asking for:
            - A single isochrone contour? (e.g., "30 min drive")
            - Multiple isochrone contours? (e.g., "15, 30, 45 min zones")
            
            Respond with: "single" or "multiple"`;
            
            planResponse = await callPerplexity(planPrompt);
            conversationHistory.push(
                { role: 'user', content: planPrompt },
                { role: 'assistant', content: planResponse }
            );
        }
        
        const isMultiple = planResponse.toLowerCase().includes('multiple') || 
                          (queryType && queryType.subtype === 'multiple');
        
        console.log('Contour type:', isMultiple ? 'MULTIPLE contours' : 'SINGLE contour');
        
        // STEP 2: EXTRACT - Get location coordinates
        console.log('\n=== ISOCHRONE STEP 2: LOCATION EXTRACTION ===');
        
        tracker.step('Isochrone location extraction (Perplexity API)');
        const extractLocationPrompt = `Extract the center location from this query:
        User: "${userMessage}"
        AI Response: "${aiMessage}"
        
        Return ONLY the coordinates in decimal format: lat,lon
        No text, no explanations, no citations.
        If location is "here" or "current location", return "here"`;
        
        const locationResponse = await callPerplexity(extractLocationPrompt);
        console.log('Location extraction:', locationResponse);
        
        conversationHistory.push(
            { role: 'user', content: extractLocationPrompt },
            { role: 'assistant', content: locationResponse }
        );
        
        // Parse coordinates
        let coordinates = null;
        const locationLower = locationResponse.toLowerCase().trim();
        
        if (locationLower === 'here' || locationLower.includes('current location')) {
            // Use user location if available
            if (window.userLocationMarker) {
                const lngLat = window.userLocationMarker.getLngLat();
                coordinates = [lngLat.lng, lngLat.lat];
                console.log('Using user location:', coordinates);
            } else {
                // Try to get from map center
                const center = map.getCenter();
                coordinates = [center.lng, center.lat];
                console.log('Using map center:', coordinates);
            }
        } else {
            // Try to parse coordinates from response
            const parsedCoords = parseCoordinates(locationResponse);
            if (parsedCoords && parsedCoords !== 'none') {
                // parseCoordinates returns string like "40.7127,-74.0059" or "40.7127,-74.0059 | ..."
                const firstCoord = parsedCoords.split(' | ')[0].trim();
                const [lat, lon] = firstCoord.split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lon)) {
                    coordinates = [lon, lat]; // API expects [lng, lat]
                    console.log('Parsed coordinates from response:', coordinates);
                }
            }
            
            if (!coordinates) {
                // Try user message
                const userCoords = parseCoordinates(userMessage);
                if (userCoords && userCoords !== 'none') {
                    const firstCoord = userCoords.split(' | ')[0].trim();
                    const [lat, lon] = firstCoord.split(',').map(Number);
                    if (!isNaN(lat) && !isNaN(lon)) {
                        coordinates = [lon, lat];
                        console.log('Parsed coordinates from user message:', coordinates);
                    }
                }
            }
            
            if (!coordinates) {
                // Try AI message
                const aiCoords = parseCoordinates(aiMessage);
                if (aiCoords && aiCoords !== 'none') {
                    const firstCoord = aiCoords.split(' | ')[0].trim();
                    const [lat, lon] = firstCoord.split(',').map(Number);
                    if (!isNaN(lat) && !isNaN(lon)) {
                        coordinates = [lon, lat];
                        console.log('Parsed coordinates from AI message:', coordinates);
                    }
                }
            }
            
            if (!coordinates) {
                throw new Error('Could not extract location coordinates');
            }
        }
        
        // Validate coordinates
        if (!coordinates || coordinates.length !== 2 || isNaN(coordinates[0]) || isNaN(coordinates[1])) {
            throw new Error(`Invalid coordinates: ${coordinates}`);
        }
        
        // STEP 3: EXTRACT - Get time/distance values and travel mode
        console.log('\n=== ISOCHRONE STEP 3: TIME/DISTANCE EXTRACTION ===');
        
        const combinedQuery = (userMessage + ' ' + aiMessage).toLowerCase();
        
        // Extract time values
        const timeValues = extractTimeValues(combinedQuery);
        // Extract distance values
        const distanceValues = extractDistanceValues(combinedQuery);
        
        // Determine if using time or distance
        // Prioritize time if both are found (time is more common for isochrones)
        const useTime = timeValues.length > 0;
        const useDistance = distanceValues.length > 0 && timeValues.length === 0; // Only use distance if no time values
        
        if (!useTime && !useDistance) {
            throw new Error('Could not extract time or distance values');
        }
        
        // Log warning if both were found
        if (timeValues.length > 0 && distanceValues.length > 0) {
            console.warn('Both time and distance values found, using time-based isochrones');
        }
        
        // Detect travel mode
        const travelMode = detectTravelMode(userMessage);
        
        console.log('Time values:', timeValues);
        console.log('Distance values:', distanceValues);
        console.log('Travel mode:', travelMode);
        console.log('Using:', useTime ? 'time-based' : 'distance-based');
        
        // STEP 4: CALL API
        console.log('\n=== ISOCHRONE STEP 4: API CALL ===');
        
        tracker.step('Mapbox Isochrone API');
        const isochroneData = await callMapboxIsochrone(coordinates, {
            profile: travelMode,
            contoursMinutes: useTime ? timeValues : null,
            contoursMeters: useDistance ? distanceValues : null,
            polygons: true,
            denoise: 1.0,
            generalize: 0
        });
        
        if (!isochroneData) {
            throw new Error('Failed to get isochrone data from API');
        }
        
        console.log('\n=== ISOCHRONE STEP 5: VALIDATION ===');
        console.log('Final coordinates:', coordinates);
        console.log('Contours:', isochroneData.features.length);
        
        return {
            success: true,
            coordinates: coordinates,
            isochroneData: isochroneData,
            travelMode: travelMode,
            useTime: useTime,
            values: useTime ? timeValues : distanceValues
        };
        
    } catch (error) {
        console.error('Error in isochrone agent:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

