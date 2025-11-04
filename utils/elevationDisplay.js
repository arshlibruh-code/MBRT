import { getElevationPoints, calculateLineDistance, pointAlongLine } from './elevationHelpers.js';

let elevationMarker = null;


/**
 * Display elevation profile on map as an HTML marker
 * Similar to the cluster example - marker stays attached to map coordinates
 */
export function displayElevationProfileOnMap(coordinates, map) {
    // Clean up previous elevation profile
    if (elevationMarker) {
        elevationMarker.remove();
        elevationMarker = null;
    }
    
    // Ensure terrain is enabled
    if (!map.getTerrain()) {
        // Add DEM source if it doesn't exist
        if (!map.getSource('mapbox-dem')) {
            map.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 20
            });
        }
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1 });
    }
    
    // Wait for terrain to load, then get elevation data
    map.once('idle', () => {
        const elevationData = getElevationPoints(coordinates, map, 1); // 1km chunks
        
        if (elevationData.length === 0) {
            console.warn('No elevation data available');
            return;
        }
        
        // Calculate actual midpoint of route for marker position
        // For a line, calculate the point at half the total distance
        const totalDistance = calculateLineDistance(coordinates);
        const midpointDistance = totalDistance / 2;
        const midpoint = pointAlongLine(coordinates, midpointDistance);
        
        // Create chart element (without rendering Plotly yet)
        const chartElement = createElevationChartContainer();
        
        // Create marker (automatically stays attached to map)
        elevationMarker = new mapboxgl.Marker({
            element: chartElement,
            anchor: 'center'
        })
        .setLngLat(midpoint)
        .addTo(map);
        
        // Now render Plotly chart after marker is in DOM
        setTimeout(() => {
            renderPlotlyChart(chartElement.querySelector('div'), elevationData);
        }, 100);
        
        console.log(`✅ Elevation profile displayed with ${elevationData.length} points`);
    });
}

/**
 * Create chart container without rendering Plotly
 */
function createElevationChartContainer() {
    // Create container div
    const container = document.createElement('div');
    container.style.cssText = `
        width: 600px;
        height: 200px;
        background: rgba(0, 0, 0, 0.1);
        border: 1px solid rgb(255 255 255 / 8%);
        border-radius: 8px;
        padding: 6px;
        backdrop-filter: blur(20px);
        box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 6px;
        opacity: 1;
        pointer-events: auto;
        transform: translate(519px, 654px) translate(-50%, -50%) translate(0px, 0px);
    `;
    
    // Create div for Plotly chart
    const chartDiv = document.createElement('div');
    chartDiv.style.width = '100%';
    chartDiv.style.height = '100%';
    container.appendChild(chartDiv);
    
    return container;
}

/**
 * Render Plotly chart with elevation data
 */
function renderPlotlyChart(chartDiv, elevationData) {
    // Extract data for Plotly
    const distances = elevationData.map(d => d.distance); // X-axis (km)
    const elevations = elevationData.map(d => d.elevation); // Y-axis (meters)
    
    // Simple Plotly line chart
    const trace = {
        x: distances,
        y: elevations,
        type: 'scatter',
        mode: 'lines',
        line: {
            color: '#089BDF',
            width: 2
        },
        fill: 'tozeroy',
        fillcolor: 'rgba(8, 155, 223, 0.1)'
    };
    
    const layout = {
        title: {
            text: 'ELEVATION PROFILE',
            font: { 
                family: 'Quantico, monospace',
                size: 14,
                color: 'white',
                weight: 'bold'
            }
        },
        xaxis: {
            title: 'DISTANCE (KM)',
            showgrid: false,
            titlefont: { 
                family: 'Quantico, monospace',
                color: 'white',
                weight: 'bold'
            },
            tickfont: { 
                family: 'Quantico, monospace',
                color: 'rgba(255, 255, 255, 0.8)',
                weight: 'bold'
            },
            color: 'rgba(255, 255, 255, 0.8)'
        },
        yaxis: {
            title: 'ELEVATION (M)',
            showgrid: false,
            titlefont: { 
                family: 'Quantico, monospace',
                color: 'white',
                weight: 'bold'
            },
            tickfont: { 
                family: 'Quantico, monospace',
                color: 'rgba(255, 255, 255, 0.8)',
                weight: 'bold'
            },
            color: 'rgba(255, 255, 255, 0.8)'
        },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        autosize: true,
        showlegend: false,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: {
            family: 'Quantico, monospace',
            weight: 'bold'
        }
    };
    
    const config = {
        displayModeBar: false, // Hide toolbar
        staticPlot: true // No interactivity
    };
    
    // Render Plotly chart using DOM element directly
    Plotly.newPlot(chartDiv, [trace], layout, config);
}

/**
 * Clean up elevation profile marker
 */
export function cleanElevationProfile() {
    if (elevationMarker) {
        elevationMarker.remove();
        elevationMarker = null;
    }
}

