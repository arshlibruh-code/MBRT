import { callPerplexity } from '../utils/apiHelpers.js';
import { parseCoordinates } from '../utils/coordinateParser.js';
import { displayPolygonOnMap } from '../utils/mapDisplay.js';
import { tracker } from '../utils/performanceTracker.js';

// Polygon agent - extracts polygon coordinates/boundaries using agentic workflow
export async function extractPolygon(userMessage, aiMessage, queryType, map) {
    try {
        const conversationHistory = [];
        
        // STEP 1: PLAN - Skip if we already know from queryType (OPTIMIZATION)
        console.log('\n=== POLYGON STEP 1: PLANNING ===');
        
        // Check for multiple polygons
        const commaCount = (userMessage.match(/,/g) || []).length;
        const locationCount = commaCount + 1;
        const hasMultiple = locationCount >= 2 || /\band\b/i.test(userMessage);
        
        // OPTIMIZATION: Skip planning step if we already have queryType
        let isMultiplePolygons = false;
        let planResponse = '';
        
        if (queryType) {
            isMultiplePolygons = queryType.subtype === 'multiple';
            planResponse = `Pre-detected: ${isMultiplePolygons ? 'multiple' : 'single'} polygon`;
            console.log('Skipping planning API call - using queryType');
        } else {
            tracker.step('Polygon planning (Perplexity API)');
            const planPrompt = `Analyze this query: "${userMessage}"
            
            Is this asking for:
            - A single polygon? (e.g., "draw polygon around Manhattan", "show Delhi boundary")
            - Multiple polygons? (e.g., "polygons for Delhi, Mumbai, Bangalore")
            
            Respond with: "single" or "multiple"`;
            
            planResponse = await callPerplexity(planPrompt);
            const planResult = planResponse.toLowerCase();
            isMultiplePolygons = planResult.includes('multiple') || hasMultiple;
            
            conversationHistory.push(
                { role: 'user', content: planPrompt },
                { role: 'assistant', content: planResponse }
            );
        }
        
        console.log('Polygon type:', isMultiplePolygons ? 'MULTIPLE polygons' : 'SINGLE polygon');
        
        // STEP 2: EXTRACT - Extract polygon coordinates/boundaries
        console.log('\n=== POLYGON STEP 2: EXTRACTION ===');
        
        // OPTIMIZATION: First try to extract coordinates from the initial AI response
        const initialCoords = parseCoordinates(aiMessage);
        let extractResponse = '';
        let extractPrompt = '';
        
        if (initialCoords !== 'none') {
            const coordCount = initialCoords.split(' | ').length;
            // For polygons, we need at least 3 points to form a polygon
            const matchesExpected = coordCount >= 3;
            
            if (matchesExpected) {
                console.log('✅ Found coordinates in initial response, skipping extraction API call');
                extractResponse = initialCoords;
                extractPrompt = 'Extracted from initial response';
                tracker.step('Polygon extraction (from initial response - SKIPPED API)');
            } else {
                console.log('⚠️ Initial response has coordinates but insufficient for polygon, using extraction API');
                extractPrompt = isMultiplePolygons
                    ? `Extract polygon boundary coordinates for each location in this query: "${userMessage}"
                    AI Response: "${aiMessage}"
                    
                    For each location, extract the boundary/outline coordinates that form a closed polygon.
                    Return coordinates in decimal format: lat1,lon1 | lat2,lon2 | lat3,lon3 | ... (for each polygon, separate polygons with ||)
                    Each polygon should have at least 3 points and form a closed shape.`
                    : `Extract polygon boundary coordinates for this query: "${userMessage}"
                    AI Response: "${aiMessage}"
                    
                    Extract the boundary/outline coordinates that form a closed polygon.
                    Return coordinates in decimal format: lat1,lon1 | lat2,lon2 | lat3,lon3 | ... (at least 3 points)
                    The polygon should form a closed shape (first and last point should be the same or close).`;
                
                extractResponse = await callPerplexity(extractPrompt);
                tracker.step('Polygon extraction (Perplexity API)');
            }
        } else {
            // No coordinates found in initial response, need API call
            extractPrompt = isMultiplePolygons
                ? `Extract polygon boundary coordinates for each location in this query: "${userMessage}"
                AI Response: "${aiMessage}"
                
                For each location, extract the boundary/outline coordinates that form a closed polygon.
                Return coordinates in decimal format: lat1,lon1 | lat2,lon2 | lat3,lon3 | ... (for each polygon, separate polygons with ||)
                Each polygon should have at least 3 points and form a closed shape.`
                : `Extract polygon boundary coordinates for this query: "${userMessage}"
                AI Response: "${aiMessage}"
                
                Extract the boundary/outline coordinates that form a closed polygon.
                Return coordinates in decimal format: lat1,lon1 | lat2,lon2 | lat3,lon3 | ... (at least 3 points)
                The polygon should form a closed shape (first and last point should be the same or close).`;
            
            extractResponse = await callPerplexity(extractPrompt);
            tracker.step('Polygon extraction (Perplexity API)');
        }
        
        // Only add to conversation history if we made an API call
        if (extractPrompt !== 'Extracted from initial response') {
            conversationHistory.push(
                { role: 'user', content: extractPrompt },
                { role: 'assistant', content: extractResponse }
            );
        }
        
        console.log('Initial polygon extraction:', extractResponse);
        
        // STEP 3: REFLECT - Fast validation
        console.log('\n=== POLYGON STEP 3: REFLECTION ===');
        
        // Count extracted coordinates
        const extractedCoords = extractResponse.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/g) || [];
        const coordCount = extractedCoords.length;
        
        console.log(`Extracted ${coordCount} coordinates`);
        
        // OPTIMIZATION: Fast validation - check if extraction looks good
        let needsRefinement = false;
        
        if (coordCount < 3) {
            needsRefinement = true;
            console.log('Too few coordinates for polygon (need at least 3), needs refinement');
        } else if (!extractResponse.includes('|') && coordCount > 1) {
            needsRefinement = true;
            console.log('Coordinates not properly formatted, needs refinement');
        }
        
        // Skip reflection API call if extraction looks good
        if (!needsRefinement && coordCount >= 3) {
            console.log('✅ Extraction looks good, skipping reflection API call');
        } else if (needsRefinement) {
            const reflectPrompt = `You extracted polygon coordinates: "${extractResponse}"
            
            Extracted ${coordCount} coordinates.
            Query: "${userMessage}"
            
            Evaluate:
            - Are there enough coordinates? (Need at least 3 points for a polygon)
            - Is format correct? (lat,lon format, separated by |)
            - Does it form a closed shape? (First and last point should be same or close)
            
            Respond with: "good" if quality is acceptable, or "refine" if needs improvement`;
            
            const reflectResponse = await callPerplexity([
                ...conversationHistory,
                { role: 'user', content: reflectPrompt }
            ]);
            tracker.step('Polygon reflection (Perplexity API)');
            
            needsRefinement = reflectResponse.toLowerCase().includes('refine');
            console.log('Polygon quality check:', needsRefinement ? 'NEEDS REFINEMENT' : 'GOOD');
        }
        
        // STEP 4: ACT - Refine if needed
        let finalCoordinates = extractResponse;
        
        if (needsRefinement) {
            console.log('\n=== POLYGON STEP 4: REFINEMENT ===');
            
            const refinePrompt = isMultiplePolygons
                ? `From these coordinates: "${extractResponse}"
                   Clean and format polygon boundaries for each location.
                   Each polygon should have at least 3 points and form a closed shape.
                   Return: lat1,lon1 | lat2,lon2 | lat3,lon3 | ... (for each polygon, separate polygons with ||)`
                : `From these coordinates: "${extractResponse}"
                   Clean and format the polygon boundary coordinates.
                   Ensure at least 3 points and form a closed shape (first = last point).
                   Return: lat1,lon1 | lat2,lon2 | lat3,lon3 | ... (closed polygon)`;
            
            const refineResponse = await callPerplexity([
                ...conversationHistory,
                { role: 'user', content: refinePrompt }
            ]);
            tracker.step('Polygon refinement (Perplexity API)');
            
            finalCoordinates = refineResponse;
            console.log('Refined polygon coordinates:', finalCoordinates);
        }
        
        // STEP 5: VALIDATE - Format and validate
        console.log('\n=== POLYGON STEP 5: VALIDATION ===');
        
        // Parse and format polygons
        let polygons = [];
        
        if (isMultiplePolygons && finalCoordinates.includes('||')) {
            // Multiple polygons separated by ||
            const polygonStrings = finalCoordinates.split('||').map(s => s.trim());
            polygonStrings.forEach((polyStr, index) => {
                const parsedCoords = parseCoordinates(polyStr);
                if (parsedCoords !== 'none') {
                    const coords = parsedCoords.split(' | ').map(coord => {
                        const [lat, lon] = coord.trim().split(',').map(Number);
                        return [lon, lat]; // Convert to [lng, lat]
                    });
                    
                    // Ensure polygon is closed
                    if (coords.length >= 3) {
                        if (coords[0][0] !== coords[coords.length - 1][0] || 
                            coords[0][1] !== coords[coords.length - 1][1]) {
                            coords.push(coords[0]); // Close the polygon
                        }
                        polygons.push({ coordinates: coords, name: `Polygon ${index + 1}` });
                    }
                }
            });
        } else {
            // Single polygon
            const parsedCoords = parseCoordinates(finalCoordinates);
            if (parsedCoords !== 'none') {
                const coords = parsedCoords.split(' | ').map(coord => {
                    const [lat, lon] = coord.trim().split(',').map(Number);
                    return [lon, lat]; // Convert to [lng, lat]
                });
                
                // Ensure polygon is closed
                if (coords.length >= 3) {
                    if (coords[0][0] !== coords[coords.length - 1][0] || 
                        coords[0][1] !== coords[coords.length - 1][1]) {
                        coords.push(coords[0]); // Close the polygon
                    }
                    polygons.push({ coordinates: coords, name: 'Polygon' });
                }
            }
        }
        
        tracker.step('Polygon parsing');
        
        console.log(`Final polygons: ${polygons.length}`);
        polygons.forEach((poly, index) => {
            console.log(`  Polygon ${index + 1}: ${poly.coordinates.length} points`);
        });
        
        if (polygons.length === 0) {
            throw new Error('No valid polygons extracted');
        }
        
        // Display polygons on map
        displayPolygonOnMap(polygons, map);
        tracker.step('Map display (polygons)');
        
        return {
            success: true,
            polygons: polygons
        };
        
    } catch (error) {
        console.error('Error in polygon agent:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

