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
    const fullMessageModal = document.getElementById('full-message-modal');
    const fullMessageTextDisplay = document.getElementById('full-message-text-display');
    const closeFullMessageBtn = document.getElementById('close-full-message-btn');
    const copyFullMessageBtn = document.getElementById('copy-full-message-btn');

    // --- CONFIGURATION ---
    const LONG_MESSAGE_THRESHOLD = 300; // Characters

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
        checkForWidgetMode();
        loadSettingsFromLocalStorage();
        populateModeSelector();
        startNewChat();
        updateUI(); // This will call handleModeChange initially

        // Event Listeners
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

        // Add listeners to save settings to localStorage on input
        if(modeSelect) modeSelect.addEventListener('change', handleModeChange);
        if(modelSelect) modelSelect.addEventListener('change', () => localStorage.setItem('savedModel', modelSelect.value));
        if(foundationalPromptInput) foundationalPromptInput.addEventListener('input', () => localStorage.setItem('savedPrompt', foundationalPromptInput.value));
        if(additionalReferenceInput) additionalReferenceInput.addEventListener('input', () => localStorage.setItem('savedReferenceText', additionalReferenceInput.value));

        // Event listeners for the modal
        if (closeFullMessageBtn) {
            closeFullMessageBtn.addEventListener('click', closeFullScreenMessage);
        }
        if (copyFullMessageBtn) {
            copyFullMessageBtn.addEventListener('click', copyModalText);
        }
        if (fullMessageModal) {
            fullMessageModal.addEventListener('click', (event) => {
                if (event.target === fullMessageModal) {
                    closeFullScreenMessage();
                }
            });
            // Close modal with Escape key - This event listener should be on the document
        }
        // Moved Escape key listener to document level for global capture when modal is open
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && fullMessageModal && !fullMessageModal.classList.contains('hidden')) {
                closeFullScreenMessage();
            }
        });
    }

    // --- Setup Functions ---
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

        if(modeSelect) modeSelect.value = savedModeIndex;
        if(modelSelect) modelSelect.value = savedModel;
        if(foundationalPromptInput) foundationalPromptInput.value = savedPrompt;
        if(additionalReferenceInput) additionalReferenceInput.value = savedReferenceText;
    }

    function populateModeSelector() {
        if(!modeSelect) return;
        // Clear previous options before populating, if any
        modeSelect.innerHTML = '';
        chatModes.forEach((mode, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${mode.icon} ${mode.name}`;
            modeSelect.appendChild(option);
        });
    }

    // --- Modal Functions ---
    function openFullScreenMessage(text) {
        if (fullMessageTextDisplay && fullMessageModal) {
            if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
                fullMessageTextDisplay.innerHTML = DOMPurify.sanitize(marked.parse(text));
            } else {
                fullMessageTextDisplay.textContent = text;
            }
            fullMessageModal.classList.remove('hidden');
            if(closeFullMessageBtn) closeFullMessageBtn.focus();
        }
    }

    function closeFullScreenMessage() {
        if (fullMessageModal) {
            fullMessageModal.classList.add('hidden');
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
        if (chatHistory.scrollHeight > chatHistory.clientHeight) { // Check if scrollable
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }

    function renderMessage(text, isUser) {
        if (!chatHistory) return;
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', isUser ? 'user' : 'assistant');
    
        let messageContentEl = document.createElement('div');
        messageContentEl.classList.add('message-content-text');
    
        if (isUser) {
            messageContentEl.textContent = text;
        } else {
            if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
                messageContentEl.innerHTML = DOMPurify.sanitize(marked.parse(text));
            } else {
                messageContentEl.textContent = text;
            }
        }
        messageEl.appendChild(messageContentEl);
    
        // --- EXPAND BUTTON LOGIC MOVED HERE ---
        if (!isUser && text.length > LONG_MESSAGE_THRESHOLD) {
            const expandButton = document.createElement('button');
            expandButton.innerHTML = '&#x2922;'; // Expand symbol
            expandButton.classList.add('expand-message-btn');
            expandButton.title = 'Expand message';
            expandButton.setAttribute('aria-label', 'Expand message');
            expandButton.addEventListener('click', (e) => {
                e.stopPropagation();
                openFullScreenMessage(text);
            });
            messageEl.appendChild(expandButton);
        }
        // --- END OF EXPAND BUTTON LOGIC ---
    
        chatHistory.appendChild(messageEl);
        if (chatHistory.scrollHeight > chatHistory.clientHeight) { // Check if scrollable
             chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }    

    function updateThreadMenu() {
        if(!chatThreadsMenu) return;
        chatThreadsMenu.innerHTML = ''; // Clear previous options
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
    
    function handleModeChange() {
        if(!modeSelect || !customPromptContainer || !modeInstructionContainer || !modeInstructionText) return;
        const selectedMode = chatModes[modeSelect.value]; // Use selected value
        if (selectedMode && selectedMode.name === "Custom") { // Check if selectedMode is valid
            customPromptContainer.style.display = 'block';
            modeInstructionContainer.style.display = 'none';
        } else if (selectedMode) { // Check if selectedMode is valid
            customPromptContainer.style.display = 'none';
            modeInstructionContainer.style.display = 'block';
            modeInstructionText.textContent = selectedMode.instruction;
        }
        localStorage.setItem('savedModeIndex', modeSelect.value);
    }

    // --- Core Chat Logic ---
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
        // Ensure settings are loaded for the new chat context if they aren't global
        // For now, global settings apply, so just update UI
        updateUI();
        if(userInput) userInput.focus(); // Focus input on new chat
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
        isLoading = true; // Add loading indicator logic if you have one

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
            activeInstruction: activeInstruction
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
            renderMessage(aiResponse, false);

            if (currentThread && currentThread.messages.length === 2) { 
                currentThread.title = text.substring(0, 20) + (text.length > 20 ? '...' : '');
                updateThreadMenu();
            }

        } catch (error) {
            const errorMessage = `Error: ${error.message}`;
            addMessageToState(errorMessage, false);
            renderMessage(errorMessage, false);
        } finally {
            isLoading = false; // Remove loading indicator
        }
    }
    
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