import { callPerplexity } from '../utils/apiHelpers.js';
import { parseCoordinates } from '../utils/coordinateParser.js';
import { displayCoordinatesOnMap } from '../utils/mapDisplay.js';
import { tracker } from '../utils/performanceTracker.js';

// Location agent - extracts coordinates using agentic workflow
export async function extractCoordinates(userMessage, aiMessage, queryType, map) {
    try {
        const conversationHistory = [];
        
        // STEP 1: PLAN - Skip if we already know from queryType (OPTIMIZATION)
        console.log('\n=== STEP 1: PLANNING ===');
        
        // Use queryType if provided, otherwise detect
        let isSingleLocation = true;
        let planResponse = '';
        
        if (queryType) {
            isSingleLocation = queryType.subtype === 'single';
            planResponse = `Pre-detected: ${queryType.subtype === 'single' ? 'single' : 'multiple'} location`;
            console.log('Skipping planning API call - using queryType');
        } else {
            tracker.step('Point planning (Perplexity API)');
            const planPrompt = `Analyze this query: "${userMessage}"
            
            Is this asking for:
            - A single specific location? (e.g., "where is Dubai", "take me to London")
            - Multiple locations? (e.g., "top 10 places", "list locations")
            
            Respond with: "single" or "multiple"`;
            
            planResponse = await callPerplexity(planPrompt);
            const planResult = planResponse.toLowerCase();
            isSingleLocation = planResult.includes('single');
            
            conversationHistory.push(
                { role: 'user', content: planPrompt },
                { role: 'assistant', content: planResponse }
            );
        }
        
        console.log('Query type:', isSingleLocation ? 'SINGLE location' : 'MULTIPLE locations');
        
        // STEP 2: ACT - Extract coordinates
        console.log('\n=== STEP 2: EXTRACTION ===');
        
        const extractPrompt = `Extract coordinates for locations mentioned here:
        User: "${userMessage}"
        AI Response: "${aiMessage}"
        
        Return all coordinates found in decimal format: lat,lon`;
        
        const extractResponse = await callPerplexity(extractPrompt);
        tracker.step('Point extraction (Perplexity API)');
        conversationHistory.push(
            { role: 'user', content: extractPrompt },
            { role: 'assistant', content: extractResponse }
        );
        
        console.log('Initial extraction:', extractResponse);
        
        // STEP 3: REFLECT - Fast validation (OPTIMIZATION: Skip API call if extraction looks good)
        console.log('\n=== STEP 3: REFLECTION ===');
        
        // Quick validation: count coordinates
        const extractedCoords = extractResponse.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/g) || [];
        const coordCount = extractedCoords.length;
        
        // OPTIMIZATION: Fast validation - check if extraction looks good without API call
        let needsRefinement = false;
        
        if (isSingleLocation && coordCount > 1) {
            needsRefinement = true;
            console.log('Too many coordinates for single location, needs refinement');
        } else if (coordCount === 0) {
            needsRefinement = true;
            console.log('No coordinates extracted, needs refinement');
        } else if (!isSingleLocation && coordCount === 1 && userMessage.toLowerCase().includes('multiple')) {
            needsRefinement = true;
            console.log('Only one coordinate for multiple locations, needs refinement');
        }
        
        // Only call API for reflection if we're unsure
        if (!needsRefinement) {
            const reflectPrompt = `You extracted coordinates: "${extractResponse}"
            
            For a ${isSingleLocation ? 'SINGLE' : 'MULTIPLE'} location query: "${userMessage}"
            
            Evaluate:
            - Are there too many coordinates? (${isSingleLocation ? 'Should be 1 coordinate only' : 'Should match number of locations'})
            - Is format correct? (lat,lon format)
            - Is primary location clear? (${isSingleLocation ? 'Need primary location only' : 'All locations needed'})
            
            Respond with: "good" if quality is acceptable, or "refine" if needs improvement`;
            
            const reflectResponse = await callPerplexity([
                ...conversationHistory,
                { role: 'user', content: reflectPrompt }
            ]);
            tracker.step('Point reflection (Perplexity API)');
            
            needsRefinement = reflectResponse.toLowerCase().includes('refine');
            console.log('Quality check:', needsRefinement ? 'NEEDS REFINEMENT' : 'GOOD');
        } else {
            console.log('Quality check: SKIPPED (fast validation)');
        }
        
        // STEP 4: ACT - Refine if needed
        let finalCoordinates = extractResponse;
        
        if (needsRefinement) {
            console.log('\n=== STEP 4: REFINEMENT ===');
            
            const refinePrompt = isSingleLocation
                ? `From these coordinates: "${extractResponse}"
                   Extract ONLY the PRIMARY/CENTER coordinate for "${userMessage}"
                   Return single coordinate: lat,lon`
                : `From these coordinates: "${extractResponse}"
                   Clean and format all coordinates properly
                   Return: lat1,lon1 | lat2,lon2`;
            
            const refineResponse = await callPerplexity([
                ...conversationHistory,
                { role: 'user', content: refinePrompt }
            ]);
            tracker.step('Point refinement (Perplexity API)');
            
            finalCoordinates = refineResponse;
            console.log('Refined coordinates:', finalCoordinates);
        }
        
        // STEP 5: VALIDATE - Format and validate
        console.log('\n=== STEP 5: VALIDATION ===');
        const parsedCoordinates = parseCoordinates(finalCoordinates);
        tracker.step('Coordinate parsing');
        
        console.log('Final coordinates:', parsedCoordinates);
        
        // Display coordinates on map
        if (parsedCoordinates !== 'none') {
            displayCoordinatesOnMap(parsedCoordinates, map);
            tracker.step('Map display (points)');
        }
    } catch (error) {
        console.error('Error in agentic coordinate extraction:', error);
    }
}

