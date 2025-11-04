import { callPerplexity } from '../utils/apiHelpers.js';
import { parseCoordinates } from '../utils/coordinateParser.js';
import { displayLineOnMap, displayCoordinatesOnMap, displayRouteOnMap } from '../utils/mapDisplay.js';
import { callMapboxDirections, convertCoordinatesForDirections, detectTransportMode, needsRouting } from '../services/directions.js';
import { tracker } from '../utils/performanceTracker.js';

// Line agent - extracts coordinates for routes/paths using agentic workflow
export async function extractLineCoordinates(userMessage, aiMessage, queryType, map) {
    try {
        const conversationHistory = [];
        
        // STEP 1: PLAN - Skip if we already know from queryType (OPTIMIZATION)
        console.log('\n=== LINE STEP 1: PLANNING ===');
        
        // Count locations mentioned in query (simple pattern matching)
        const commaCount = (userMessage.match(/,/g) || []).length;
        const locationCount = commaCount + 1;
        
        // Check for explicit chain/path keywords
        const chainKeywords = ['through', 'via', 'path', 'chain', 'sequence', 'waypoints', 'waypoint'];
        const hasChainKeywords = chainKeywords.some(keyword => userMessage.toLowerCase().includes(keyword));
        
        // Check for "and X other" pattern
        const hasAndOther = /\band\s+(\d+|ten|X)\s+other/gi.test(userMessage);
        
        // OPTIMIZATION: Skip planning step if we already have queryType
        let isTwoPoints = false;
        let planResponse = '';
        
        if (queryType) {
            // Use queryType to determine if it's two points or multiple
            isTwoPoints = queryType.subtype === 'route-single' || queryType.subtype === 'direct-single';
            planResponse = `Pre-detected: ${isTwoPoints ? 'two' : 'multiple'} points`;
            console.log('Skipping planning API call - using queryType');
        } else {
            tracker.step('Line planning (Perplexity API)');
            // Explicit planning with rules
            const planPrompt = `Analyze this query: "${userMessage}"
            
            Rules:
            - If query mentions "through", "via", "path", "chain", "sequence", "waypoints" → MULTIPLE
            - If query mentions "and X other" or "and 10 other" → MULTIPLE
            - If query lists 3+ location names separated by commas → MULTIPLE
            - If query says "between A and B" or "from X to Y" (only 2 locations) → TWO
            
            Has chain keywords: ${hasChainKeywords}
            Has "and X other": ${hasAndOther}
            Estimated locations: ${locationCount}
            
            Respond with: "two" or "multiple"`;
            
            planResponse = await callPerplexity(planPrompt);
            const planResult = planResponse.toLowerCase();
            
            // Override with explicit rules if needed
            isTwoPoints = planResult.includes('two');
            
            conversationHistory.push(
                { role: 'user', content: planPrompt },
                { role: 'assistant', content: planResponse }
            );
        }
        
        // Override with explicit rules if needed
        if (hasChainKeywords || hasAndOther || locationCount >= 3) {
            isTwoPoints = false;
            console.log('Override: Detected chain keywords, "and X other", or multiple locations, forcing MULTIPLE');
        }
        
        console.log('Line type:', isTwoPoints ? 'TWO points (route)' : 'MULTIPLE points (chain/path)');
        
        // STEP 2: ACT - Extract ordered coordinates
        console.log('\n=== LINE STEP 2: EXTRACTION ===');
        
        // OPTIMIZATION: First try to extract coordinates from the initial AI response
        // This often contains coordinates and saves an API call
        const initialCoords = parseCoordinates(aiMessage);
        let extractResponse = '';
        let extractPrompt = '';
        
        if (initialCoords !== 'none') {
            const coordCount = initialCoords.split(' | ').length;
            const matchesExpected = (isTwoPoints && coordCount === 2) || (!isTwoPoints && coordCount >= 2);
            
            if (matchesExpected) {
                console.log('✅ Found coordinates in initial response, skipping extraction API call');
                extractResponse = initialCoords;
                extractPrompt = 'Extracted from initial response'; // For conversation history
                tracker.step('Line extraction (from initial response - SKIPPED API)');
            } else {
                console.log('⚠️ Initial response has coordinates but wrong count, using extraction API');
                // Need to extract via API
                extractPrompt = isTwoPoints
                    ? `Extract ONLY the START and END coordinates for this route query: "${userMessage}"
                    AI Response: "${aiMessage}"
                    
                    Extract ONLY the TWO endpoint coordinates (start and end points).
                    Return coordinates in decimal format: lat1,lon1 | lat2,lon2 (start to end)`
                    : `Extract coordinates for locations in this query: "${userMessage}"
                    AI Response: "${aiMessage}"
                    
                    Extract coordinates in the ORDER they should be connected (sequence/route order).
                    Return coordinates in decimal format: lat1,lon1 | lat2,lon2 | lat3,lon3 (in order)`;
                
                extractResponse = await callPerplexity(extractPrompt);
                tracker.step('Line extraction (Perplexity API)');
            }
        } else {
            // No coordinates found in initial response, need API call
            extractPrompt = isTwoPoints
                ? `Extract ONLY the START and END coordinates for this route query: "${userMessage}"
                AI Response: "${aiMessage}"
                
                Extract ONLY the TWO endpoint coordinates (start and end points).
                Return coordinates in decimal format: lat1,lon1 | lat2,lon2 (start to end)`
                : `Extract coordinates for locations in this query: "${userMessage}"
                AI Response: "${aiMessage}"
                
                Extract coordinates in the ORDER they should be connected (sequence/route order).
                Return coordinates in decimal format: lat1,lon1 | lat2,lon2 | lat3,lon3 (in order)`;
            
            extractResponse = await callPerplexity(extractPrompt);
            tracker.step('Line extraction (Perplexity API)');
        }
        
        // Only add to conversation history if we made an API call
        if (extractPrompt !== 'Extracted from initial response') {
            conversationHistory.push(
                { role: 'user', content: extractPrompt },
                { role: 'assistant', content: extractResponse }
            );
        }
        
        console.log('Initial line extraction:', extractResponse);
        
        // STEP 3: REFLECT - Fast validation (OPTIMIZATION: Skip API call if extraction looks good)
        console.log('\n=== LINE STEP 3: REFLECTION ===');
        
        // Count extracted coordinates
        const extractedCoords = extractResponse.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/g) || [];
        const coordCount = extractedCoords.length;
        
        console.log(`Extracted ${coordCount} coordinates, expected ${isTwoPoints ? '2' : 'multiple'}`);
        
        // OPTIMIZATION: Fast validation - check if extraction looks good without API call
        let needsRefinement = false;
        let shouldBeMultiple = false;
        
        // Quick validation rules (no API call needed)
        if (isTwoPoints && coordCount > 2) {
            console.log('Mismatch detected: Planning said TWO but extracted MANY coordinates');
            if (hasChainKeywords || hasAndOther || locationCount >= 3) {
                shouldBeMultiple = true;
                isTwoPoints = false;
                console.log('Correcting: Query should be MULTIPLE, not TWO');
                needsRefinement = true;
            } else {
                // For route-single, we only need 2 points - refine to get just start/end
                needsRefinement = true;
                console.log('Too many coordinates for route-single, refining to start/end only');
            }
        } else if (coordCount < 2) {
            needsRefinement = true;
            console.log('Too few coordinates extracted, needs refinement');
        } else if (coordCount >= 2 && !extractResponse.includes('|') && coordCount > 1) {
            needsRefinement = true;
            console.log('Coordinates not properly formatted, needs refinement');
        }
        
        // OPTIMIZATION: Skip reflection API call if extraction matches expected count
        // Only call API for reflection if we're unsure or there's a clear issue
        const extractionMatchesExpected = (isTwoPoints && coordCount === 2) || (!isTwoPoints && coordCount >= 2);
        
        if (!needsRefinement && !shouldBeMultiple && extractionMatchesExpected) {
            console.log('✅ Extraction matches expected, skipping reflection API call');
        } else if (!needsRefinement && !shouldBeMultiple) {
            const reflectPrompt = `You extracted coordinates for a line/route: "${extractResponse}"
            
            Extracted ${coordCount} coordinates.
            Planning said: ${isTwoPoints ? 'TWO point route' : 'MULTIPLE point chain'}
            Query: "${userMessage}"
            
            Evaluate:
            - Are coordinates in correct order? (Should match route/sequence order)
            - Are there enough coordinates? (${isTwoPoints ? 'Need exactly 2' : 'Need all points in sequence'})
            - Is format correct? (lat,lon format, separated by |)
            
            Respond with: "good" if quality is acceptable, or "refine" if needs improvement`;
            
            const reflectResponse = await callPerplexity([
                ...conversationHistory,
                { role: 'user', content: reflectPrompt }
            ]);
            tracker.step('Line reflection (Perplexity API)');
            
            needsRefinement = reflectResponse.toLowerCase().includes('refine');
            console.log('Line quality check:', needsRefinement ? 'NEEDS REFINEMENT' : 'GOOD');
        } else {
            console.log('Line quality check: SKIPPED (fast validation)');
        }
        
        // STEP 4: ACT - Refine if needed
        let finalCoordinates = extractResponse;
        
        if (needsRefinement) {
            console.log('\n=== LINE STEP 4: REFINEMENT ===');
            
            // Use corrected query type if validation found mismatch
            const actualQueryType = shouldBeMultiple ? false : isTwoPoints;
            
            const refinePrompt = actualQueryType
                ? `From these coordinates: "${extractResponse}"
                   Extract ONLY the TWO endpoint coordinates in route order
                   Return: lat1,lon1 | lat2,lon2 (start to end)`
                : `From these coordinates: "${extractResponse}"
                   Clean and order ALL coordinates in sequence/route order
                   Keep ALL coordinates in the correct order (do not reduce to just 2)
                   Return: lat1,lon1 | lat2,lon2 | lat3,lon3 | ... (all in order)`;
            
            const refineResponse = await callPerplexity([
                ...conversationHistory,
                { role: 'user', content: refinePrompt }
            ]);
            tracker.step('Line refinement (Perplexity API)');
            
            finalCoordinates = refineResponse;
            console.log('Refined line coordinates:', finalCoordinates);
        }
        
        // STEP 5: VALIDATE - Format and validate
        console.log('\n=== LINE STEP 5: VALIDATION ===');
        const parsedCoordinates = parseCoordinates(finalCoordinates);
        tracker.step('Coordinate parsing');
        
        console.log('Final line coordinates:', parsedCoordinates);
        
        // Check if routing is needed (use queryType if available)
        let needsRoute = false;
        if (queryType) {
            // Use queryType to determine if routing is needed
            needsRoute = queryType.subtype === 'route-single' || queryType.subtype === 'route-multi';
        } else {
            // Fallback to keyword detection
            needsRoute = needsRouting(userMessage);
        }
        const transportMode = detectTransportMode(userMessage);
        
        console.log(`\n=== ROUTING DECISION ===`);
        console.log(`Needs routing: ${needsRoute}`);
        console.log(`Transport mode: ${transportMode}`);
        
        // Display route or line on map
        if (parsedCoordinates !== 'none') {
            // Validate: If only 1 coordinate extracted, fallback to point workflow
            const coordPairs = parsedCoordinates.split(' | ');
            if (coordPairs.length === 1) {
                console.log('\n=== FALLBACK: Only 1 coordinate found, switching to point workflow ===');
                tracker.step('Map display (points)');
                displayCoordinatesOnMap(parsedCoordinates, map);
                return;
            }
            
            if (needsRoute) {
                // Use Directions API for actual routing
                const coordinates = convertCoordinatesForDirections(parsedCoordinates);
                
                if (coordinates.length >= 2) {
                    console.log('\n=== CALLING DIRECTIONS API ===');
                    const routeData = await callMapboxDirections(coordinates, transportMode);
                    tracker.step('Mapbox Directions API');
                    
                    if (routeData) {
                        displayRouteOnMap(routeData, coordinates, map);
                        tracker.step('Map display (route)');
                    } else {
                        // Fallback to simple line if Directions API fails
                        console.log('Directions API failed, falling back to simple line');
                        displayLineOnMap(parsedCoordinates, map);
                        tracker.step('Map display (line)');
                    }
                } else {
                    console.log('Not enough coordinates for routing, using simple line');
                    displayLineOnMap(parsedCoordinates, map);
                    tracker.step('Map display (line)');
                }
            } else {
                // Use simple line for visualization
                displayLineOnMap(parsedCoordinates, map);
                tracker.step('Map display (line)');
            }
        } else {
            console.log('No coordinates extracted, skipping map display');
        }
    } catch (error) {
        console.error('Error in agentic line extraction:', error);
    }
}

