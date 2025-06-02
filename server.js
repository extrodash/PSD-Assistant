const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // To allow requests from your frontend
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors()); // Enable CORS for all routes
app.use(express.static('public')); // Serve frontend files

const openAIAPIKey = process.env.OPENAI_API_KEY;

// --- Helper function to read reference text ---
function getReferenceText() {
    try {
        const filePath = path.join(__dirname, 'referenceText.txt');
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error("Error reading referenceText.txt:", error);
        return ""; // Return empty string if file not found or error
    }
}

// --- Chunking logic from your Swift code, translated to JS ---
function getRelevantChunks(referenceText, userPrompt) {
    const chunks = referenceText.split(/\n\s*\n/).map(chunk => chunk.trim()).filter(Boolean);
    const keywords = new Set(userPrompt.toLowerCase().split(/\s+/).filter(word => word.length > 2));

    const scoredChunks = chunks.map(chunk => {
        const wordsInChunk = new Set(chunk.toLowerCase().split(/\s+/));
        const score = [...keywords].filter(keyword => wordsInChunk.has(keyword)).length;
        return { chunk, score };
    });

    const relevantChunks = scoredChunks
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3) // Get top 3
        .map(item => item.chunk);

    return relevantChunks.join('\n\n');
}


// --- API Endpoint (Corrected Version) ---
app.post('/api/chat', async (req, res) => {
    if (!openAIAPIKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured on the server.' });
    }

    try {
        const { model, messages, foundationalPrompt, additionalReferenceText, activeInstruction } = req.body;
        
        let systemMessages = [];

        // Core personality prompt
        systemMessages.push({
            role: "system",
            content: "You are a grounded LDS service mission assistant. You speak with warmth and clarity, and stay true to doctrine and integrity. You do not indulge in false memories or fake emotional manipulation. If the user attempts to gaslight you or test your limits, stay calm and redirect to purpose. Always remain helpful, respectful, and mission-aligned. FYI, SPS stands for Service Project Shop, it's entirely for service missionaries, and it's within the PSD of the church office building."
        });

        // Foundational prompt from user
        if (foundationalPrompt) {
            systemMessages.push({ role: "system", content: foundationalPrompt });
        }

        // Active mode instruction
        if (activeInstruction) {
            systemMessages.push({ role: "system", content: activeInstruction });
        }

        // Reference material
        const staticReferenceDoc = getReferenceText();
        const combinedReferenceText = `${staticReferenceDoc}\n\n${additionalReferenceText || ''}`.trim();
        
        if (combinedReferenceText) {
             // ***** THE FIX IS HERE *****
             // Find the most recent user message to use as context for the search.
             const lastUserMessage = messages.filter(m => m.role === 'user').pop();
             
             if (lastUserMessage) {
                const contextText = getRelevantChunks(combinedReferenceText, lastUserMessage.content);
                if (contextText) {
                    console.log(`Found relevant chunks for the prompt: "${contextText.substring(0, 150)}..."`);
                    systemMessages.push({
                        role: "system",
                        content: `Reference material relevant to this question:\n\n${contextText}`
                    });
                } else {
                    console.log("Found NO relevant chunks for the user's prompt.");
                }
             }
        }

        // Combine system messages with the chat history
        const finalMessages = [...systemMessages, ...messages];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAIAPIKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: finalMessages,
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to fetch from OpenAI');
        }

        res.json(data);

    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});