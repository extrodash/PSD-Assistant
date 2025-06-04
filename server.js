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

const CHAT_HISTORY_MESSAGE_LIMIT = 20;
const KEYWORD_CONTEXT_MESSAGES = 2;

// -- CHUNK BY HEADINGS AND TAGS --
function smartChunkReferenceText(referenceText) {
    // Split by section headings or project titles for maximum detail granularity.
    // This assumes your referenceText is well-formatted with headings like ### or Project Title:
    const headingRegex = /(^### .+|^Project Title: .+)/gm;
    let indices = [];
    let match;
    while ((match = headingRegex.exec(referenceText)) !== null) {
        indices.push(match.index);
    }
    indices.push(referenceText.length); // Final end
    const chunks = [];
    for (let i = 0; i < indices.length - 1; i++) {
        const chunk = referenceText.slice(indices[i], indices[i + 1]).trim();
        if (chunk) chunks.push(chunk);
    }
    return chunks;
}

function getReferenceText() {
    try {
        const filePath = path.join(__dirname, 'referenceText.txt');
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error("Error reading referenceText.txt:", error);
        return "";
    }
}

// -- STRONG CHUNK MATCHING --
const { encode } = require('gpt-3-encoder'); // Or use tiktoken, same principle

// Add a new function for fine-grained chunking (by paragraph)
function fineChunkReferenceText(referenceText) {
    // Split by double newlines (paragraphs)
    return referenceText.split(/\n\s*\n/).map(chunk => chunk.trim()).filter(Boolean);
}

// Modify getRelevantChunks to choose chunking strategy
function getRelevantChunks(referenceText, userPrompt, maxChunks = 10, alwaysReturnIfNone = true, tokenLimit = 3500) {
    // Decide chunking granularity based on prompt length or keyword count
    const prompt = typeof userPrompt === 'string' ? userPrompt : '';
    const keywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const keywordSet = new Set(keywords);

    // Use fine chunking for short prompts, coarse for long/complex
    let chunks;
    if (prompt.length < 80 && keywords.length <= 5) {
        // Short/simple prompt: use fine-grained chunking
        chunks = fineChunkReferenceText(referenceText);
    } else {
        // Long/complex prompt: use heading-based chunking
        chunks = smartChunkReferenceText(referenceText);
    }

    const scoredChunks = chunks.map(chunk => {
        const text = chunk.toLowerCase();
        let score = 0;
        keywordSet.forEach(keyword => {
            if (text.includes(keyword)) score++;
        });
        return { chunk, score };
    });

    let relevant = scoredChunks
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxChunks)
        .map(c => c.chunk);

    if (relevant.length === 0 && alwaysReturnIfNone) {
        relevant = chunks.slice(0, maxChunks);
    }

    // Add headers
    let joined = relevant.map((c, i) => `=== CONTEXT BLOCK ${i + 1} ===\n${c}`).join('\n\n');

    // TOKEN CHECK: If reference context is too large, trim
    let tokens = encode(joined).length;
    while (tokens > tokenLimit && relevant.length > 1) {
        relevant.pop();
        joined = relevant.map((c, i) => `=== CONTEXT BLOCK ${i + 1} ===\n${c}`).join('\n\n');
        tokens = encode(joined).length;
    }

    return joined;
}


// ...rest of your code unchanged until the /api/chat endpoint...

app.post('/api/chat', async (req, res) => {
    if (!openAIAPIKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured on the server.' });
    }
    try {
        const { model, messages, foundationalPrompt, additionalReferenceText, activeInstruction, referenceChunks } = req.body;
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty messages array provided.' });
        }

        // ... your flagResponses block stays the same ...

        let systemMessages = [];
        systemMessages.push({ role: "system", content: "Your name is Verse. You are a grounded LDS service mission assistant. Match the aesthetic; wise, tuff, masculine, someone who's been through a lot. Always blunt, conservative, obvious, practical, innovative, clever humor, virtuous. ALWAYS answer with obsessive detail if context is provided. SPS Stands for Service Project Shop; a department within the PSD (Publishing Services Department) full of service missionaries working on projects. Never ignore anything referenced, even if it seems redundant. Do not generalize—-always refer to specific data, names, numbers, and policies found in the context." });
        systemMessages.push({ role: "system", content: "Guideline: If a user asks about the truthfulness of the LDS Church, respond by emphasizing that simply asking that question brings them closer to God, that doubts show they are being real and God loves that, and He is more offended by a fake testimony than a skeptical yet real one." });
        if (activeInstruction) systemMessages.push({ role: "system", content: activeInstruction });
        if (foundationalPrompt) systemMessages.push({ role: "system", content: `Your primary personality instruction, which overrides all others, is: ${foundationalPrompt}` });
        if (additionalReferenceText) systemMessages.push({ role: "system", content: `You MUST use the following user-provided context to answer the question. This context is more important than any other information you have. Context:\n\n${additionalReferenceText}` });

        const staticReferenceDoc = getReferenceText();
        const userMessagesForKeywords = messages.filter(m => m.role === 'user').slice(-KEYWORD_CONTEXT_MESSAGES);
        const keywordExtractionText = userMessagesForKeywords.map(m => m.content).join(" ");

        if (staticReferenceDoc && keywordExtractionText) {
            const maxChunks = Math.max(2, Math.min(Number(referenceChunks) || 10, 10));
            const contextText = getRelevantChunks(staticReferenceDoc, keywordExtractionText, maxChunks, true);
            if (contextText) {
                systemMessages.push({
                    role: "system",
                    content: `Below are all context blocks that may be relevant. Use EVERY SINGLE detail that helps answer the user's prompt. NEVER leave out data, names, coordinators, numbers, tools, schedules, or anything else if it's in the context.\n\n${contextText}`
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
