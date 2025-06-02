document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const chatHistory = document.getElementById('chat-history');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const newChatButton = document.getElementById('new-chat-button');
    const chatThreadsMenu = document.getElementById('chat-threads-menu');
    const modelSelect = document.getElementById('model-select');
    const modeSelect = document.getElementById('mode-select');
    const customPromptContainer = document.getElementById('custom-prompt-container');
    const customPromptInput = document.getElementById('custom-prompt');
    const modeInstructionContainer = document.getElementById('mode-instruction-container');
    const modeInstructionText = document.getElementById('mode-instruction');
    const foundationalPromptInput = document.getElementById('foundational-prompt');
    const additionalReferenceInput = document.getElementById('additional-reference');
    const summarizeChatButton = document.getElementById('summarize-chat-button');
    const chatSummaryDiv = document.getElementById('chat-summary');
    const themeToggle = document.getElementById('theme-toggle');

    // --- State Management ---
    let chatThreads = [];
    let currentThreadId = null;
    let isLoading = false;

    const chatModes = [
        { name: "Default", icon: "🔵", instruction: "You are a blunt, practical, LDS Church Office Building employee assistant. Give direct, practical, and useful answers." },
        { name: "Summarize", icon: "🟢", instruction: "Regurgitate and summarize the user's input in less than 5 sentences, plain English. No filler. Format for 'TL;DR'" },
        { name: "Fix Grammar", icon: "⚪️", instruction: "Fix the user's input for grammar, spelling, and clarity. Don't change the meaning." },
        { name: "S.O.P.", icon: "🔴", instruction: "Take the instructions given, and organize it into a direct Standard Operating Procedure." },
        { name: "Reflection", icon: "⚫️", instruction: "Respond with an intense, bold question that highly reflects the Biblical tone. Make it brief, not cringe." },
        { name: "Explain Simply", icon: "🟤", instruction: "Explain the user's input as if to a 10-year-old. Use simple words, but don't be condescending." },
        { name: "Gospel Mode", icon: "🟣", instruction: "Offer LDS insight, deep dive into scripture, real-life reference, and reflection questions." },
        { name: "Skill/Tool Matcher", icon: "🟡", instruction: "When prompted with an inquiry about projects matched with the users input, reference projects listed under the relevant category. Show 6 total available projects, top 2 being highest priotity,  middle 2 being medium priority, lower being smaller priority but still relevant. if there are no additional projects to fill for 6, simply say there are no other relevant projects." },
        { name: "Custom", icon: "🛠️", instruction: "" }
    ];

    // --- Initialization ---
    function initialize() {
        setupTheme();
        populateModeSelector();
        startNewChat();
        updateUI();

        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        newChatButton.addEventListener('click', startNewChat);
        chatThreadsMenu.addEventListener('change', (e) => switchChat(e.target.value));
        modeSelect.addEventListener('change', handleModeChange);
        summarizeChatButton.addEventListener('click', summarizeCurrentThread);
        themeToggle.addEventListener('change', handleThemeChange);
    }

    // --- Theme Handling ---
    function setupTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        themeToggle.checked = savedTheme === 'dark';
    }

    function handleThemeChange() {
        const newTheme = themeToggle.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // --- UI Update Functions ---
    function updateUI() {
        updateChatHistory();
        updateThreadMenu();
        handleModeChange();
    }
    
    // --- THIS FUNCTION IS NOW DEPRECATED, addMessage handles rendering ---
    function updateChatHistory() {
        chatHistory.innerHTML = '';
        const currentThread = getCurrentThread();
        if (currentThread && currentThread.messages) {
            currentThread.messages.forEach(msg => renderMessage(msg.text, msg.isUser));
        }
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function renderMessage(text, isUser) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', isUser ? 'user' : 'assistant');

        if (isUser) {
            messageEl.textContent = text;
        } else {
            // Use Marked and DOMPurify to safely render Markdown
            messageEl.innerHTML = DOMPurify.sanitize(marked.parse(text));
        }
        
        chatHistory.appendChild(messageEl);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }


    function updateThreadMenu() {
        chatThreadsMenu.innerHTML = '';
        chatThreads.forEach(thread => {
            const option = document.createElement('option');
            option.value = thread.id;
            option.textContent = thread.title;
            if (thread.id === currentThreadId) {
                option.selected = true;
            }
            chatThreadsMenu.appendChild(option);
        });
    }

    function populateModeSelector() {
        chatModes.forEach((mode, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${mode.icon} ${mode.name}`;
            modeSelect.appendChild(option);
        });
    }

    function handleModeChange() {
        const selectedMode = chatModes[modeSelect.value];
        if (selectedMode.name === "Custom") {
            customPromptContainer.style.display = 'block';
            modeInstructionContainer.style.display = 'none';
        } else {
            customPromptContainer.style.display = 'none';
            modeInstructionContainer.style.display = 'block';
            modeInstructionText.textContent = selectedMode.instruction;
        }
    }

    // --- Chat Logic ---
    function getCurrentThread() {
        return chatThreads.find(t => t.id === currentThreadId);
    }
    
    function startNewChat() {
        const newThread = {
            id: Date.now().toString(),
            title: "New Chat",
            messages: []
        };
        chatThreads.unshift(newThread);
        currentThreadId = newThread.id;
        updateUI();
    }

    function switchChat(threadId) {
        currentThreadId = threadId;
        updateUI();
    }

    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text || isLoading) return;

        addMessageToState(text, true);
        renderMessage(text, true); // Render immediately
        userInput.value = '';
        isLoading = true;

        const currentThread = getCurrentThread();
        const selectedMode = chatModes[modeSelect.value];
        const activeInstruction = selectedMode.name === "Custom"
            ? customPromptInput.value.trim()
            : selectedMode.instruction;

        const payload = {
            model: modelSelect.value,
            messages: currentThread.messages.map(msg => ({
                role: msg.isUser ? 'user' : 'assistant',
                content: msg.text
            })),
            foundationalPrompt: foundationalPromptInput.value.trim(),
            additionalReferenceText: additionalReferenceInput.value.trim(),
            activeInstruction: activeInstruction
        };

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'API request failed');
            }

            const data = await response.json();
            const aiResponse = data.choices[0].message.content;
            addMessageToState(aiResponse, false);
            renderMessage(aiResponse, false);

            if (currentThread.messages.length === 2) {
                currentThread.title = text.substring(0, 20) + '...';
                updateThreadMenu();
            }

        } catch (error) {
            const errorMessage = `Error: ${error.message}`;
            addMessageToState(errorMessage, false);
            renderMessage(errorMessage, false);
        } finally {
            isLoading = false;
        }
    }
    
    function addMessageToState(text, isUser) {
        const currentThread = getCurrentThread();
        if (currentThread) {
            currentThread.messages.push({ text, isUser });
        }
    }

    // Summarization function remains the same
    async function summarizeCurrentThread() {
        const currentThread = getCurrentThread();
        if (!currentThread || currentThread.messages.length === 0) {
            alert("Nothing to summarize!");
            return;
        }

        chatSummaryDiv.textContent = "Summarizing...";
        const payload = {
            model: "gpt-3.5-turbo",
            messages: currentThread.messages.map(msg => ({
                role: msg.isUser ? 'user' : 'assistant',
                content: msg.text
            })),
            activeInstruction: "Summarize this entire conversation in 1-2 sentences. Be concise, practical, and clear."
        };

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Failed to get summary.');

            const data = await response.json();
            const summary = data.choices[0].message.content;
            chatSummaryDiv.textContent = summary;
        } catch (error) {
            chatSummaryDiv.textContent = `Error: ${error.message}`;
        }
    }

    initialize();
});