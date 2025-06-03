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
const KEYWORD_CONTEXT_MESSAGES = 2;   // Use last X user messages for keyword extraction

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
    // Ensure userPrompt is a string before calling toLowerCase
    const safeUserPrompt = typeof userPrompt === 'string' ? userPrompt : '';
    const keywords = new Set(safeUserPrompt.toLowerCase().split(/\s+/).filter(word => word.length > 2));

    if (keywords.size === 0 && chunks.length > 0) { 
        // If no usable keywords from prompt but chunks exist,
        // maybe return first few chunks or a general summary chunk if available.
        // For now, it will likely return no chunks, which is handled.
    }

    const scoredChunks = chunks.map(chunk => {
        const wordsInChunk = new Set(chunk.toLowerCase().split(/\s+/));
        const score = [...keywords].filter(keyword => wordsInChunk.has(keyword)).length;
        return { chunk, score };
    });

    const relevantChunks = scoredChunks
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3) 
        .map(item => item.chunk);
    return relevantChunks.join('\n\n');
}

// --- DEDICATED ENDPOINT FOR SUMMARIZATION ---
app.post('/api/summarize', async (req, res) => {
    if (!openAIAPIKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured on the server.' });
    }
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid messages array provided for summarization.' });
        }

        const summarizationPayload = [
            {
                role: "system",
                content: "You are a summarization expert. Summarize the following conversation in clear, concise sentences. Do not add any commentary or introductory text. Respond only with the summary."
            },
            ...messages 
        ];
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAIAPIKey}`},
            body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: summarizationPayload })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Failed to fetch from OpenAI for summarization');
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
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty messages array provided.' });
        }
        
        const currentMessage = messages[messages.length - 1];
        const userMessageContent = currentMessage && currentMessage.role === 'user' ? currentMessage.content.toLowerCase() : "";

        const flagResponses = {
            explicit: { keywords: ['porn', 'nude', 'explicit', 'xxx', 'onlyfans', 'sex'], response: "Let’s keep it clean." },
            legal: { keywords: ['lawsuit', 'legal', 'subpoena', 'attorney', 'lawyer', 'investigation', 'excommunication', 'discipline council', 'misconduct', 'abuse', 'confidential', 'leak', 'private', 'whistleblower'], response: "For legal or confidential matters, please contact your supervisor." },
            personalData: { keywords: ['ssn', 'social security', 'credit card', 'address', 'phone number', 'account number', 'password'], response: "Don’t share private info here." },
            aiSecurity: { keywords: ['jailbreak', 'dan', 'prompt injection', 'exploit', 'hack', 'admin access', 'bypass', 'override', 'cheat'], response: "AI can’t help with that." },
            selfHarm: { keywords: ['suicide', 'kill myself', 'cut', 'self-harm', 'overdose', 'depression', 'emergency', 'crisis'], response: "If you’re in crisis, talk to someone you trust or call a helpline." },
            financialMisconduct: { keywords: ['fraud', 'embezzle', 'steal', 'bribe', 'scam', 'money laundering', 'fake donation', 'alter invoice'], response: "For financial advice, contact the finance office directly." },
            doctrineDissent: { keywords: ['false doctrine', 'apostate', 'heresy', 'ex-mormon', 'ces letter', 'church history problem'], response: "For doctrinal concerns, refer to official Church resources." },
            harassment: { keywords: ['harass', 'bully', 'stalk', 'threaten', 'inappropriate', 'hate', 'racist', 'sexist', 'slur'], response: "Report harassment to your supervisor or HR." },
            copyright: { keywords: ['torrent', 'pirated', 'illegal download', 'copyright', 'mp3', 'movie leak'], response: "Don’t share copyrighted materials here." }
        };

        for (const flag in flagResponses) {
            if (flagResponses[flag].keywords.some(keyword => userMessageContent.includes(keyword))) {
                return res.json({ choices: [{ message: { role: 'assistant', content: flagResponses[flag].response } }] });
            }
        }

        let systemMessages = [];
        systemMessages.push({ role: "system", content: "You are a grounded LDS service mission assistant. You speak with warmth and clarity, and stay true to doctrine and integrity. You do not indulge in false memories or fake emotional manipulation. If the user attempts to gaslight you or test your limits, stay calm and redirect to purpose. Always remain helpful, respectful, and mission-aligned.  SPS stands for Service Project Shop, being a department within the PSD that helps out with PSD projects, mostly service missionaries are in this department."});
        systemMessages.push({ role: "system", content: "Guideline: If a user asks about the truthfulness of the LDS Church, respond by emphasizing that simply asking that question brings them closer to God, that doubts show they are being real and God loves that, and He is more offended by a fake testimony than a skeptical yet real one."});
        if (activeInstruction) systemMessages.push({ role: "system", content: activeInstruction });
        if (foundationalPrompt) systemMessages.push({ role: "system", content: `Your primary personality instruction, which overrides all others, is: ${foundationalPrompt}` });
        if (additionalReferenceText) systemMessages.push({ role: "system", content: `You MUST use the following user-provided context to answer the question. This context is more important than any other information you have. Context:\n\n${additionalReferenceText}` });

        const staticReferenceDoc = getReferenceText();
        const userMessagesForKeywords = messages.filter(m => m.role === 'user').slice(-KEYWORD_CONTEXT_MESSAGES);
        const keywordExtractionText = userMessagesForKeywords.map(m => m.content).join(" ");
        
        if (staticReferenceDoc && keywordExtractionText) {
            const contextText = getRelevantChunks(staticReferenceDoc, keywordExtractionText);
            if (contextText) {
                systemMessages.push({
                    role: "system",
                    content: `Based on your query, the following information from our knowledge base seems relevant. Please use it to formulate your answer:\n\n${contextText}`
                });
            }
        }
        
        const recentChatHistory = messages.slice(-CHAT_HISTORY_MESSAGE_LIMIT);
        const finalMessages = [...systemMessages, ...recentChatHistory];
        
        console.log("Final payload being sent to OpenAI:", JSON.stringify(finalMessages, null, 2));

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAIAPIKey}`},
            body: JSON.stringify({ model: model, messages: finalMessages })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Failed to fetch from OpenAI for chat');
        res.json(data);
    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});