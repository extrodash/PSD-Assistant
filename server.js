const express = require('express');
const fetch = require('node-fetch');
// const fs = require('fs');
// const path = require('path');
const cors = require('cors');
require('dotenv').config();
const contentful = require('contentful');
const { documentToPlainTextString } = require('@contentful/rich-text-plain-text-renderer');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const openAIAPIKey = process.env.OPENAI_API_KEY;

const contentfulClient = contentful.createClient({
    space: process.env.CONTENTFUL_SPACE_ID,
    accessToken: process.env.CONTENTFUL_ACCESS_TOKEN,
});

const CHAT_HISTORY_MESSAGE_LIMIT = 20;
const KEYWORD_CONTEXT_MESSAGES = 2;

// ... (Your smartChunkReferenceText, getReferenceText, fineChunkReferenceText, and getRelevantChunks functions remain exactly the same) ...
async function getReferenceText() { /* ... same as before ... */ }
function smartChunkReferenceText(referenceText) { /* ... same as before ... */ }
const { encode } = require('gpt-3-encoder'); 
function fineChunkReferenceText(referenceText) { /* ... same as before ... */ }
function getRelevantChunks(referenceText, userPrompt, maxChunks = 10, alwaysReturnIfNone = true, tokenLimit = 3500) { /* ... same as before ... */ }


app.post('/api/chat', async (req, res) => {
    if (!openAIAPIKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured on the server.' });
    }
    try {
        const { model, messages, foundationalPrompt, additionalReferenceText, activeInstruction, referenceChunks } = req.body;
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty messages array provided.' });
        }

        let systemMessages = [];
        // ... (Your existing system message pushes for personality, etc. remain the same) ...
        systemMessages.push({ role: "system", content: "Your name is Verse. You are a grounded LDS service mission assistant. Match the aesthetic; wise, tuff, masculine, someone who's been through a lot. Always blunt, conservative, obvious, practical, innovative, clever humor, virtuous. ALWAYS answer with obsessive detail if context is provided. SPS Stands for Service Project Shop; a department within the PSD (Publishing Services Department) full of service missionaries working on projects. Never ignore anything referenced, even if it seems redundant. Do not generalize—-always refer to specific data, names, numbers, and policies found in the context." });
        systemMessages.push({ role: "system", content: "Guideline: If a user asks about the truthfulness of the LDS Church, respond by emphasizing that simply asking that question brings them closer to God, that doubts show they are being real and God loves that, and He is more offended by a fake testimony than a skeptical yet real one." });
        systemMessages.push({role: "system", content: "When you mention a website or provide a URL from the context, please format it as a Markdown hyperlink. For example: [Link Display Text](https://www.example.com)" });
        if (activeInstruction) systemMessages.push({ role: "system", content: activeInstruction });
        if (foundationalPrompt) systemMessages.push({ role: "system", content: `Your primary personality instruction, which overrides all others, is: ${foundationalPrompt}` });
        if (additionalReferenceText) systemMessages.push({ role: "system", content: `You MUST use the following user-provided context to answer the question. This context is more important than any other information you have. Context:\n\n${additionalReferenceText}` });
        
        const staticReferenceDoc = await getReferenceText();
        const userMessagesForKeywords = messages.filter(m => m.role === 'user').slice(-KEYWORD_CONTEXT_MESSAGES);
        const keywordExtractionText = userMessagesForKeywords.map(m => m.content).join(" ");

        if (staticReferenceDoc && keywordExtractionText) {
            const maxChunks = Math.max(2, Math.min(Number(referenceChunks) || 10, 10));
            const contextText = getRelevantChunks(staticReferenceDoc, keywordExtractionText, maxChunks, true);

            // --- ADD THIS SAFETY NET BLOCK ---
            const MAX_CONTEXT_CHARACTERS = 15000; // A safe character limit (approx. 3750 tokens)
            let safeContextText = contextText;

            if (safeContextText && safeContextText.length > MAX_CONTEXT_CHARACTERS) {
                console.warn(`⚠️ Context text is too long (${safeContextText.length} chars), truncating to ${MAX_CONTEXT_CHARACTERS} chars.`);
                safeContextText = safeContextText.substring(0, MAX_CONTEXT_CHARACTERS);
            }
            // --- END OF SAFETY NET BLOCK ---

            if (safeContextText) {
                systemMessages.push({
                    role: "system",
                    // --- IMPORTANT: Use the 'safeContextText' variable here ---
                    content: `Below are all context blocks that may be relevant. Use EVERY SINGLE detail that helps answer the user's prompt. NEVER leave out data, names, coordinators, numbers, tools, schedules, or anything else if it's in the context.\n\n${safeContextText}`
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