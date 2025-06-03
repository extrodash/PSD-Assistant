document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const chatHistory = document.getElementById('chat-history');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button'); // Make sure this is declared
    const newChatButton = document.getElementById('new-chat-button');
    const chatThreadsMenu = document.getElementById('chat-threads-menu');
    const modelSelect = document.getElementById('model-select'); // This was undefined
    const modeSelect = document.getElementById('mode-select');   // Likely also undefined
    const customPromptContainer = document.getElementById('custom-prompt-container');
    const customPromptInput = document.getElementById('custom-prompt');
    const modeInstructionContainer = document.getElementById('mode-instruction-container');
    const modeInstructionText = document.getElementById('mode-instruction');
    const foundationalPromptInput = document.getElementById('foundational-prompt'); // Likely also undefined
    const additionalReferenceInput = document.getElementById('additional-reference'); // Likely also undefined
    const summarizeChatButton = document.getElementById('summarize-chat-button');
    const chatSummaryDiv = document.getElementById('chat-summary');
    const fullMessageModal = document.getElementById('full-message-modal');
    const fullMessageTextDisplay = document.getElementById('full-message-text-display');
    const closeFullMessageBtn = document.getElementById('close-full-message-btn');
    const copyFullMessageBtn = document.getElementById('copy-full-message-btn');
    const referenceChunksSelect = document.getElementById('reference-chunks-select');
    // themeToggle was removed, so it's correctly not here.

    // --- CONFIGURATION ---
    const LONG_MESSAGE_THRESHOLD = 300;
    const LOADING_BUBBLE_ID = 'loading-bubble-placeholder';

    // ... (State Management and chatModes array remain the same) ...
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
        checkForWidgetMode();
        loadSettingsFromLocalStorage();
        populateModeSelector();
        startNewChat();
        updateUI(); 

        if(sendButton) sendButton.addEventListener('click', sendMessage);
        if(userInput) userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        if(newChatButton) newChatButton.addEventListener('click', startNewChat);
        if(chatThreadsMenu) chatThreadsMenu.addEventListener('change', (e) => switchChat(e.target.value));
        if(summarizeChatButton) summarizeChatButton.addEventListener('click', summarizeCurrentThread);

        if(modeSelect) modeSelect.addEventListener('change', handleModeChange);
        if(modelSelect) modelSelect.addEventListener('change', () => localStorage.setItem('savedModel', modelSelect.value));
        if(foundationalPromptInput) foundationalPromptInput.addEventListener('input', () => localStorage.setItem('savedPrompt', foundationalPromptInput.value));
        if(additionalReferenceInput) additionalReferenceInput.addEventListener('input', () => localStorage.setItem('savedReferenceText', additionalReferenceInput.value));

        if (closeFullMessageBtn) closeFullMessageBtn.addEventListener('click', closeFullScreenMessage);
        if (copyFullMessageBtn) copyFullMessageBtn.addEventListener('click', copyModalText);
        
        if (fullMessageModal) {
            fullMessageModal.addEventListener('click', (event) => {
                if (event.target === fullMessageModal) closeFullScreenMessage();
            });
        }
       document.addEventListener('keydown', (event) => {
    // Ensure fullMessageModal is defined and accessible here
    const modal = document.getElementById('full-message-modal'); 
    if (event.key === 'Escape' && modal && modal.classList.contains('visible')) { // <-- CHECK FOR .visible
        closeFullScreenMessage();
    }
});
    }

    // --- Setup Functions (checkForWidgetMode, loadSettingsFromLocalStorage, populateModeSelector) ---
    // ... (These functions remain the same as your last version)
    function checkForWidgetMode() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'widget') {
            document.body.classList.add('widget-mode');
        }
    }

    function loadSettingsFromLocalStorage() {
        const savedModeIndex = localStorage.getItem('savedModeIndex') || 0;
        const savedModel = localStorage.getItem('savedModel') || 'gpt-3.5-turbo';
        const savedPrompt = localStorage.getItem('savedPrompt') || '';
        const savedReferenceText = localStorage.getItem('savedReferenceText') || '';
        const savedReferenceChunks = localStorage.getItem('referenceChunks') || '10';

        if(modeSelect) modeSelect.value = savedModeIndex;
        if(modelSelect) modelSelect.value = savedModel;
        if(foundationalPromptInput) foundationalPromptInput.value = savedPrompt;
        if(additionalReferenceInput) additionalReferenceInput.value = savedReferenceText;
        if(referenceChunksSelect) referenceChunksSelect.value = savedReferenceChunks;
    }

    function populateModeSelector() {
        if(!modeSelect) return;
        modeSelect.innerHTML = '';
        chatModes.forEach((mode, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${mode.icon} ${mode.name}`;
            modeSelect.appendChild(option);
        });
    }

    // --- Modal Functions (openFullScreenMessage, closeFullScreenMessage, copyModalText) ---
    // ... (These functions remain the same as your last version)
    function openFullScreenMessage(text) {
    if (fullMessageTextDisplay && fullMessageModal) {
        if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            fullMessageTextDisplay.innerHTML = DOMPurify.sanitize(marked.parse(text));
        } else {
            fullMessageTextDisplay.textContent = text;
        }
        fullMessageModal.classList.add('visible'); // <-- USE .add('visible')
        if(closeFullMessageBtn) closeFullMessageBtn.focus();
    }
}

    function closeFullScreenMessage() {
    if (fullMessageModal) {
        fullMessageModal.classList.remove('visible'); // <-- USE .remove('visible')
        if (fullMessageTextDisplay) {
             fullMessageTextDisplay.innerHTML = ''; 
        }
    }
}

    function copyModalText() {
        if (fullMessageTextDisplay && copyFullMessageBtn) {
            const textToCopy = fullMessageTextDisplay.textContent || ""; 
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    const originalText = copyFullMessageBtn.textContent;
                    copyFullMessageBtn.textContent = 'Copied!';
                    copyFullMessageBtn.disabled = true;
                    setTimeout(() => {
                        copyFullMessageBtn.textContent = originalText;
                        copyFullMessageBtn.disabled = false;
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy text: ', err);
                    alert('Failed to copy text. You might need to grant clipboard permissions or copy manually.');
                });
        }
    }

    // --- UI Update and Message Rendering ---
    // ... (updateUI, updateChatHistory, handleModeChange are the same)
    function updateUI() {
        updateChatHistory();
        updateThreadMenu();
        handleModeChange(); 
    }
    
    function updateChatHistory() {
        if(!chatHistory) return;
        chatHistory.innerHTML = '';
        const currentThread = getCurrentThread();
        if (currentThread && currentThread.messages) {
            currentThread.messages.forEach(msg => renderMessage(msg.text, msg.isUser));
        }
        if (chatHistory.scrollHeight > chatHistory.clientHeight) {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }
    
    function handleModeChange() {
        if(!modeSelect || !customPromptContainer || !modeInstructionContainer || !modeInstructionText) return;
        const selectedMode = chatModes[modeSelect.value]; 
        if (selectedMode && selectedMode.name === "Custom") { 
            customPromptContainer.style.display = 'block';
            modeInstructionContainer.style.display = 'none';
        } else if (selectedMode) { 
            customPromptContainer.style.display = 'none';
            modeInstructionContainer.style.display = 'block';
            modeInstructionText.textContent = selectedMode.instruction;
        }
        localStorage.setItem('savedModeIndex', modeSelect.value);
    }
    
    // renderMessage includes expand button logic
    function renderMessage(text, isUser, opts = {}) {
        if (!chatHistory) return;
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', isUser ? 'user' : 'assistant');

        // --- Action Icons ---
        const actions = document.createElement('div');
        actions.className = 'message-actions';

        // Copy icon (for both user and assistant)
        const copyBtn = document.createElement('button');
        copyBtn.className = 'message-action-btn';
        copyBtn.title = 'Copy';
        copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="6" y="6" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="3" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(text);
            copyBtn.innerHTML = "✓";
            setTimeout(() => copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="6" y="6" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="3" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`, 1200);
        };
        actions.appendChild(copyBtn);

        // Edit icon (user messages only)
        if (isUser) {
            const editBtn = document.createElement('button');
            editBtn.className = 'message-action-btn';
            editBtn.title = 'Edit & Regenerate';
            editBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 13.5V16h2.5l7.1-7.1a1 1 0 0 0 0-1.4l-2-2a1 1 0 0 0-1.4 0L4 13.5zm9.7-6.3 2 2a1 1 0 0 1 0 1.4l-1 1-3.4-3.4 1-1a1 1 0 0 1 1.4 0z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
            editBtn.onclick = () => {
                userInput.value = text;
                userInput.focus();
                const currentThread = getCurrentThread();
                if (currentThread) {
                    let idx = currentThread.messages.findIndex(m => m.text === text && m.isUser);
                    if (idx !== -1) {
                        currentThread.messages = currentThread.messages.slice(0, idx);
                        updateChatHistory();
                    }
                }
            };
            actions.appendChild(editBtn);
        }

        // --- Message Content ---
        let messageContentEl = document.createElement('div');
        messageContentEl.classList.add('message-content-text');

        // Detect error message (simple heuristic)
        const isError = typeof text === 'string' && text.startsWith('Error:');

        if (isUser) {
            messageContentEl.textContent = text;
        } else {
            if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
                messageContentEl.innerHTML = DOMPurify.sanitize(marked.parse(text));
            } else {
                messageContentEl.textContent = text;
            }
        }

        // Arrange: [actions][bubble] for user, [bubble][actions] for assistant
        if (isUser) {
            messageEl.appendChild(actions);
            messageEl.appendChild(messageContentEl);
        } else {
            messageEl.appendChild(messageContentEl);
            messageEl.appendChild(actions);
        }

        // Expand button for long assistant messages
        if (!isUser && text.length > LONG_MESSAGE_THRESHOLD) {
            const expandButton = document.createElement('button');
            expandButton.innerHTML = '&#x2922;';
            expandButton.classList.add('expand-message-btn');
            expandButton.title = 'Expand message';
            expandButton.setAttribute('aria-label', 'Expand message');
            expandButton.addEventListener('click', (e) => {
                e.stopPropagation();
                openFullScreenMessage(text);
            });
            messageEl.appendChild(expandButton);
        }

        // Try Again button for error messages
        if (!isUser && isError) {
            const tryAgainBtn = document.createElement('button');
            tryAgainBtn.className = 'try-again-btn';
            tryAgainBtn.textContent = 'Try Again';
            tryAgainBtn.onclick = () => {
                const currentThread = getCurrentThread();
                if (currentThread) {
                    currentThread.messages = currentThread.messages.filter((m, i, arr) =>
                        !(i === arr.length - 1 && !m.isUser && m.text.startsWith('Error:'))
                    );
                    updateChatHistory();
                    const lastUserMsg = currentThread.messages.slice().reverse().find(m => m.isUser);
                    if (lastUserMsg) {
                        userInput.value = lastUserMsg.text;
                        sendMessage();
                    }
                }
            };
            messageEl.appendChild(tryAgainBtn);
        }

        chatHistory.appendChild(messageEl);
        if (chatHistory.scrollHeight > chatHistory.clientHeight) {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }    

    function updateThreadMenu() {
        if(!chatThreadsMenu) return;
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
    

    // --- NEW HELPER FUNCTIONS FOR LOADING BUBBLE ---
    function showLoadingBubble() {
        if (!chatHistory) return;
        removeLoadingBubble(); // Remove any existing one first

        const loadingBubble = document.createElement('div');
        loadingBubble.classList.add('message', 'assistant', 'loading-bubble');
        loadingBubble.id = LOADING_BUBBLE_ID;

        const dotContainer = document.createElement('div');
        dotContainer.classList.add('loading-dot-container');
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.classList.add('loading-dot');
            dotContainer.appendChild(dot);
        }
        loadingBubble.appendChild(dotContainer);
        chatHistory.appendChild(loadingBubble);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function removeLoadingBubble() {
        const loadingBubble = document.getElementById(LOADING_BUBBLE_ID);
        if (loadingBubble) {
            loadingBubble.remove();
        }
    }
    // --- END OF LOADING BUBBLE HELPERS ---

    // --- Core Chat Logic (getCurrentThread, startNewChat, switchChat, addMessageToState) ---
    // ... (These functions remain the same as your last version)
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
        if(userInput) userInput.focus();
    }

    function switchChat(threadId) {
        currentThreadId = threadId;
        updateUI();
    }

    function addMessageToState(text, isUser) {
        const currentThread = getCurrentThread();
        if (currentThread) {
            currentThread.messages.push({ text, isUser });
        }
    }
    
    // --- sendMessage MODIFIED ---
    async function sendMessage() {
    if (!userInput || !foundationalPromptInput || !additionalReferenceInput || !modelSelect || !modeSelect || !customPromptInput) {
        console.error("One or more critical UI elements not found in sendMessage.");
        return;
    }

    const text = userInput.value.trim();
    if (!text || isLoading) return;

    addMessageToState(text, true);
    renderMessage(text, true); 
    userInput.value = '';
    
    isLoading = true;

    // --- DELAYED LOADING BUBBLE ---
    let loadingBubbleTimeout = setTimeout(() => {
        showLoadingBubble();
    }, 500);

    const currentThread = getCurrentThread();
    const selectedMode = chatModes[modeSelect.value];
    const activeInstruction = selectedMode.name === "Custom"
        ? customPromptInput.value.trim()
        : selectedMode.instruction;

    const payload = {
        model: modelSelect.value,
        messages: currentThread ? currentThread.messages.map(msg => ({
            role: msg.isUser ? 'user' : 'assistant',
            content: msg.text
        })) : [],
        foundationalPrompt: foundationalPromptInput.value.trim(),
        additionalReferenceText: additionalReferenceInput.value.trim(),
        activeInstruction: activeInstruction,
        referenceChunks: referenceChunksSelect ? parseInt(referenceChunksSelect.value, 10) : 10
    };
    
    console.log("Sending this payload to the server:", payload);

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
        renderMessage(aiResponse, false); // Render actual response

        if (currentThread && currentThread.messages.length === 2) { 
            currentThread.title = text.substring(0, 20) + (text.length > 20 ? '...' : '');
            updateThreadMenu();
        }

    } catch (error) {
        const errorMessage = `Error: ${error.message}`;
        addMessageToState(errorMessage, false);
        renderMessage(errorMessage, false); // Render error message
    } finally {
        clearTimeout(loadingBubbleTimeout); // Prevent bubble if response is fast
        removeLoadingBubble(); // Remove if it was shown
        isLoading = false; 
    }
}
    
    // summarizeCurrentThread remains the same
    async function summarizeCurrentThread() {
        if(!chatSummaryDiv) return;
        const currentThread = getCurrentThread();
        if (!currentThread || currentThread.messages.length === 0) {
            alert("Nothing to summarize!");
            return;
        }
        chatSummaryDiv.textContent = "Summarizing...";
        const payload = {
            messages: currentThread.messages.map(msg => ({
                role: msg.isUser ? 'user' : 'assistant',
                content: msg.text
            }))
        };
        try {
            const response = await fetch('/api/summarize', {
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

    // Start the application
    initialize();
});