// Detect query type with improved classification
export function detectQueryType(userMessage, aiMessage) {
    const query = userMessage.toLowerCase();
    const combinedText = (userMessage + ' ' + aiMessage).toLowerCase();
    
    // Count locations in query (comma-separated or explicit)
    const commaCount = (query.match(/,/g) || []).length;
    const locationCount = commaCount + 1;
    
    // Check for explicit "and X other" pattern
    const hasAndOther = /\band\s+(\d+|ten|X)\s+other/gi.test(query);
    
    // EXPLICIT POLYGON CHECK (highest priority - check before everything else)
    const explicitPolygonPatterns = [
        /\b(create|make|build|draw)\s+(a\s+)?polygon\s+(from|using|with|connecting|joining)/i,
        /\bpolygon\s+(from|using|with|connecting|joining)\s+.*?(locations?|points?|coordinates?|cities?)/i,
        /\b(polygon|triangle|shape|boundary|outline|area|region)\s+(connecting|joining|linking)\s+/i,
        /\b(polygon|triangle)\s+(from|connecting|joining)\s+.*?(locations?|points?|cities?)/i,
        /\bcreate\s+(a\s+)?(polygon|triangle|shape|boundary)\s+(from|using|with)/i
    ];
    
    const hasExplicitPolygon = explicitPolygonPatterns.some(pattern => pattern.test(query));
    
    // Also check AI message for polygon hints (context-aware)
    const aiHasPolygon = /\b(polygon|triangle|shape|boundary|outline|area|region)\s+(from|using|connecting|joining)/i.test(aiMessage?.toLowerCase() || '');
    const aiHasCoordinatesForPolygon = /\b(polygon|triangle|shape|boundary)\b/i.test(aiMessage?.toLowerCase() || '') && 
                                      /coordinates?|points?|locations?/i.test(aiMessage?.toLowerCase() || '');
    
    if (hasExplicitPolygon || (aiHasPolygon && locationCount >= 3) || (aiHasCoordinatesForPolygon && locationCount >= 3)) {
        // Explicit polygon intent detected
        const hasMultiple = commaCount >= 2 || hasAndOther || /\band\b/i.test(query);
        return {
            type: 'polygon',
            subtype: hasMultiple ? 'multiple' : 'single'
        };
    }
    
    // Polygon indicators (check before isochrone, high priority)
    const polygonIndicators = [
        /\bdraw\s+polygon\b/i,
        /\bcreate\s+polygon\b/i,
        /\bpolygon\s+(around|for|of|covering)\b/i,
        /\b(boundary|boundaries|outline|city\s+limits|district\s+boundary)\s+(of|for)\b/i,
        /\bshow\s+(region|area|district|boundary|city\s+limits)\b/i,
        // More flexible: allow words between "polygon" and "from/using/with"
        /\b(polygon|region|boundary)\s+(from|using|with|connecting|joining)\s+.*?(locations?|points?|coordinates?|cities?)/i,
        /\b(polygon|region|boundary)\s+covering\s+(area|region)\s+between\b/i,
        /\bdraw\s+(region|area|boundary|outline)\b/i,
        /\bcreate\s+(region|area|boundary|outline)\b/i,
        /\b(area|region)\s+(between|from|around)\b/i,
        // Additional patterns for common polygon queries
        /\b(polygon|triangle|shape)\s+(with|from)\s+.*?(locations?|points?|cities?)/i,
        /\b(make|build|draw)\s+(a\s+)?(polygon|triangle|shape)\s+(from|using|with)/i
    ];
    
    const hasPolygonIndicator = polygonIndicators.some(pattern => pattern.test(query));
    
    if (hasPolygonIndicator) {
        // Check for multiple polygons
        const hasMultiple = commaCount >= 1 || hasAndOther || /\band\b/i.test(query);
        
        return {
            type: 'polygon',
            subtype: hasMultiple ? 'multiple' : 'single'
        };
    }
    
    // Elevation indicators (check before isochrone, highest priority)
    const elevationIndicators = [
        /\belevation\s+profile\b/i,
        /\belevation\s+chart\b/i,
        /\belevation\s+graph\b/i,
        /\bshow\s+elevation\b/i,
        /\bdisplay\s+elevation\b/i,
        /\belevation\s+along\s+(route|line|path)/i,
        /\bheight\s+profile\b/i,
        /\baltitude\s+profile\b/i,
        /\bterrain\s+profile\b/i
    ];
    
    const hasElevationIndicator = elevationIndicators.some(pattern => pattern.test(query));
    
    if (hasElevationIndicator) {
        return {
            type: 'elevation',
            subtype: 'single'
        };
    }
    
    // Isochrone indicators (check before buffer, high priority)
    const isochroneIndicators = [
        /\bisochrone\b/i,
        /\breachable\s+(area|zone|region)/i,
        /\btravel\s+time\s+(area|zone|region)/i,
        /\b\d+\s*(min|minute|minutes|hour|hours)\s+(drive|driving|walk|walking|bike|cycling|cycle|radius|zone|area)/i,
        /\b\d+\s*(km|mile|miles|meter|meters|m)\s+(drive|driving|walk|walking|bike|cycling|cycle|radius|zone|area|travel\s+time)/i,
        /\b(area|zone|region)\s+reachable\s+(in|within)\s+\d+/i,
        /\b\d+\s*(min|minute|minutes|hour|hours)\s+(zone|area|region|radius)/i,
        /\b(driving|walking|cycling|bike)\s+zone/i,
        /\bservice\s+area/i,
        /\bdelivery\s+zone/i,
        /\bshow\s+\d+\s*(min|minute|minutes|hour|hours)\s+(drive|walk|bike)/i
    ];
    
    const hasIsochroneIndicator = isochroneIndicators.some(pattern => pattern.test(query));
    
    if (hasIsochroneIndicator) {
        // Check for multiple contours (e.g., "15, 30, 45 min")
        const timeMatches = query.match(/\b(\d+)\s*(min|minute|minutes|hour|hours)\b/gi);
        const distanceMatches = query.match(/\b(\d+)\s*(km|mile|miles|meter|meters|m)\b/gi);
        const hasMultipleContours = (timeMatches && timeMatches.length > 1) || (distanceMatches && distanceMatches.length > 1) || 
                                   /\b(and|,)\s+\d+\s*(min|km|mile)/i.test(query);
        
        return {
            type: 'isochrone',
            subtype: hasMultipleContours ? 'multiple' : 'single'
        };
    }
    
    // Buffer/Geofence indicators (check first, highest priority)
    const bufferIndicators = [
        /\bbuffer\b/i,
        /\bgeofence\b/i,
        /\bgeofencing\b/i,
        /\bperimeter\b/i,
        /\bradius\b/i,
        /\barea\s+within/i,
        /\bwithin\s+\d+\s*(km|mile|m)\s+(of|around|from)/i,
        /\b\d+\s*(km|mile|m)\s+(buffer|radius|area|geofence|perimeter)/i,
        /\badd\s+\d+\s*(km|mile|m)\s+buffer/i,
        /\bcreate\s+(a\s+)?\d+\s*(km|mile|m)\s+(geofence|buffer|radius)/i,
        /\bshow\s+(a\s+)?\d+\s*(km|mile|m)\s+(perimeter|radius|area)/i
    ];
    
    const hasBufferIndicator = bufferIndicators.some(pattern => pattern.test(query));
    
    if (hasBufferIndicator) {
        // Check for multiple locations in buffer query
        const commaCount = (query.match(/,/g) || []).length;
        const locationCount = commaCount + 1;
        const hasAndOther = /\band\s+(\d+|ten|X)\s+other/gi.test(query);
        const hasAnd = /\band\b/i.test(query) && !/\band\s+(the|a|an|this|that)/i.test(query);
        const hasMultipleLocations = locationCount >= 2 || hasAndOther || hasAnd;
        
        return {
            type: 'buffer',
            subtype: hasMultipleLocations ? 'multiple' : 'single'
        };
    }
    
    // Strong line/route indicators (check FIRST before location-only patterns)
    const strongLineIndicators = [
        /\broute\s+from\s+\w+.*\s+to\s+\w+/i,  // "route from X to Y" or "route to X from Y"
        /\broute\s+to\s+\w+.*\s+from\s+\w+/i,  // "route to X from Y"
        /\bdirections?\s+(from|to|between)/i,  // "directions from X"
        /\b(from|between)\s+\w+.*\s+(to|and)\s+\w+/i,  // "from X to Y" or "between X and Y"
        /\bconnect\s+\w+.*\s+with\s+(a\s+)?line/i,  // "connect X with a line"
        /\bpath\s+(through|via|from)/i,  // "path through X"
        /\bchain\s+of/i,  // "chain of X"
        /\bsequence\s+of/i,  // "sequence of X"
        /\bwaypoints?\s*:/i,  // "waypoints: X"
        /\bthrough\s+\w+.*,\s*\w+/i,  // "through X, Y"
        /\bvia\s+\w+.*,\s*\w+/i  // "via X, Y"
    ];
    
    // Check for route keywords FIRST (before location-only patterns)
    const hasRouteWord = /\broute\b/i.test(query);
    const hasStrongLine = strongLineIndicators.some(pattern => pattern.test(query));
    
    // If route keyword or strong line indicators exist, prioritize line detection
    if (hasRouteWord || hasStrongLine) {
        // Determine if route or direct line
        const isRoute = hasRouteWord || /\b(directions?|driving|walking|cycling|how\s+to\s+get)\b/i.test(query);
        const isMultiple = locationCount >= 3 || hasAndOther || 
                          /\b(through|via|connecting|chain|sequence)\b/i.test(query);
        
        return {
            type: 'line',
            subtype: isRoute ? (isMultiple ? 'route-multi' : 'route-single') : 
                              (isMultiple ? 'direct-multi' : 'direct-single')
        };
    }
    
    // Exclude patterns that are clearly location queries (not lines)
    const locationOnlyPatterns = [
        /^where is/i,
        /^show me\s+(?!route|directions|path|way)/i,  // "show me" but NOT "show me route"
        /^find\s+(?!route|directions|path)/i,  // "find" but NOT "find route"
        /^locate/i,
        /what is the location of/i,
        /coordinates? of/i,
        /location of/i,
        /position of/i
    ];
    
    // Check if it's clearly a location query (single point)
    const isLocationQuery = locationOnlyPatterns.some(pattern => pattern.test(userMessage));
    
    // Moderate line indicators (need context)
    const moderateLineIndicators = [
        /\bdistance\s+(between|from)/i,  // "distance between X and Y"
        /\bconnect\s+\w+/i,  // "connect X, Y"
        /\bthrough\s+\w+/i,  // "through X"
        /\bvia\s+\w+/i  // "via X"
    ];
    
    // Point query indicators
    const pointIndicators = [
        /\bwhere\s+is\b/i,
        /\bshow\s+me\b/i,
        /\bfind\b/i,
        /\blocate\b/i,
        /\bcoordinates?\s+of\b/i,
        /\blocation\s+of\b/i,
        /\bposition\s+of\b/i,
        /\bwhat\s+is\s+the\s+location/i,
        /\btop\s+\d+\s+places/i,  // "top 10 places"
        /\bmultiple\s+locations/i,
        /\blist\s+of\s+locations/i
    ];
    
    // Decision logic
    if (isLocationQuery) {
        // Clear location query - prioritize point workflow
        const isMultiple = pointIndicators.some(p => p.test(query)) && 
                          (locationCount >= 2 || hasAndOther || query.includes('top') || query.includes('list'));
        
        return {
            type: 'point',
            subtype: isMultiple ? 'multiple' : 'single'
        };
    }
    
    
    // Check for moderate line indicators
    const hasModerateLine = moderateLineIndicators.some(pattern => pattern.test(query));
    
    if (hasModerateLine && locationCount >= 2) {
        // Moderate line indicators + multiple locations = likely line
        // BUT check if it's actually a polygon request first
        const hasPolygonHint = /\b(polygon|triangle|shape|boundary|area|region)\b/i.test(query) || 
                              /\b(polygon|triangle|shape|boundary)\b/i.test(aiMessage?.toLowerCase() || '');
        
        if (hasPolygonHint && locationCount >= 3) {
            // More likely polygon (triangle) than line
            return {
                type: 'polygon',
                subtype: 'single'
            };
        }
        
        const isRoute = /\b(distance\s+between|route|directions?)\b/i.test(query);
        
        return {
            type: 'line',
            subtype: isRoute ? (locationCount > 2 ? 'route-multi' : 'route-single') : 
                              (locationCount > 2 ? 'direct-multi' : 'direct-single')
        };
    }
    
    // Check for point indicators
    const hasPoint = pointIndicators.some(pattern => pattern.test(query));
    
    if (hasPoint) {
        const isMultiple = locationCount >= 2 || hasAndOther || 
                          query.includes('top') || query.includes('list');
        
        return {
            type: 'point',
            subtype: isMultiple ? 'multiple' : 'single'
        };
    }
    
    // Default: if multiple locations mentioned, check for polygon vs line
    if (locationCount >= 3) {
        // 3+ locations could be polygon (triangle) or line (route)
        const hasPolygonHint = /\b(polygon|triangle|shape|boundary|area|region|connecting|joining)\b/i.test(query) ||
                              /\b(polygon|triangle|shape|boundary)\b/i.test(aiMessage?.toLowerCase() || '');
        const hasLineHint = /\b(route|connect|path|chain|sequence|directions?|from.*to)\b/i.test(query);
        
        // If polygon hint exists and no line hint, prefer polygon
        if (hasPolygonHint && !hasLineHint) {
            return {
                type: 'polygon',
                subtype: 'single'
            };
        }
        
        // If line hint exists, prefer line
        if (hasLineHint) {
            const isRoute = /\b(route|directions?|driving|walking|cycling)\b/i.test(query);
            return {
                type: 'line',
                subtype: isRoute ? 'route-multi' : 'direct-multi'
            };
        }
        
        // Default for 3+ locations: try direct line (could be polygon too, but line is more common for routes)
        return {
            type: 'line',
            subtype: 'direct-multi'
        };
    }
    
    // If 2 locations, check for polygon vs line intent
    if (locationCount >= 2) {
        const hasPolygonHint = /\b(polygon|triangle|shape|boundary|connecting|joining)\b/i.test(query) ||
                              /\b(polygon|triangle|shape|boundary)\b/i.test(aiMessage?.toLowerCase() || '');
        const hasLineHint = /\b(route|connect|path|between|from.*to|directions?)\b/i.test(query);
        
        // If polygon hint exists, prefer polygon
        if (hasPolygonHint && !hasLineHint) {
            return {
                type: 'polygon',
                subtype: 'single'
            };
        }
        
        // Otherwise, default to line for 2 locations
        const isRoute = /\b(route|directions?|driving|walking|cycling)\b/i.test(query);
        return {
            type: 'line',
            subtype: isRoute ? 'route-single' : 'direct-single'
        };
    }
    
    // Final default: single point
    return {
        type: 'point',
        subtype: 'single'
    };
}

