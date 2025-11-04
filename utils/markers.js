import { createIcons, icons } from 'lucide';

// Create custom numbered marker element (rounded rectangle with number)
export function createCircleMarker(number = null) {
    const el = document.createElement('div');
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.borderRadius = '10px'; // Rounded rectangle, not perfect circle
    el.style.backgroundColor = '#089BDF'; // Blue fill
    el.style.border = '3px solid white'; // Keep current border
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.boxSizing = 'border-box';
    
    // Add number text if provided
    if (number !== null) {
        const numberText = document.createElement('p');
        numberText.textContent = number;
        numberText.style.margin = '0';
        numberText.style.padding = '0';
        numberText.style.color = 'white';
        numberText.style.fontSize = '10px';
        numberText.style.fontWeight = '700';
        numberText.style.lineHeight = '1';
        numberText.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        numberText.style.textAlign = 'center';
        el.appendChild(numberText);
    }
    
    return el;
}

// Create user location marker with Lucide user icon (same style as numbered markers)
export function createUserMarker() {
    const el = document.createElement('div');
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.borderRadius = '10px'; // Rounded rectangle, same as numbered markers
    el.style.backgroundColor = '#089BDF'; // Blue fill, same as numbered markers
    el.style.border = '3px solid white'; // Same border as numbered markers
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.boxSizing = 'border-box';
    
    // Create icon element with data-lucide attribute
    const iconElement = document.createElement('i');
    iconElement.setAttribute('data-lucide', 'user');
    el.appendChild(iconElement);
    
    // Initialize Lucide icons - this will replace <i> with <svg>
    createIcons({ icons }, el);
    
    // Style the created SVG
    setTimeout(() => {
        const svg = el.querySelector('svg');
        if (svg) {
            svg.style.width = '12px';
            svg.style.height = '12px';
            svg.setAttribute('stroke', 'white');
            svg.setAttribute('stroke-width', '2');
        }
    }, 0);
    
    return el;
}

