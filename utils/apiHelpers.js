import { PERPLEXITY_API_KEY } from '../config.js';

// Helper function to call Perplexity API
export async function callPerplexity(promptOrMessages) {
    const messages = Array.isArray(promptOrMessages) 
        ? promptOrMessages 
        : [{ role: 'user', content: promptOrMessages }];
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'sonar',
            messages: messages
        })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

