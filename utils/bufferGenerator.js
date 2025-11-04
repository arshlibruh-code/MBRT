// Generate circle polygon for buffer/geofence
export function generateCircle(center, radiusKm, numPoints = 64) {
    const [lat, lon] = center;
    const points = [];
    
    // Convert radius to degrees (approximate)
    // 1 degree latitude ≈ 111 km
    // 1 degree longitude ≈ 111 km * cos(latitude)
    const latOffset = radiusKm / 111;
    const lonOffset = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    
    // Generate points around the circle
    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * 2 * Math.PI;
        
        // Calculate point at radius distance
        const pointLat = lat + latOffset * Math.sin(angle);
        const pointLon = lon + lonOffset * Math.cos(angle);
        
        // Mapbox format: [lon, lat]
        points.push([pointLon, pointLat]);
    }
    
    return points;
}

