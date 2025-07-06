// Collaborative Notes Manager
class NotesManager {
    constructor() {
        this.currentDealId = null;
        this.isCollaborating = false;
        this.collaborators = new Map();
        this.lastSyncTime = 0;
        this.syncInterval = null;
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadLocalNotes();
        console.log('Notes Manager initialized');
    }

    setupEventListeners() {
        // Notes textarea events
        const notesTextarea = document.getElementById('deal-notes');
        if (notesTextarea) {
            notesTextarea.addEventListener('input', (e) => {
                this.handleNotesChange(e);
            });
            
            notesTextarea.addEventListener('focus', () => {
                this.startCollaborationSession();
            });
            
            notesTextarea.addEventListener('blur', () => {
                this.endCollaborationSession();
            });
            
            // Keyboard shortcuts
            notesTextarea.addEventListener('keydown', (e) => {
                this.handleKeyboardShortcuts(e);
            });
        }

        // Listen for deal modal events
        document.addEventListener('dealModalOpen', (e) => {
            this.onDealModalOpen(e.detail);
        });

        document.addEventListener('dealModalClose', () => {
            this.onDealModalClose();
        });

        // Listen for Yjs collaboration events
        document.addEventListener('yjs:connected', () => {
            this.onYjsConnected();
        });

        document.addEventListener('yjs:disconnected', () => {
            this.onYjsDisconnected();
        });

        document.addEventListener('yjs:update', (e) => {
            this.onYjsUpdate(e.detail);
        });
    }

    handleNotesChange(e) {
        const textarea = e.target;
        const content = textarea.value;
        const dealId = this.currentDealId;
        
        if (!dealId) return;
        
        // Save to undo stack
        this.saveToUndoStack(dealId, content);
        
        // Update local storage
        this.saveLocalNotes(dealId, content);
        
        // Sync with collaborators if enabled
        if (this.isCollaborating) {
            this.syncWithCollaborators(dealId, content);
        }
        
        // Update collaboration indicators
        this.updateCollaborationIndicators();
        
        // Emit change event
        this.emit('notesChanged', {
            dealId,
            content,
            timestamp: Date.now()
        });
    }

    handleKeyboardShortcuts(e) {
        const textarea = e.target;
        
        // Ctrl+Z - Undo
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
            return;
        }
        
        // Ctrl+Shift+Z or Ctrl+Y - Redo
        if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
            e.preventDefault();
            this.redo();
            return;
        }
        
        // Ctrl+S - Save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveNotes();
            return;
        }
        
        // Ctrl+A - Select all
        if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            textarea.select();
            return;
        }
        
        // Tab - Insert tab character
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;
            
            textarea.value = value.substring(0, start) + '\t' + value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 1;
            
            // Trigger change event
            this.handleNotesChange({ target: textarea });
            return;
        }
    }

    onDealModalOpen(dealId) {
        this.currentDealId = dealId;
        this.loadNotesForDeal(dealId);
        this.setupCollaborationForDeal(dealId);
    }

    onDealModalClose() {
        this.endCollaborationSession();
        this.currentDealId = null;
        this.clearCollaborationIndicators();
    }

    loadNotesForDeal(dealId) {
        const notes = this.getLocalNotes(dealId);
        const textarea = document.getElementById('deal-notes');
        
        if (textarea) {
            textarea.value = notes || '';
        }
    }

    saveLocalNotes(dealId, content) {
        const notes = this.getLocalNotesData();
        notes[dealId] = {
            content,
            lastModified: Date.now(),
            version: (notes[dealId]?.version || 0) + 1
        };
        
        localStorage.setItem('crm-notes', JSON.stringify(notes));
    }

    getLocalNotes(dealId) {
        const notes = this.getLocalNotesData();
        return notes[dealId]?.content || '';
    }

    getLocalNotesData() {
        const stored = localStorage.getItem('crm-notes');
        return stored ? JSON.parse(stored) : {};
    }

    loadLocalNotes() {
        // Load any existing notes from localStorage
        const notes = this.getLocalNotesData();
        console.log(`Loaded ${Object.keys(notes).length} local notes`);
    }

    saveToUndoStack(dealId, content) {
        const state = {
            dealId,
            content,
            timestamp: Date.now()
        };
        
        this.undoStack.push(state);
        
        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
        
        // Clear redo stack when new content is added
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length === 0) return;
        
        const currentState = {
            dealId: this.currentDealId,
            content: document.getElementById('deal-notes').value,
            timestamp: Date.now()
        };
        
        const previousState = this.undoStack.pop();
        this.redoStack.push(currentState);
        
        // Apply previous state
        if (previousState.dealId === this.currentDealId) {
            document.getElementById('deal-notes').value = previousState.content;
            this.saveLocalNotes(this.currentDealId, previousState.content);
        }
    }

    redo() {
        if (this.redoStack.length === 0) return;
        
        const currentState = {
            dealId: this.currentDealId,
            content: document.getElementById('deal-notes').value,
            timestamp: Date.now()
        };
        
        const nextState = this.redoStack.pop();
        this.undoStack.push(currentState);
        
        // Apply next state
        if (nextState.dealId === this.currentDealId) {
            document.getElementById('deal-notes').value = nextState.content;
            this.saveLocalNotes(this.currentDealId, nextState.content);
        }
    }

    saveNotes() {
        if (!this.currentDealId) return;
        
        const content = document.getElementById('deal-notes').value;
        this.saveLocalNotes(this.currentDealId, content);
        
        // Show save notification
        this.showNotification('Notes sauvegardées', 'success');
    }

    // Collaboration features (placeholder for Yjs integration)
    setupCollaborationForDeal(dealId) {
        // This would integrate with Yjs for real-time collaboration
        console.log(`Setting up collaboration for deal ${dealId}`);
        
        // Simulate collaboration setup
        if (window.RealtimeManager) {
            window.RealtimeManager.joinRoom(`deal-${dealId}`);
        }
    }

    startCollaborationSession() {
        this.isCollaborating = true;
        this.showCollaborationIndicator();
        
        // Start sync interval
        this.syncInterval = setInterval(() => {
            this.syncWithCollaborators();
        }, 2000);
    }

    endCollaborationSession() {
        this.isCollaborating = false;
        this.hideCollaborationIndicator();
        
        // Clear sync interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    syncWithCollaborators(dealId, content) {
        // Placeholder for Yjs synchronization
        if (window.RealtimeManager) {
            window.RealtimeManager.syncNotes(dealId || this.currentDealId, content);
        }
        
        this.lastSyncTime = Date.now();
    }

    onYjsConnected() {
        console.log('Yjs connected - notes collaboration enabled');
        this.updateCollaborationStatus(true);
    }

    onYjsDisconnected() {
        console.log('Yjs disconnected - notes collaboration disabled');
        this.updateCollaborationStatus(false);
    }

    onYjsUpdate(data) {
        const { dealId, content, author } = data;
        
        if (dealId === this.currentDealId && author !== this.getUserId()) {
            // Update notes from remote change
            const textarea = document.getElementById('deal-notes');
            if (textarea) {
                const cursorPosition = textarea.selectionStart;
                textarea.value = content;
                textarea.selectionStart = textarea.selectionEnd = cursorPosition;
            }
            
            // Update local storage
            this.saveLocalNotes(dealId, content);
            
            // Show collaboration indicator
            this.showRemoteUpdate(author);
        }
    }

    showCollaborationIndicator() {
        const indicator = document.querySelector('.collaboration-indicator');
        if (indicator) {
            indicator.classList.remove('hidden');
            indicator.classList.add('editing');
        }
    }

    hideCollaborationIndicator() {
        const indicator = document.querySelector('.collaboration-indicator');
        if (indicator) {
            indicator.classList.add('hidden');
            indicator.classList.remove('editing');
        }
    }

    updateCollaborationIndicators() {
        const collaboratorCount = this.collaborators.size;
        const indicator = document.querySelector('.collaboration-indicator');
        
        if (indicator) {
            if (collaboratorCount > 1) {
                indicator.classList.add('multiple');
                indicator.title = `${collaboratorCount} collaborateurs actifs`;
            } else {
                indicator.classList.remove('multiple');
                indicator.title = 'Collaboration active';
            }
        }
    }

    clearCollaborationIndicators() {
        const indicator = document.querySelector('.collaboration-indicator');
        if (indicator) {
            indicator.classList.add('hidden');
            indicator.classList.remove('editing', 'multiple');
        }
    }

    updateCollaborationStatus(connected) {
        const statusElement = document.getElementById('debug-yjs');
        if (statusElement) {
            statusElement.textContent = connected ? 'true' : 'false';
        }
    }

    showRemoteUpdate(author) {
        // Show a brief indicator that someone else made changes
        const notification = document.createElement('div');
        notification.className = 'collaboration-notification';
        notification.textContent = `${author} a modifié les notes`;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    getUserId() {
        // Generate or retrieve user ID for collaboration
        let userId = localStorage.getItem('crm-user-id');
        if (!userId) {
            userId = 'user-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('crm-user-id', userId);
        }
        return userId;
    }

    // Formatting helpers
    formatText(type) {
        const textarea = document.getElementById('deal-notes');
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        
        let formattedText = selectedText;
        
        switch (type) {
            case 'bold':
                formattedText = `**${selectedText}**`;
                break;
            case 'italic':
                formattedText = `*${selectedText}*`;
                break;
            case 'strikethrough':
                formattedText = `~~${selectedText}~~`;
                break;
            case 'code':
                formattedText = `\`${selectedText}\``;
                break;
            case 'list':
                formattedText = selectedText.split('\n').map(line => `- ${line}`).join('\n');
                break;
            case 'numbered':
                formattedText = selectedText.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');
                break;
        }
        
        textarea.setRangeText(formattedText, start, end, 'end');
        this.handleNotesChange({ target: textarea });
    }

    insertTemplate(templateType) {
        const textarea = document.getElementById('deal-notes');
        if (!textarea) return;
        
        const templates = {
            meeting: `## Réunion - ${new Date().toLocaleDateString('fr-FR')}

**Participants:** 
**Objectif:** 
**Points abordés:**
- 

**Actions à suivre:**
- [ ] 

**Prochaines étapes:**
`,
            call: `## Appel - ${new Date().toLocaleDateString('fr-FR')}

**Contact:** 
**Durée:** 
**Résumé:**

**Points clés:**
- 

**À retenir:**
- 

**Suite à donner:**
- [ ] 
`,
            proposal: `## Proposition - ${new Date().toLocaleDateString('fr-FR')}

**Besoins identifiés:**
- 

**Solution proposée:**
- 

**Budget:** 
**Délais:** 
**Conditions:** 

**Prochaines étapes:**
- [ ] 
`
        };
        
        const template = templates[templateType];
        if (template) {
            const start = textarea.selectionStart;
            textarea.setRangeText(template, start, start, 'end');
            this.handleNotesChange({ target: textarea });
        }
    }

    exportNotes(dealId) {
        const notes = this.getLocalNotes(dealId);
        const deal = window.crmApp ? window.crmApp.getDeal(dealId) : null;
        
        if (!notes || !deal) return;
        
        const exportData = {
            dealTitle: deal.title,
            dealId,
            notes,
            exportDate: new Date().toISOString(),
            company: deal.company,
            contact: deal.contact
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notes-${deal.title.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Event system
    emit(eventName, data) {
        const event = new CustomEvent(`notes:${eventName}`, {
            detail: data
        });
        document.dispatchEvent(event);
    }

    on(eventName, callback) {
        document.addEventListener(`notes:${eventName}`, callback);
    }

    off(eventName, callback) {
        document.removeEventListener(`notes:${eventName}`, callback);
    }

    showNotification(message, type = 'info') {
        if (window.crmApp) {
            window.crmApp.showNotification(message, type);
        }
    }

    // Public API
    getNotesForDeal(dealId) {
        return this.getLocalNotes(dealId);
    }

    setNotesForDeal(dealId, content) {
        this.saveLocalNotes(dealId, content);
        
        if (dealId === this.currentDealId) {
            const textarea = document.getElementById('deal-notes');
            if (textarea) {
                textarea.value = content;
            }
        }
    }

    getAllNotes() {
        return this.getLocalNotesData();
    }

    clearNotesForDeal(dealId) {
        const notes = this.getLocalNotesData();
        delete notes[dealId];
        localStorage.setItem('crm-notes', JSON.stringify(notes));
    }

    searchNotes(query) {
        const notes = this.getLocalNotesData();
        const results = [];
        
        Object.entries(notes).forEach(([dealId, noteData]) => {
            if (noteData.content.toLowerCase().includes(query.toLowerCase())) {
                const deal = window.crmApp ? window.crmApp.getDeal(dealId) : null;
                results.push({
                    dealId,
                    dealTitle: deal ? deal.title : 'Deal inconnu',
                    content: noteData.content,
                    lastModified: noteData.lastModified
                });
            }
        });
        
        return results;
    }
}

// Initialize Notes Manager
document.addEventListener('DOMContentLoaded', () => {
    window.notesManager = new NotesManager();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotesManager;
}