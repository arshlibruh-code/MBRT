import { callPerplexity } from '../utils/apiHelpers.js';
import { parseCoordinates } from '../utils/coordinateParser.js';
import { displayBufferOnMap, displayMultipleBuffersOnMap } from '../utils/mapDisplay.js';
import { generateCircle } from '../utils/bufferGenerator.js';
import { tracker } from '../utils/performanceTracker.js';
import { getSelectedFeature } from '../utils/commands.js';

// Buffer/Geofence agent - extracts center point(s) and radius, generates buffer(s)
export async function extractBuffer(userMessage, aiMessage, queryType, map) {
    try {
        const conversationHistory = [];
        
        // Check if multiple locations
        const isMultiple = queryType && queryType.subtype === 'multiple';
        
        // STEP 1: ACT - Extract center point coordinates
        console.log('\n=== BUFFER STEP 1: EXTRACT CENTER POINT(S) ===');
        
        let extractCenterResponse = '';
        let extractCenterPrompt = '';
        
        // Check if there's a selected feature first
        const selectedFeature = getSelectedFeature();
        if (selectedFeature) {
            console.log(`✅ Using selected feature: ${selectedFeature.name} (${selectedFeature.type})`);
            
            // Extract coordinates based on feature type
            let centerCoord = null;
            
            if (selectedFeature.type === 'marker') {
                // For markers, coordinates is [lngLat] where lngLat is [lng, lat] array
                if (selectedFeature.coordinates && selectedFeature.coordinates.length > 0) {
                    const lngLat = selectedFeature.coordinates[0];
                    if (Array.isArray(lngLat) && lngLat.length >= 2) {
                        const [lon, lat] = lngLat;
                        centerCoord = `${lat},${lon}`;
                    }
                }
            } else if (selectedFeature.type === 'buffer') {
                // For buffers, coordinates is center [lon, lat] or {lon, lat}
                if (selectedFeature.coordinates) {
                    let lon, lat;
                    if (Array.isArray(selectedFeature.coordinates)) {
                        [lon, lat] = selectedFeature.coordinates;
                    } else if (typeof selectedFeature.coordinates === 'object') {
                        lon = selectedFeature.coordinates.lng || selectedFeature.coordinates.lon || selectedFeature.coordinates[0];
                        lat = selectedFeature.coordinates.lat || selectedFeature.coordinates[1];
                    }
                    if (lon !== undefined && lat !== undefined) {
                        centerCoord = `${lat},${lon}`;
                    }
                }
            } else if (selectedFeature.type === 'isochrone') {
                // For isochrones, coordinates is center [lon, lat] or {lon, lat}
                if (selectedFeature.coordinates) {
                    let lon, lat;
                    if (Array.isArray(selectedFeature.coordinates)) {
                        [lon, lat] = selectedFeature.coordinates;
                    } else if (typeof selectedFeature.coordinates === 'object') {
                        lon = selectedFeature.coordinates.lng || selectedFeature.coordinates.lon || selectedFeature.coordinates[0];
                        lat = selectedFeature.coordinates.lat || selectedFeature.coordinates[1];
                    }
                    if (lon !== undefined && lat !== undefined) {
                        centerCoord = `${lat},${lon}`;
                    }
                }
            } else if (selectedFeature.type === 'line') {
                // For lines, coordinates is array of [lon, lat] pairs
                if (selectedFeature.coordinates && selectedFeature.coordinates.length > 0) {
                    const midIndex = Math.floor(selectedFeature.coordinates.length / 2);
                    const coord = selectedFeature.coordinates[midIndex];
                    if (Array.isArray(coord) && coord.length >= 2) {
                        const [lon, lat] = coord;
                        centerCoord = `${lat},${lon}`;
                    }
                }
            } else if (selectedFeature.type === 'polygon') {
                // For polygons, coordinates is array of [lon, lat] pairs
                if (selectedFeature.coordinates && selectedFeature.coordinates.length > 0) {
                    const coord = selectedFeature.coordinates[0];
                    if (Array.isArray(coord) && coord.length >= 2) {
                        const [lon, lat] = coord;
                        centerCoord = `${lat},${lon}`;
                    }
                }
            }
            
            if (centerCoord) {
                extractCenterResponse = centerCoord;
                extractCenterPrompt = 'Extracted from selected feature';
                tracker.step('Buffer center extraction (from selected feature - SKIPPED API)');
                console.log('Center point from selected feature:', extractCenterResponse);
            }
        }
        
        // If no selected feature or couldn't extract from it, try other methods
        if (!extractCenterResponse) {
            // OPTIMIZATION: First try to extract coordinates from the initial AI response
            // This often contains coordinates and saves an API call
            const initialCoords = parseCoordinates(aiMessage);
            
            if (initialCoords !== 'none') {
                const coordCount = initialCoords.split(' | ').length;
                const expectedCount = isMultiple ? 2 : 1; // For multiple, need at least 2; for single, need 1
                const matchesExpected = (isMultiple && coordCount >= 2) || (!isMultiple && coordCount === 1);
                
                if (matchesExpected) {
                    console.log('✅ Found coordinates in initial response, skipping extraction API call');
                    extractCenterResponse = initialCoords;
                    extractCenterPrompt = 'Extracted from initial response'; // For conversation history
                    tracker.step('Buffer center extraction (from initial response - SKIPPED API)');
                } else {
                    console.log(`⚠️ Initial response has ${coordCount} coordinates but expected ${isMultiple ? '2+' : '1'}, using extraction API`);
                    // Need to extract via API
                    extractCenterPrompt = isMultiple
                        ? `Extract ONLY the PRIMARY center coordinates for each location mentioned in this buffer/geofence query:
                        User: "${userMessage}"
                        AI Response: "${aiMessage}"
                        
                        Return ONLY ONE coordinate per location (the main city center, not neighborhoods or sub-locations).
                        Return coordinates in decimal format: lat1,lon1 | lat2,lon2 | lat3,lon3 (one per location only).
                        If multiple coordinates are mentioned for the same location, return ONLY the primary/main center coordinate.`
                        : `Extract the PRIMARY/CENTER location coordinate for this buffer/geofence query:
                        User: "${userMessage}"
                        AI Response: "${aiMessage}"
                        
                        Return ONLY the PRIMARY/CENTER location coordinate in decimal format: lat,lon (not neighborhoods or sub-locations).`;
                    
                    extractCenterResponse = await callPerplexity(extractCenterPrompt);
                    tracker.step('Buffer center extraction (Perplexity API)');
                }
            } else {
                // No coordinates found in initial response, need API call
                extractCenterPrompt = isMultiple
                    ? `Extract ONLY the PRIMARY center coordinates for each location mentioned in this buffer/geofence query:
                    User: "${userMessage}"
                    AI Response: "${aiMessage}"
                    
                    Return ONLY ONE coordinate per location (the main city center, not neighborhoods or sub-locations).
                    Return coordinates in decimal format: lat1,lon1 | lat2,lon2 | lat3,lon3 (one per location only).
                    If multiple coordinates are mentioned for the same location, return ONLY the primary/main center coordinate.`
                    : `Extract the PRIMARY/CENTER location coordinate for this buffer/geofence query:
                    User: "${userMessage}"
                    AI Response: "${aiMessage}"
                    
                    Return ONLY the PRIMARY/CENTER location coordinate in decimal format: lat,lon (not neighborhoods or sub-locations).`;
                
                extractCenterResponse = await callPerplexity(extractCenterPrompt);
                tracker.step('Buffer center extraction (Perplexity API)');
            }
            
            // Only add to conversation history if we made an API call
            if (extractCenterPrompt !== 'Extracted from initial response' && extractCenterPrompt !== 'Extracted from selected feature') {
                conversationHistory.push(
                    { role: 'user', content: extractCenterPrompt },
                    { role: 'assistant', content: extractCenterResponse }
                );
            }
        }
        
        console.log('Center point extraction:', extractCenterResponse);
        
        // Parse center coordinates
        const centerCoordinates = parseCoordinates(extractCenterResponse);
        if (centerCoordinates === 'none') {
            console.error('Could not extract center point(s)');
            return;
        }
        
        // Get all center points
        const centerPairs = centerCoordinates.split(' | ').map(coord => coord.trim());
        const centers = [];
        
        centerPairs.forEach((centerPair, index) => {
            const [centerLat, centerLon] = centerPair.split(',').map(Number);
            
            if (!isNaN(centerLat) && !isNaN(centerLon)) {
                // Filter out obviously invalid coordinates (like 1,0, 0,0, etc. that might appear in code examples)
                // Valid city coordinates should have:
                // - Latitude between -85 and 85 (reasonable city range)
                // - Not exactly 0,0 or 1,0 (often appear in code examples)
                // - Longitude should have meaningful decimal places
                const isInvalid = 
                    (centerLat === 0 && centerLon === 0) || 
                    (centerLat === 1 && centerLon === 0) ||
                    (Math.abs(centerLat) < 0.1 && Math.abs(centerLon) < 0.1) ||
                    Math.abs(centerLat) > 85; // Beyond reasonable city latitude
                
                if (!isInvalid) {
                    centers.push([centerLat, centerLon]);
                    console.log(`Center point ${centers.length}:`, centerLat, centerLon);
                } else {
                    console.log(`⚠️ Skipping invalid coordinate: ${centerLat},${centerLon}`);
                }
            }
        });
        
        // DEDUPLICATION: If we have more centers than locations mentioned, cluster nearby coordinates
        // This handles cases where AI returns multiple coordinates for the same city
        // Count expected locations from user query (comma-separated or "and")
        const locationCount = (userMessage.match(/\b(?:on|over|around|for)\s+([^,]+?)(?:,|and|\s*$)/gi) || []).length;
        const expectedLocations = Math.max(1, locationCount);
        
        if (isMultiple && centers.length > expectedLocations) {
            console.log(`⚠️ Found ${centers.length} coordinates but expected ~${expectedLocations} locations, clustering nearby coordinates...`);
            
            // Cluster coordinates that are within ~50km of each other
            const clusters = [];
            const used = new Set();
            
            centers.forEach(([lat, lon], index) => {
                if (used.has(index)) return;
                
                const cluster = [[lat, lon]];
                used.add(index);
                
                // Find nearby coordinates (within ~0.5 degrees ≈ 50km)
                centers.forEach(([otherLat, otherLon], otherIndex) => {
                    if (used.has(otherIndex)) return;
                    
                    const latDiff = Math.abs(lat - otherLat);
                    const lonDiff = Math.abs(lon - otherLon);
                    
                    // If within ~0.5 degrees (≈50km), consider them the same location
                    if (latDiff < 0.5 && lonDiff < 0.5) {
                        cluster.push([otherLat, otherLon]);
                        used.add(otherIndex);
                    }
                });
                
                // Use the first coordinate as the cluster center
                clusters.push(cluster[0]);
            });
            
            console.log(`✅ Clustered ${centers.length} coordinates into ${clusters.length} unique locations`);
            centers.length = 0;
            centers.push(...clusters);
        }
        
        if (centers.length === 0) {
            console.error('No valid center coordinates found');
            return;
        }
        
        console.log(`Extracted ${centers.length} center point(s)`);
        
        // STEP 2: ACT - Extract radius/distance (support multiple different radii)
        console.log('\n=== BUFFER STEP 2: EXTRACT RADIUS ===');
        
        // Extract all radius-location pairs from query
        // Pattern: "163 km on dehradun" or "234km on haldwani"
        const radiusPattern = /(\d+(?:\.\d+)?)\s*(km|kilometer|kilometers|mile|miles|m|meter|meters|mi)\s*(?:on|over|around|for)\s*([^,]+?)(?:,|and|\s*$)/gi;
        const radiusMatches = [];
        let match;
        
        while ((match = radiusPattern.exec(userMessage)) !== null) {
            const value = parseFloat(match[1]);
            const unit = match[2].toLowerCase();
            const location = match[3].trim().toLowerCase();
            
            let radiusKm = 5; // Default
            if (unit === 'km' || unit === 'kilometer' || unit === 'kilometers') {
                radiusKm = value;
            } else if (unit === 'mile' || unit === 'miles' || unit === 'mi') {
                radiusKm = value * 1.60934;
            } else if (unit === 'm' || unit === 'meter' || unit === 'meters') {
                radiusKm = value / 1000;
            }
            
            radiusMatches.push({ location, radiusKm });
            console.log(`Extracted radius for "${location}": ${value} ${unit} = ${radiusKm.toFixed(2)} km`);
        }
        
        // If no specific radius-location pairs found, try simple pattern
        if (radiusMatches.length === 0) {
            const simpleRadiusMatch = userMessage.match(/(\d+(?:\.\d+)?)\s*(km|kilometer|kilometers|mile|miles|m|meter|meters|mi)/i);
            let radiusKm = 5; // Default 5km
            
            if (simpleRadiusMatch) {
                const value = parseFloat(simpleRadiusMatch[1]);
                const unit = simpleRadiusMatch[2].toLowerCase();
                
                if (unit === 'km' || unit === 'kilometer' || unit === 'kilometers') {
                    radiusKm = value;
                } else if (unit === 'mile' || unit === 'miles' || unit === 'mi') {
                    radiusKm = value * 1.60934;
                } else if (unit === 'm' || unit === 'meter' || unit === 'meters') {
                    radiusKm = value / 1000;
                }
                
                // Apply same radius to all centers
                radiusMatches.push(...centers.map(() => ({ location: '', radiusKm })));
                console.log(`Extracted single radius: ${value} ${unit} = ${radiusKm.toFixed(2)} km`);
            } else {
                // Try Perplexity if regex fails
                const extractRadiusPrompt = `Extract the radius/distance for this buffer/geofence query:
                User: "${userMessage}"
                
                Return ONLY the numeric value in kilometers (e.g., "10" for 10km, "5" for 5km).
                If no radius specified, return "5" (default 5km).`;
                
                const extractRadiusResponse = await callPerplexity(extractRadiusPrompt);
                tracker.step('Buffer radius extraction (Perplexity API)');
                
                const radiusValue = parseFloat(extractRadiusResponse.match(/\d+(?:\.\d+)?/)?.[0] || '5');
                radiusKm = radiusValue;
                
                // Apply same radius to all centers
                radiusMatches.push(...centers.map(() => ({ location: '', radiusKm })));
                console.log(`Extracted radius from AI: ${radiusKm} km`);
            }
        }
        
        // Match radii to centers (by location name if available, otherwise by order)
        const getRadiusForCenter = (centerIndex, centerLat, centerLon) => {
            // If we have location-specific radii, match by order
            if (radiusMatches.length > 0 && radiusMatches[0].location) {
                // Match by order: first radius to first center, second radius to second center, etc.
                if (centerIndex < radiusMatches.length) {
                    return radiusMatches[centerIndex].radiusKm;
                }
                // If more centers than radii, use the last radius as fallback
                // (This shouldn't happen after clustering, but handle it gracefully)
                console.log(`⚠️ More centers (${centers.length}) than radii (${radiusMatches.length}), using last radius for center ${centerIndex + 1}`);
                return radiusMatches[radiusMatches.length - 1].radiusKm;
            }
            // If no location-specific radii, use the first (or only) radius
            return radiusMatches.length > 0 ? radiusMatches[0].radiusKm : 5;
        };
        
        // STEP 3: ACT - Generate circle polygon(s)
        console.log('\n=== BUFFER STEP 3: GENERATE CIRCLE(S) ===');
        
        const buffers = centers.map(([centerLat, centerLon], index) => {
            const radiusKm = getRadiusForCenter(index, centerLat, centerLon);
            const circlePoints = generateCircle([centerLat, centerLon], radiusKm);
            return {
                center: [centerLon, centerLat], // Mapbox format: [lon, lat]
                radius: radiusKm,
                polygon: circlePoints
            };
        });
        
        tracker.step('Circle generation');
        
        console.log(`Generated ${buffers.length} circle(s) with ${buffers[0].polygon.length} points each`);
        buffers.forEach((buffer, index) => {
            console.log(`  Buffer ${index + 1}: radius ${buffer.radius.toFixed(2)} km`);
        });
        
        // STEP 4: VALIDATE - Display buffer(s) on map
        console.log('\n=== BUFFER STEP 4: DISPLAY BUFFER(S) ===');
        
        if (isMultiple && buffers.length > 1) {
            displayMultipleBuffersOnMap(buffers, map);
        } else {
            displayBufferOnMap(buffers[0], map);
        }
        
        tracker.step('Map display (buffer)');
        
        console.log(`${buffers.length} buffer(s) displayed on map`);
    } catch (error) {
        console.error('Error in buffer extraction:', error);
    }
}

