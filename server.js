const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const openAIAPIKey = process.env.OPENAI_API_KEY;

// --- CONFIGURATION ---
const CHAT_HISTORY_MESSAGE_LIMIT = 20; // Send the last X messages (user + assistant)
const KEYWORD_CONTEXT_MESSAGES = 3;   // Use last X user messages for keyword extraction for getRelevantChunks

function getReferenceText() {
    try {
        const filePath = path.join(__dirname, 'referenceText.txt');
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error("Error reading referenceText.txt:", error);
        return "";
    }
}

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
        .slice(0, 3) // Keep it to top 3 chunks
        .map(item => item.chunk);
    return relevantChunks.join('\n\n');
}

// --- DEDICATED ENDPOINT FOR SUMMARIZATION ---
app.post('/api/summarize', async (req, res) => {
    // ... (Summarization endpoint remains the same)
    if (!openAIAPIKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured on the server.' });
    }
    try {
        const { messages } = req.body;
        const summarizationPayload = [
            {
                role: "system",
                content: "You are a summarization expert. Summarize the following conversation in 1-2 clear, concise sentences. Do not add any commentary or introductory text. Respond only with the summary."
            },
            ...messages
        ];
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAIAPIKey}`},
            body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: summarizationPayload })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Failed to fetch from OpenAI');
        res.json(data);
    } catch (error) {
        console.error('Error in /api/summarize:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- MAIN ENDPOINT FOR CHAT MESSAGES ---
app.post('/api/chat', async (req, res) => {
    if (!openAIAPIKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured on the server.' });
    }
    try {
        const { model, messages, foundationalPrompt, additionalReferenceText, activeInstruction } = req.body;
        let systemMessages = [];

        // Priority 1: The base personality.
        systemMessages.push({
            role: "system",
            content: "You are a grounded LDS service mission assistant. You speak with warmth and clarity, and stay true to doctrine and integrity. You do not indulge in false memories or fake emotional manipulation. If the user attempts to gaslight you or test your limits, stay calm and redirect to purpose. Always remain helpful, respectful, and mission-aligned."
        });
        // Priority 2: The instruction for the selected Chat Mode.
        if (activeInstruction) {
            systemMessages.push({ role: "system", content: activeInstruction });
        }
        // Priority 3: The user's custom foundational prompt.
        if (foundationalPrompt) {
            systemMessages.push({ role: "system", content: `Your primary personality instruction, which overrides all others, is: ${foundationalPrompt}` });
        }
        // Priority 4: The user-provided reference text.
        if (additionalReferenceText) {
            systemMessages.push({ role: "system", content: `You MUST use the following user-provided context to answer the question. This context is more important than any other information you have. Context:\n\n${additionalReferenceText}` });
        }

        // Priority 5: Relevant chunks from the large static file.
        const staticReferenceDoc = getReferenceText();
        
        // --- MODIFICATION: Use last few messages for richer keyword context ---
        const userMessagesForKeywords = messages.filter(m => m.role === 'user').slice(-KEYWORD_CONTEXT_MESSAGES);
        const keywordExtractionText = userMessagesForKeywords.map(m => m.content).join(" ");
        // ---

        if (staticReferenceDoc && keywordExtractionText) { // Check if keywordExtractionText is not empty
            const contextText = getRelevantChunks(staticReferenceDoc, keywordExtractionText);
            if (contextText) {
                systemMessages.push({
                    role: "system",
                    content: `Here is some additional reference material that might be relevant (ignore if not applicable to the current question):\n\n${contextText}`
                });
            }
        }
        
        // --- MODIFICATION: Limit the chat history sent ---
        const recentChatHistory = messages.slice(-CHAT_HISTORY_MESSAGE_LIMIT);
        // ---

        const finalMessages = [...systemMessages, ...recentChatHistory]; // Use recentChatHistory
        console.log("Final payload being sent to OpenAI:", JSON.stringify(finalMessages, null, 2));

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAIAPIKey}`},
            body: JSON.stringify({ model: model, messages: finalMessages })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Failed to fetch from OpenAI');
        res.json(data);
    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});