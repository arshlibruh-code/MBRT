// API Configuration
// Read from environment variables
export const MAPBOX_ACCESS_TOKEN = import.meta.env.MAPBOX_ACCESS_TOKEN || '';
export const PERPLEXITY_API_KEY = import.meta.env.PERPLEXITY_API_KEY || '';

// Validate that required environment variables are set
if (!MAPBOX_ACCESS_TOKEN) {
    console.warn('⚠️ MAPBOX_ACCESS_TOKEN is not set. Map functionality will not work.');
}

if (!PERPLEXITY_API_KEY) {
    console.warn('⚠️ PERPLEXITY_API_KEY is not set. Natural language processing will not work.');
}
