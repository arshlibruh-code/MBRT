// Parse coordinates from text response
export function parseCoordinates(text) {
    if (!text || text.toLowerCase().includes('none')) {
        return 'none';
    }
    
    // Extract decimal coordinates (flexible format matching)
    // Matches patterns like:
    // - 40.7128,-74.0060 (simple)
    // - 40.7128, -74.0060 (with space)
    // - 40.7128° N, 78.0322° E (with degrees and cardinal)
    // - 30.3165° N, 78.0322° E (with degrees)
    // - 30.3165, 78.0322 (simple with space)
    
    const matches = [];
    const seen = new Set(); // Track seen coordinate pairs to avoid duplicates
    
    // Pattern 1: With degrees symbol and cardinal directions (most specific, try first)
    // Matches: 30.3165° N, 78.0322° E
    let pattern1 = /(-?\d+\.?\d+)\s*°\s*[NS]?\s*[,;|]\s*(-?\d+\.?\d+)\s*°\s*[EW]?/gi;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const key = `${lat},${lon}`;
        
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !seen.has(key)) {
            matches.push(key);
            seen.add(key);
        }
    }
    
    // Pattern 2: Simple lat,lon (with optional space or separator)
    // Matches: 40.7128,-74.0060 or 40.7128, -74.0060 or 40.7128 | -74.0060
    let pattern2 = /(-?\d+\.?\d+)\s*[,;|]\s*(-?\d+\.?\d+)(?![°EW])/g;
    while ((match = pattern2.exec(text)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const key = `${lat},${lon}`;
        
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !seen.has(key)) {
            matches.push(key);
            seen.add(key);
        }
    }
    
    // Pattern 3: With cardinal directions but no degree symbol
    // Matches: 30.3165 N, 78.0322 E
    let pattern3 = /(-?\d+\.?\d+)\s*[NS]?\s*[,;|]\s*(-?\d+\.?\d+)\s*[EW]?/gi;
    while ((match = pattern3.exec(text)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const key = `${lat},${lon}`;
        
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !seen.has(key)) {
            matches.push(key);
            seen.add(key);
        }
    }
    
    if (matches.length === 0) {
        return 'none';
    }
    
    return matches.join(' | ');
}

