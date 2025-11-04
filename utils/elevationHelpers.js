/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function haversineDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculate total distance of a LineString
 */
export function calculateLineDistance(coordinates) {
    let totalDistance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
        totalDistance += haversineDistance(coordinates[i], coordinates[i + 1]);
    }
    return totalDistance;
}

/**
 * Find a point along a line segment at a given distance
 * Returns [lon, lat] or null if distance exceeds segment
 */
function pointAlongSegment(start, end, distance) {
    const segmentDistance = haversineDistance(start, end);
    if (distance > segmentDistance) return null;
    
    const ratio = distance / segmentDistance;
    const [lon1, lat1] = start;
    const [lon2, lat2] = end;
    
    return [
        lon1 + (lon2 - lon1) * ratio,
        lat1 + (lat2 - lat1) * ratio
    ];
}

/**
 * Find a point along a LineString at a given distance from the start
 */
export function pointAlongLine(coordinates, distance) {
    let accumulatedDistance = 0;
    
    for (let i = 0; i < coordinates.length - 1; i++) {
        const segmentStart = coordinates[i];
        const segmentEnd = coordinates[i + 1];
        const segmentDistance = haversineDistance(segmentStart, segmentEnd);
        
        if (accumulatedDistance + segmentDistance >= distance) {
            // Point is on this segment
            const remainingDistance = distance - accumulatedDistance;
            return pointAlongSegment(segmentStart, segmentEnd, remainingDistance);
        }
        
        accumulatedDistance += segmentDistance;
    }
    
    // Distance exceeds line length, return last point
    return coordinates[coordinates.length - 1];
}

/**
 * Split a LineString into chunks of specified length (in km)
 * Returns array of coordinate arrays, each representing a chunk
 * Similar to turf.lineChunk but without Turf.js
 */
export function lineChunk(coordinates, chunkLengthKm = 1) {
    const chunks = [];
    const totalDistance = calculateLineDistance(coordinates);
    
    // If line is shorter than chunk length, return single chunk
    if (totalDistance <= chunkLengthKm) {
        return [coordinates];
    }
    
    // Generate points at regular intervals
    const points = [];
    
    // Always include first point
    points.push(coordinates[0]);
    
    // Add points at chunk intervals
    let currentDistance = chunkLengthKm;
    while (currentDistance < totalDistance) {
        const point = pointAlongLine(coordinates, currentDistance);
        if (point) {
            points.push(point);
        }
        currentDistance += chunkLengthKm;
    }
    
    // Always include last point
    const lastPoint = coordinates[coordinates.length - 1];
    if (points.length > 0 && haversineDistance(points[points.length - 1], lastPoint) > 0.01) {
        points.push(lastPoint);
    }
    
    // Create chunks from points
    for (let i = 0; i < points.length - 1; i++) {
        chunks.push([points[i], points[i + 1]]);
    }
    
    return chunks;
}

/**
 * Get elevation points along a line
 * Splits line into chunks and queries elevation at each chunk start point
 */
export function getElevationPoints(coordinates, map, chunkLengthKm = 1) {
    const chunks = lineChunk(coordinates, chunkLengthKm);
    const elevations = [];
    const totalDistance = calculateLineDistance(coordinates);
    
    // Query elevation at start of each chunk
    let accumulatedDistance = 0;
    chunks.forEach((chunk, index) => {
        const point = chunk[0];
        const elevation = map.queryTerrainElevation(point);
        
        if (elevation !== null && elevation !== undefined) {
            // Use accumulated distance (simpler approach)
            elevations.push({
                coordinate: point,
                elevation: elevation,
                distance: accumulatedDistance
            });
        }
        
        // Update accumulated distance for next iteration
        accumulatedDistance += chunkLengthKm;
    });
    
    // Always include last coordinate
    const lastCoord = coordinates[coordinates.length - 1];
    const lastElevation = map.queryTerrainElevation(lastCoord);
    if (lastElevation !== null && lastElevation !== undefined) {
        const lastDistance = totalDistance;
        
        // Check if last point is already in elevations
        const lastPointExists = elevations.some(e => 
            Math.abs(e.coordinate[0] - lastCoord[0]) < 0.0001 &&
            Math.abs(e.coordinate[1] - lastCoord[1]) < 0.0001
        );
        
        if (!lastPointExists) {
            elevations.push({
                coordinate: lastCoord,
                elevation: lastElevation,
                distance: lastDistance
            });
        }
    }
    
    // Sort by distance to ensure correct order
    elevations.sort((a, b) => a.distance - b.distance);
    
    return elevations;
}

