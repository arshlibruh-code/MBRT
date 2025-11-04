import { MAPBOX_ACCESS_TOKEN, PERPLEXITY_API_KEY } from './config.js';
import { detectQueryType } from './utils/queryDetector.js';
import { extractCoordinates } from './agents/pointAgent.js';
import { extractLineCoordinates } from './agents/lineAgent.js';
import { extractBuffer } from './agents/bufferAgent.js';
import { extractIsochrone } from './agents/isochroneAgent.js';
import { extractPolygon } from './agents/polygonAgent.js';
import { extractElevationProfile } from './agents/elevationAgent.js';
import { displayIsochroneOnMap } from './utils/mapDisplay.js';
import { tracker } from './utils/performanceTracker.js';
import { handleCommand, isCommand, searchCommands, getAllCommands, setSelectedFeature, getSelectedFeature } from './utils/commands.js';

// Set Mapbox token
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

// Initialize map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-74.006, 40.7128],
    zoom: 12,
    attributionControl: false
});

// Chat input
const chatInput = document.getElementById('chat-input');
const commandSuggestions = document.getElementById('command-suggestions');
const cancelNotice = document.getElementById('cancel-notice');
let selectedSuggestionIndex = -1;
let currentSuggestions = [];

// Request state management
let isProcessing = false;
let currentAbortController = null;
let currentRequestPromise = null;

// Feature fly-to state
let currentFlyToHandler = null;

// Show command suggestions
function showCommandSuggestions(query) {
    if (!query || !query.trim().startsWith('@')) {
        commandSuggestions.classList.remove('visible');
        currentSuggestions = [];
        selectedSuggestionIndex = -1;
        return;
    }
    
    const suggestions = searchCommands(query);
    currentSuggestions = suggestions;
    selectedSuggestionIndex = -1;
    
    if (suggestions.length === 0) {
        commandSuggestions.classList.remove('visible');
        return;
    }
    
    // Render suggestions
    commandSuggestions.innerHTML = suggestions.map((cmd, index) => {
        return `
            <div class="command-suggestion-item" data-index="${index}">
                <div class="command-suggestion-name">${cmd.fullCommand}</div>
                <div class="command-suggestion-description">${cmd.description}</div>
            </div>
        `;
    }).join('');
    
    commandSuggestions.classList.add('visible');
    
    // Add click handlers
    commandSuggestions.querySelectorAll('.command-suggestion-item').forEach((item, index) => {
        item.addEventListener('click', () => {
            selectSuggestion(index);
        });
        
        // Add hover handlers for features (fly to feature on hover)
        if (suggestions[index].isFeature && suggestions[index].featureData) {
            item.addEventListener('mouseenter', () => {
                flyToFeature(suggestions[index].featureData, map);
            });
        }
    });
}

// Select a suggestion
function selectSuggestion(index) {
    if (index >= 0 && index < currentSuggestions.length) {
        const selected = currentSuggestions[index];
        
        // Special handling for @feature command - show features instead of selecting it
        if (selected.isFeatureCommand && selected.fullCommand === '@feature') {
            // Show all features by updating the input to @feature
            chatInput.value = '@feature ';
            
            // Small delay to ensure input is updated before showing suggestions
            setTimeout(() => {
                chatInput.focus();
                // Trigger input event manually for mobile browsers
                const inputEvent = new Event('input', { bubbles: true });
                chatInput.dispatchEvent(inputEvent);
                // Also directly call showCommandSuggestions to ensure it works
                showCommandSuggestions('@feature ');
            }, 50);
        } else {
            chatInput.value = selected.fullCommand;
            commandSuggestions.classList.remove('visible');
            chatInput.focus();
        }
    }
}

// Handle keyboard navigation
function handleSuggestionNavigation(e) {
    if (!commandSuggestions.classList.contains('visible')) return;
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, currentSuggestions.length - 1);
        updateSuggestionSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        updateSuggestionSelection();
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        selectSuggestion(selectedSuggestionIndex);
    } else if (e.key === 'Escape') {
        commandSuggestions.classList.remove('visible');
        selectedSuggestionIndex = -1;
    }
}

// Update suggestion selection highlighting
function updateSuggestionSelection() {
    commandSuggestions.querySelectorAll('.command-suggestion-item').forEach((item, index) => {
        if (index === selectedSuggestionIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
            
            // Fly to feature if it's a feature suggestion
            if (currentSuggestions[index] && currentSuggestions[index].isFeature && currentSuggestions[index].featureData) {
                flyToFeature(currentSuggestions[index].featureData, map);
            }
        } else {
            item.classList.remove('selected');
        }
    });
}

// Fly to feature on map
let lastFlyToFeatureId = null; // Track last feature we flew to
let isFlying = false; // Track if map is currently flying

function flyToFeature(featureData, map) {
    if (!featureData || !featureData.type) {
        return;
    }
    
    // Skip if we're already flying to this same feature
    const featureId = featureData.id || `${featureData.type}-${featureData.name || 'unknown'}`;
    if (lastFlyToFeatureId === featureId && isFlying) {
        return; // Already flying to this feature, skip
    }
    
    // Cancel previous fly operation
    if (currentFlyToHandler) {
        clearTimeout(currentFlyToHandler);
    }
    
    // Debounce to prevent excessive flying
    currentFlyToHandler = setTimeout(() => {
        try {
            let center = null;
            let bounds = null;
            
            if (featureData.type === 'line') {
                // For lines, calculate bounds from all coordinates
                if (featureData.coordinates && featureData.coordinates.length > 0) {
                    const firstCoord = featureData.coordinates[0];
                    if (Array.isArray(firstCoord) && firstCoord.length >= 2) {
                        bounds = new mapboxgl.LngLatBounds(firstCoord, firstCoord);
                        featureData.coordinates.forEach(coord => {
                            if (Array.isArray(coord) && coord.length >= 2) {
                                bounds.extend(coord);
                            }
                        });
                    }
                }
            } else if (featureData.type === 'marker') {
                // For markers, coordinates is [lngLat] where lngLat is [lon, lat] array
                if (featureData.coordinates && featureData.coordinates.length > 0) {
                    const lngLat = featureData.coordinates[0];
                    if (Array.isArray(lngLat) && lngLat.length >= 2) {
                        center = lngLat; // [lon, lat]
                    }
                }
            } else if (featureData.type === 'buffer') {
                // For buffers, coordinates is center [lon, lat] array
                if (featureData.coordinates) {
                    if (Array.isArray(featureData.coordinates) && featureData.coordinates.length >= 2) {
                        center = featureData.coordinates; // [lon, lat]
                    } else if (typeof featureData.coordinates === 'object') {
                        // Handle object format if needed
                        const lon = featureData.coordinates.lng || featureData.coordinates.lon || featureData.coordinates[0];
                        const lat = featureData.coordinates.lat || featureData.coordinates[1];
                        if (lon !== undefined && lat !== undefined) {
                            center = [lon, lat];
                        }
                    }
                }
            } else if (featureData.type === 'polygon') {
                // For polygons, calculate bounds from coordinates
                if (featureData.coordinates && featureData.coordinates.length > 0) {
                    const firstCoord = featureData.coordinates[0];
                    if (Array.isArray(firstCoord) && firstCoord.length >= 2) {
                        bounds = new mapboxgl.LngLatBounds(firstCoord, firstCoord);
                        featureData.coordinates.forEach(coord => {
                            if (Array.isArray(coord) && coord.length >= 2) {
                                bounds.extend(coord);
                            }
                        });
                    }
                }
            } else if (featureData.type === 'isochrone') {
                // For isochrones, coordinates is center [lon, lat] array
                if (featureData.coordinates) {
                    if (Array.isArray(featureData.coordinates) && featureData.coordinates.length >= 2) {
                        center = featureData.coordinates; // [lon, lat]
                    } else if (typeof featureData.coordinates === 'object') {
                        // Handle object format if needed
                        const lon = featureData.coordinates.lng || featureData.coordinates.lon || featureData.coordinates[0];
                        const lat = featureData.coordinates.lat || featureData.coordinates[1];
                        if (lon !== undefined && lat !== undefined) {
                            center = [lon, lat];
                        }
                    }
                }
            }
            
            // Fly to feature
            if (bounds) {
                // Check if bounds are valid by checking if they have valid extent
                try {
                    const sw = bounds.getSouthWest();
                    const ne = bounds.getNorthEast();
                    // Validate bounds have valid coordinates
                    if (sw && ne && 
                        typeof sw.lng === 'number' && typeof sw.lat === 'number' &&
                        typeof ne.lng === 'number' && typeof ne.lat === 'number' &&
                        !isNaN(sw.lng) && !isNaN(sw.lat) && !isNaN(ne.lng) && !isNaN(ne.lat)) {
                        // Use fitBounds for lines/polygons
                        isFlying = true;
                        lastFlyToFeatureId = featureId;
                        
                        map.flyTo({
                            bounds: bounds,
                            padding: 50,
                            duration: 800,
                            essential: true
                        });
                        
                        // Reset flying flag after animation completes
                        map.once('moveend', () => {
                            isFlying = false;
                        });
                    }
                } catch (e) {
                    // Bounds invalid, skip
                }
            }
            
            // If bounds didn't work, try center
            if (!isFlying && center && Array.isArray(center) && center.length >= 2) {
                // Use flyTo for points/buffers/isochrones
                isFlying = true;
                lastFlyToFeatureId = featureId;
                
                map.flyTo({
                    center: center,
                    zoom: 14,
                    duration: 800,
                    essential: true
                });
                
                // Reset flying flag after animation completes
                map.once('moveend', () => {
                    isFlying = false;
                });
            }
        } catch (error) {
            console.error('Error flying to feature:', error);
            isFlying = false;
        }
        
        currentFlyToHandler = null;
    }, 200); // 200ms debounce
}

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!chatInput.contains(e.target) && !commandSuggestions.contains(e.target)) {
        commandSuggestions.classList.remove('visible');
    }
});

// Set thinking state
function setThinkingState() {
    isProcessing = true;
    chatInput.classList.add('thinking');
    chatInput.placeholder = 'Thinking...';
    chatInput.disabled = false; // Allow typing to cancel
    // Add thinking class to container for animated shadow
    const container = chatInput.closest('.chat-input-container');
    if (container) {
        container.classList.add('thinking');
    }
}

// Clear thinking state
function clearThinkingState() {
    isProcessing = false;
    chatInput.classList.remove('thinking');
    chatInput.placeholder = 'Ask about directions, places... or type @ for commands';
    chatInput.disabled = false;
    // Remove thinking class from container
    const container = chatInput.closest('.chat-input-container');
    if (container) {
        container.classList.remove('thinking');
    }
    // Hide cancel notice
    if (cancelNotice) {
        cancelNotice.classList.remove('visible');
    }
}

// Cancel current request
function cancelCurrentRequest() {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    if (currentRequestPromise) {
        currentRequestPromise = null;
    }
    clearThinkingState();
    tracker.end(); // End any ongoing tracking
}

// Input event for autocomplete
chatInput.addEventListener('input', (e) => {
    const value = chatInput.value;
    showCommandSuggestions(value);
    
    // Show cancel notice if processing and user is typing
    if (isProcessing && value.trim().length > 0) {
        cancelNotice.classList.add('visible');
    } else {
        cancelNotice.classList.remove('visible');
    }
});

// Handle CMD+Backspace (or Ctrl+Backspace on Windows/Linux) to cancel
chatInput.addEventListener('keydown', (e) => {
    // CMD+Backspace on Mac, Ctrl+Backspace on Windows/Linux
    if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        if (isProcessing) {
            e.preventDefault();
            cancelCurrentRequest();
            chatInput.value = '';
        }
    }
    
    // Also handle navigation for suggestions
    handleSuggestionNavigation(e);
});

chatInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        // Cancel any previous request
        if (isProcessing) {
            cancelCurrentRequest();
        }
        
        const userMessage = chatInput.value.trim();
        chatInput.value = '';
        
        // Hide suggestions
        commandSuggestions.classList.remove('visible');
        selectedSuggestionIndex = -1;
        
        console.log('User message:', userMessage);
        
        // Check if it's a command (starts with @)
        if (isCommand(userMessage)) {
            // Check if it's a feature selection command
            if (userMessage.startsWith('@feature ')) {
                const featureId = userMessage.replace('@feature ', '').trim();
                const selected = setSelectedFeature(featureId, map);
                if (selected) {
                    console.log(`✅ Selected feature: ${selected.name}`);
                    clearThinkingState();
                    // Keep input focused for feature selection so user can type next command
                    chatInput.focus();
                    return;
                } else {
                    console.log(`❌ Feature not found: ${featureId}`);
                    clearThinkingState();
                    // Keep input focused even on error so user can try again
                    chatInput.focus();
                    return;
                }
            }
            
            // For other commands, blur to close mobile keyboard
            chatInput.blur();
            handleCommand(userMessage, map);
            return; // Skip Perplexity API call
        }
        
        // Check if this is an elevation query with a selected feature - skip API call
        const selectedFeature = getSelectedFeature();
        const isElevationQuery = userMessage.toLowerCase().includes('elevation') || 
                                 userMessage.toLowerCase().includes('elevation profile') ||
                                 userMessage.toLowerCase().includes('show elevation');
        
        if (isElevationQuery && selectedFeature && selectedFeature.type === 'line') {
            // Skip Perplexity API call - use selected feature directly
            console.log('✅ Skipping Perplexity API - using selected feature for elevation profile');
            tracker.start(`Processing query: "${userMessage.substring(0, 50)}..."`);
            
            // Detect query type
            const queryType = detectQueryType(userMessage, '');
            console.log('\n=== QUERY TYPE DETECTED ===');
            console.log('Type:', queryType.type);
            console.log('Subtype:', queryType.subtype);
            
            // Display elevation profile directly
            console.log('\n=== ELEVATION WORKFLOW ===');
            await extractElevationProfile(userMessage, '', queryType, map);
            
            tracker.end();
            clearThinkingState();
            return;
        }
        
        // For regular queries, blur to close mobile keyboard
        chatInput.blur();
        
        // Set thinking state
        setThinkingState();
        
        // Create AbortController for this request
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;
        
        // Start performance tracking
        tracker.start(`Processing query: "${userMessage.substring(0, 50)}..."`);
        
        try {
            // Create request promise
            currentRequestPromise = fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'sonar',
                    messages: [
                        { role: 'user', content: userMessage }
                    ]
                }),
                signal: signal
            });

            const response = await currentRequestPromise;
            
            // Check if request was aborted
            if (signal.aborted) {
                return;
            }
            
            const data = await response.json();
            tracker.step('Initial Perplexity API call');
            
            // Extract all the data
            const aiMessage = data.choices[0]?.message?.content || '';
            const citations = data.citations || [];
            const searchResults = data.search_results || [];
            const usage = data.usage || {};
            const metadata = {
                id: data.id,
                model: data.model,
                created: data.created,
                object: data.object
            };
            
            // Log everything
            console.log('=== MESSAGE CONTENT ===');
            console.log(aiMessage);
            console.log('\n=== CITATIONS ===');
            console.log(citations);
            console.log('\n=== SEARCH RESULTS ===');
            console.log(searchResults);
            console.log('\n=== USAGE STATS ===');
            console.log(usage);
            console.log('\n=== METADATA ===');
            console.log(metadata);
            
            tracker.step('Query type detection');
            // Improved query detection
            const queryType = detectQueryType(userMessage, aiMessage);
            
            console.log(`\n=== QUERY TYPE DETECTED ===`);
            console.log(`Type: ${queryType.type}`);
            console.log(`Subtype: ${queryType.subtype}`);
            
            // Route to appropriate workflow
            if (queryType.type === 'buffer') {
                console.log('\n=== BUFFER/GEOFENCE WORKFLOW ===');
                await extractBuffer(userMessage, aiMessage, queryType, map);
            } else if (queryType.type === 'polygon') {
                console.log('\n=== POLYGON WORKFLOW ===');
                await extractPolygon(userMessage, aiMessage, queryType, map);
            } else if (queryType.type === 'isochrone') {
                console.log('\n=== ISOCHRONE WORKFLOW ===');
                const result = await extractIsochrone(userMessage, aiMessage, queryType, map);
                if (result.success) {
                    displayIsochroneOnMap(result.isochroneData, result.coordinates, map);
                }
            } else if (queryType.type === 'line') {
                console.log('\n=== LINE/ROUTE WORKFLOW ===');
                await extractLineCoordinates(userMessage, aiMessage, queryType, map);
            } else if (queryType.type === 'point') {
                console.log('\n=== POINT WORKFLOW ===');
                await extractCoordinates(userMessage, aiMessage, queryType, map);
            } else if (queryType.type === 'elevation') {
                console.log('\n=== ELEVATION WORKFLOW ===');
                await extractElevationProfile(userMessage, aiMessage, queryType, map);
            }
            
            // End performance tracking
            tracker.end();
            
            // Clear thinking state
            clearThinkingState();
            currentAbortController = null;
            currentRequestPromise = null;
        } catch (error) {
            // Handle abort error
            if (error.name === 'AbortError') {
                console.log('Request cancelled');
                clearThinkingState();
            } else {
                console.error('Error:', error);
                clearThinkingState();
            }
            currentAbortController = null;
            currentRequestPromise = null;
        }
    }
});
