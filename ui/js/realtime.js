/**
 * CRM Real-time Synchronization Manager
 * Yjs + Hocuspocus Integration following Context7 patterns
 * 
 * Features:
 * - Y.Doc per deal with namespace (deal:123)
 * - Y.Map for kanban position sync
 * - Y.Text for collaborative notes
 * - Awareness for user presence
 * - Robust connection management
 * - Conflict resolution CRDT
 * - Performance monitoring
 */

import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';

class CRMRealtimeManager {
    constructor(options = {}) {
        // Configuration
        this.config = {
            websocketUrl: options.websocketUrl || 'ws://localhost:3001',
            namespace: options.namespace || 'crm',
            reconnectDelay: options.reconnectDelay || 1000,
            maxReconnectAttempts: options.maxReconnectAttempts || 10,
            awarenessUpdateInterval: options.awarenessUpdateInterval || 5000,
            performanceMonitoring: options.performanceMonitoring !== false,
            ...options
        };

        // State management
        this.documents = new Map(); // dealId -> Y.Doc
        this.providers = new Map(); // dealId -> HocuspocusProvider
        this.persistence = new Map(); // dealId -> IndexeddbPersistence
        this.awareness = new Map(); // dealId -> Awareness data
        this.eventListeners = new Map(); // event -> callbacks[]
        
        // Connection state
        this.isOnline = navigator.onLine;
        this.reconnectAttempts = 0;
        this.reconnectTimeouts = new Map();
        this.currentUser = this.getCurrentUser();
        
        // Performance monitoring
        this.performanceMetrics = {
            syncCount: 0,
            syncTotalTime: 0,
            lastSyncTime: null,
            errorCount: 0,
            connectionCount: 0
        };

        // Initialize
        this.setupEventListeners();
        this.setupNetworkMonitoring();
        
        console.log('CRM Realtime Manager initialized', this.config);
    }

    // ===========================================
    // CORE DOCUMENT MANAGEMENT
    // ===========================================

    /**
     * Join a deal collaboration session
     */
    async joinDeal(dealId, options = {}) {
        const startTime = performance.now();
        
        try {
            if (this.documents.has(dealId)) {
                console.warn(`Already joined deal: ${dealId}`);
                return this.documents.get(dealId);
            }

            // Create Y.Doc with namespace
            const doc = new Y.Doc();
            const docName = `${this.config.namespace}:deal:${dealId}`;
            
            // Setup document structure
            const dealMap = doc.getMap('deal');
            const notesText = doc.getText('notes');
            const activityArray = doc.getArray('activity');
            const metadataMap = doc.getMap('metadata');

            // Initialize with provided data
            if (options.initialData) {
                doc.transact(() => {
                    Object.entries(options.initialData).forEach(([key, value]) => {
                        dealMap.set(key, value);
                    });
                    metadataMap.set('createdAt', Date.now());
                    metadataMap.set('createdBy', this.currentUser.id);
                }, 'initial-data');
            }

            if (options.initialNotes) {
                doc.transact(() => {
                    notesText.insert(0, options.initialNotes);
                }, 'initial-notes');
            }

            // Setup Hocuspocus provider
            const provider = new HocuspocusProvider({
                url: this.config.websocketUrl,
                name: docName,
                document: doc,
                token: this.getAuthToken(),
                parameters: {
                    dealId: dealId,
                    userId: this.currentUser.id
                },
                onConnect: () => this.handleProviderConnect(dealId),
                onDisconnect: () => this.handleProviderDisconnect(dealId),
                onMessage: (data) => this.handleProviderMessage(dealId, data),
                onStatus: (status) => this.handleProviderStatus(dealId, status),
                onSynced: () => this.handleProviderSynced(dealId)
            });

            // Setup IndexedDB persistence
            const persistence = new IndexeddbPersistence(docName, doc);
            
            // Setup awareness
            const awareness = provider.awareness;
            awareness.setLocalStateField('user', this.currentUser);
            awareness.setLocalStateField('deal', dealId);
            awareness.setLocalStateField('joinedAt', Date.now());

            // Store references
            this.documents.set(dealId, doc);
            this.providers.set(dealId, provider);
            this.persistence.set(dealId, persistence);
            this.awareness.set(dealId, awareness);

            // Setup observers
            this.setupDocumentObservers(dealId, doc);
            this.setupAwarenessObservers(dealId, awareness);

            // Performance tracking
            if (this.config.performanceMonitoring) {
                const joinTime = performance.now() - startTime;
                this.performanceMetrics.connectionCount++;
                this.performanceMetrics.syncTotalTime += joinTime;
                
                this.emit('performanceUpdate', {
                    type: 'join',
                    dealId,
                    duration: joinTime,
                    metrics: this.performanceMetrics
                });
            }

            this.emit('dealJoined', { dealId, doc, provider, awareness });
            console.log(`Successfully joined deal: ${dealId}`);
            
            return doc;
        } catch (error) {
            this.performanceMetrics.errorCount++;
            console.error(`Failed to join deal: ${dealId}`, error);
            this.emit('error', { type: 'join', dealId, error });
            throw error;
        }
    }

    /**
     * Leave a deal collaboration session
     */
    async leaveDeal(dealId) {
        try {
            // Clean up provider
            const provider = this.providers.get(dealId);
            if (provider) {
                provider.destroy();
                this.providers.delete(dealId);
            }

            // Clean up persistence
            const persistence = this.persistence.get(dealId);
            if (persistence) {
                persistence.destroy();
                this.persistence.delete(dealId);
            }

            // Clean up document
            const doc = this.documents.get(dealId);
            if (doc) {
                doc.destroy();
                this.documents.delete(dealId);
            }

            // Clean up awareness
            this.awareness.delete(dealId);

            // Cancel reconnection attempts
            this.cancelReconnection(dealId);

            this.emit('dealLeft', { dealId });
            console.log(`Successfully left deal: ${dealId}`);
        } catch (error) {
            console.error(`Failed to leave deal: ${dealId}`, error);
            this.emit('error', { type: 'leave', dealId, error });
        }
    }

    // ===========================================
    // KANBAN SYNCHRONIZATION
    // ===========================================

    /**
     * Sync deal position in kanban
     */
    syncDealPosition(dealId, position) {
        const dealMap = this.getDealMap(dealId);
        if (!dealMap) return;

        const startTime = performance.now();

        try {
            dealMap.doc.transact(() => {
                dealMap.set('position', {
                    ...position,
                    updatedAt: Date.now(),
                    updatedBy: this.currentUser.id
                });
                
                // Update activity log
                const activityArray = dealMap.doc.getArray('activity');
                activityArray.push([{
                    type: 'position_update',
                    userId: this.currentUser.id,
                    timestamp: Date.now(),
                    data: position
                }]);
            }, 'position-update');

            // Performance tracking
            if (this.config.performanceMonitoring) {
                const syncTime = performance.now() - startTime;
                this.performanceMetrics.syncCount++;
                this.performanceMetrics.syncTotalTime += syncTime;
                this.performanceMetrics.lastSyncTime = Date.now();
            }

            this.emit('positionSynced', { dealId, position });
        } catch (error) {
            this.performanceMetrics.errorCount++;
            console.error(`Failed to sync position for deal: ${dealId}`, error);
            this.emit('error', { type: 'position-sync', dealId, error });
        }
    }

    /**
     * Sync deal status change
     */
    syncDealStatus(dealId, status, metadata = {}) {
        const dealMap = this.getDealMap(dealId);
        if (!dealMap) return;

        try {
            dealMap.doc.transact(() => {
                dealMap.set('status', status);
                dealMap.set('statusUpdatedAt', Date.now());
                dealMap.set('statusUpdatedBy', this.currentUser.id);
                
                // Add metadata
                Object.entries(metadata).forEach(([key, value]) => {
                    dealMap.set(key, value);
                });
                
                // Update activity log
                const activityArray = dealMap.doc.getArray('activity');
                activityArray.push([{
                    type: 'status_update',
                    userId: this.currentUser.id,
                    timestamp: Date.now(),
                    data: { status, metadata }
                }]);
            }, 'status-update');

            this.emit('statusSynced', { dealId, status, metadata });
        } catch (error) {
            console.error(`Failed to sync status for deal: ${dealId}`, error);
            this.emit('error', { type: 'status-sync', dealId, error });
        }
    }

    // ===========================================
    // COLLABORATIVE NOTES
    // ===========================================

    /**
     * Sync deal notes with CRDT
     */
    syncDealNotes(dealId, content, metadata = {}) {
        const notesText = this.getDealNotes(dealId);
        if (!notesText) return;

        try {
            notesText.doc.transact(() => {
                // Clear existing content
                if (notesText.length > 0) {
                    notesText.delete(0, notesText.length);
                }
                
                // Insert new content
                notesText.insert(0, content);
                
                // Update metadata
                const metadataMap = notesText.doc.getMap('metadata');
                metadataMap.set('notesUpdatedAt', Date.now());
                metadataMap.set('notesUpdatedBy', this.currentUser.id);
                
                Object.entries(metadata).forEach(([key, value]) => {
                    metadataMap.set(`notes_${key}`, value);
                });
            }, 'notes-update');

            this.emit('notesSynced', { dealId, content, metadata });
        } catch (error) {
            console.error(`Failed to sync notes for deal: ${dealId}`, error);
            this.emit('error', { type: 'notes-sync', dealId, error });
        }
    }

    /**
     * Insert text at specific position in notes
     */
    insertNotesText(dealId, index, text) {
        const notesText = this.getDealNotes(dealId);
        if (!notesText) return;

        try {
            notesText.doc.transact(() => {
                notesText.insert(index, text);
            }, 'notes-insert');

            this.emit('notesInserted', { dealId, index, text });
        } catch (error) {
            console.error(`Failed to insert notes text for deal: ${dealId}`, error);
            this.emit('error', { type: 'notes-insert', dealId, error });
        }
    }

    /**
     * Delete text range in notes
     */
    deleteNotesText(dealId, index, length) {
        const notesText = this.getDealNotes(dealId);
        if (!notesText) return;

        try {
            notesText.doc.transact(() => {
                notesText.delete(index, length);
            }, 'notes-delete');

            this.emit('notesDeleted', { dealId, index, length });
        } catch (error) {
            console.error(`Failed to delete notes text for deal: ${dealId}`, error);
            this.emit('error', { type: 'notes-delete', dealId, error });
        }
    }

    // ===========================================
    // AWARENESS & PRESENCE
    // ===========================================

    /**
     * Update user presence state
     */
    updatePresence(dealId, state) {
        const awareness = this.awareness.get(dealId);
        if (!awareness) return;

        try {
            awareness.setLocalStateField('presence', {
                ...state,
                updatedAt: Date.now()
            });

            this.emit('presenceUpdated', { dealId, state });
        } catch (error) {
            console.error(`Failed to update presence for deal: ${dealId}`, error);
            this.emit('error', { type: 'presence-update', dealId, error });
        }
    }

    /**
     * Get active users in deal
     */
    getActiveUsers(dealId) {
        const awareness = this.awareness.get(dealId);
        if (!awareness) return [];

        const users = [];
        awareness.getStates().forEach((state, clientId) => {
            if (state.user) {
                users.push({
                    clientId,
                    ...state.user,
                    presence: state.presence,
                    joinedAt: state.joinedAt
                });
            }
        });

        return users;
    }

    // ===========================================
    // UI INTEGRATION HELPERS
    // ===========================================

    /**
     * Bind notes textarea with two-way sync
     */
    bindNotesTextarea(dealId, textarea) {
        const notesText = this.getDealNotes(dealId);
        if (!notesText) return;

        let isLocalUpdate = false;

        // Y.Text -> Textarea
        const updateTextarea = () => {
            if (!isLocalUpdate) {
                const newValue = notesText.toString();
                if (textarea.value !== newValue) {
                    const selectionStart = textarea.selectionStart;
                    const selectionEnd = textarea.selectionEnd;
                    
                    textarea.value = newValue;
                    
                    // Restore cursor position
                    textarea.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        };

        notesText.observe(updateTextarea);

        // Textarea -> Y.Text
        const updateYText = () => {
            isLocalUpdate = true;
            this.syncDealNotes(dealId, textarea.value);
            isLocalUpdate = false;
        };

        textarea.addEventListener('input', updateYText);
        textarea.addEventListener('paste', updateYText);

        // Initial sync
        updateTextarea();

        // Return cleanup function
        return () => {
            notesText.unobserve(updateTextarea);
            textarea.removeEventListener('input', updateYText);
            textarea.removeEventListener('paste', updateYText);
        };
    }

    /**
     * Bind presence indicators
     */
    bindPresenceIndicators(dealId, container) {
        const awareness = this.awareness.get(dealId);
        if (!awareness) return;

        const updatePresenceUI = () => {
            const users = this.getActiveUsers(dealId);
            const currentUserId = this.currentUser.id;
            
            // Filter out current user
            const otherUsers = users.filter(user => user.id !== currentUserId);
            
            // Clear existing indicators
            container.innerHTML = '';
            
            // Show first 3 users
            const visibleUsers = otherUsers.slice(0, 3);
            visibleUsers.forEach(user => {
                const indicator = document.createElement('div');
                indicator.className = 'presence-indicator';
                indicator.style.backgroundColor = user.color || '#666';
                indicator.title = user.name || 'Anonymous';
                indicator.innerHTML = user.avatar || user.name?.charAt(0) || '?';
                container.appendChild(indicator);
            });
            
            // Show count badge if more than 3
            if (otherUsers.length > 3) {
                const countBadge = document.createElement('div');
                countBadge.className = 'presence-count-badge';
                countBadge.textContent = `+${otherUsers.length - 3}`;
                container.appendChild(countBadge);
            }
        };

        awareness.on('update', updatePresenceUI);
        updatePresenceUI();

        // Return cleanup function
        return () => {
            awareness.off('update', updatePresenceUI);
        };
    }

    // ===========================================
    // CONNECTION MANAGEMENT
    // ===========================================

    /**
     * Handle provider connection
     */
    handleProviderConnect(dealId) {
        console.log(`Provider connected for deal: ${dealId}`);
        this.reconnectAttempts = 0;
        this.cancelReconnection(dealId);
        this.emit('connected', { dealId });
    }

    /**
     * Handle provider disconnection
     */
    handleProviderDisconnect(dealId) {
        console.log(`Provider disconnected for deal: ${dealId}`);
        this.emit('disconnected', { dealId });
        
        if (this.isOnline) {
            this.scheduleReconnection(dealId);
        }
    }

    /**
     * Handle provider status changes
     */
    handleProviderStatus(dealId, status) {
        console.log(`Provider status for deal ${dealId}:`, status);
        this.emit('statusChanged', { dealId, status });
    }

    /**
     * Handle provider sync completion
     */
    handleProviderSynced(dealId) {
        console.log(`Provider synced for deal: ${dealId}`);
        this.emit('synced', { dealId });
    }

    /**
     * Handle provider messages
     */
    handleProviderMessage(dealId, message) {
        this.emit('message', { dealId, message });
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnection(dealId) {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.error(`Max reconnection attempts reached for deal: ${dealId}`);
            this.emit('reconnectionFailed', { dealId });
            return;
        }

        const delay = Math.min(
            this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
            30000 // Max 30 seconds
        );
        
        console.log(`Scheduling reconnection for deal ${dealId} in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
        
        const timeout = setTimeout(() => {
            if (this.isOnline && this.providers.has(dealId)) {
                this.reconnectAttempts++;
                const provider = this.providers.get(dealId);
                provider.connect();
            }
        }, delay);
        
        this.reconnectTimeouts.set(dealId, timeout);
    }

    /**
     * Cancel reconnection attempts
     */
    cancelReconnection(dealId) {
        const timeout = this.reconnectTimeouts.get(dealId);
        if (timeout) {
            clearTimeout(timeout);
            this.reconnectTimeouts.delete(dealId);
        }
    }

    /**
     * Pause all connections
     */
    pauseConnections() {
        this.providers.forEach(provider => {
            provider.disconnect();
        });
        this.emit('connectionsPaused');
    }

    /**
     * Resume all connections
     */
    resumeConnections() {
        this.providers.forEach(provider => {
            provider.connect();
        });
        this.emit('connectionsResumed');
    }

    // ===========================================
    // DOCUMENT OBSERVERS
    // ===========================================

    /**
     * Setup document observers for real-time updates
     */
    setupDocumentObservers(dealId, doc) {
        const dealMap = doc.getMap('deal');
        const notesText = doc.getText('notes');
        const activityArray = doc.getArray('activity');

        // Deal data changes
        dealMap.observe((event) => {
            this.emit('dealDataChanged', {
                dealId,
                changes: event.changes,
                transaction: event.transaction
            });
        });

        // Notes changes
        notesText.observe((event) => {
            this.emit('notesChanged', {
                dealId,
                changes: event.changes,
                transaction: event.transaction,
                content: notesText.toString()
            });
        });

        // Activity log changes
        activityArray.observe((event) => {
            this.emit('activityChanged', {
                dealId,
                changes: event.changes,
                transaction: event.transaction,
                activities: activityArray.toArray()
            });
        });
    }

    /**
     * Setup awareness observers
     */
    setupAwarenessObservers(dealId, awareness) {
        awareness.on('update', ({ added, updated, removed }) => {
            const users = this.getActiveUsers(dealId);
            
            this.emit('awarenessUpdate', {
                dealId,
                users,
                added,
                updated,
                removed
            });
        });
    }

    // ===========================================
    // NETWORK MONITORING
    // ===========================================

    /**
     * Setup network monitoring
     */
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('Network back online - resuming connections');
            this.resumeConnections();
            this.emit('networkOnline');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('Network offline - pausing connections');
            this.pauseConnections();
            this.emit('networkOffline');
        });

        // Visibility API for performance optimization
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.emit('tabHidden');
            } else {
                this.emit('tabVisible');
            }
        });

        // Focus/blur events
        window.addEventListener('focus', () => {
            this.emit('windowFocus');
        });

        window.addEventListener('blur', () => {
            this.emit('windowBlur');
        });
    }

    // ===========================================
    // CONFLICT RESOLUTION
    // ===========================================

    /**
     * Resolve conflicts using configurable strategies
     */
    resolveConflict(dealId, field, localValue, remoteValue, strategy = 'last-write-wins') {
        switch (strategy) {
            case 'last-write-wins':
                return remoteValue.updatedAt > localValue.updatedAt ? remoteValue : localValue;
            
            case 'merge-objects':
                return { ...localValue, ...remoteValue };
            
            case 'custom':
                return this.emit('conflictResolution', {
                    dealId,
                    field,
                    localValue,
                    remoteValue,
                    resolve: (resolvedValue) => resolvedValue
                });
            
            default:
                console.warn(`Unknown conflict resolution strategy: ${strategy}`);
                return remoteValue;
        }
    }

    // ===========================================
    // UTILITY METHODS
    // ===========================================

    /**
     * Get deal Y.Map
     */
    getDealMap(dealId) {
        const doc = this.documents.get(dealId);
        return doc ? doc.getMap('deal') : null;
    }

    /**
     * Get deal notes Y.Text
     */
    getDealNotes(dealId) {
        const doc = this.documents.get(dealId);
        return doc ? doc.getText('notes') : null;
    }

    /**
     * Get deal activity Y.Array
     */
    getDealActivity(dealId) {
        const doc = this.documents.get(dealId);
        return doc ? doc.getArray('activity') : null;
    }

    /**
     * Get current user info
     */
    getCurrentUser() {
        return {
            id: this.getUserId(),
            name: localStorage.getItem('crm-user-name') || 'Anonymous',
            email: localStorage.getItem('crm-user-email') || '',
            color: localStorage.getItem('crm-user-color') || this.generateUserColor(),
            avatar: localStorage.getItem('crm-user-avatar') || null
        };
    }

    /**
     * Get user ID from localStorage or generate one
     */
    getUserId() {
        let userId = localStorage.getItem('crm-user-id');
        if (!userId) {
            userId = 'user_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('crm-user-id', userId);
        }
        return userId;
    }

    /**
     * Generate random user color
     */
    generateUserColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Get auth token
     */
    getAuthToken() {
        return localStorage.getItem('crm-auth-token') || '';
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            averageSyncTime: this.performanceMetrics.syncCount > 0 
                ? this.performanceMetrics.syncTotalTime / this.performanceMetrics.syncCount 
                : 0,
            activeConnections: this.providers.size,
            documentsCount: this.documents.size
        };
    }

    // ===========================================
    // EVENT SYSTEM
    // ===========================================

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Initialize event listeners map
        this.eventListeners.set('dealJoined', []);
        this.eventListeners.set('dealLeft', []);
        this.eventListeners.set('connected', []);
        this.eventListeners.set('disconnected', []);
        this.eventListeners.set('synced', []);
        this.eventListeners.set('dealDataChanged', []);
        this.eventListeners.set('notesChanged', []);
        this.eventListeners.set('activityChanged', []);
        this.eventListeners.set('awarenessUpdate', []);
        this.eventListeners.set('positionSynced', []);
        this.eventListeners.set('statusSynced', []);
        this.eventListeners.set('notesSynced', []);
        this.eventListeners.set('presenceUpdated', []);
        this.eventListeners.set('error', []);
        this.eventListeners.set('networkOnline', []);
        this.eventListeners.set('networkOffline', []);
        this.eventListeners.set('performanceUpdate', []);
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const callbacks = this.eventListeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     */
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    // ===========================================
    // CLEANUP
    // ===========================================

    /**
     * Destroy all connections and clean up
     */
    destroy() {
        // Leave all deals
        const dealIds = Array.from(this.documents.keys());
        dealIds.forEach(dealId => {
            this.leaveDeal(dealId);
        });

        // Clear all maps
        this.documents.clear();
        this.providers.clear();
        this.persistence.clear();
        this.awareness.clear();
        this.eventListeners.clear();
        this.reconnectTimeouts.clear();

        // Remove network listeners
        window.removeEventListener('online', this.handleNetworkOnline);
        window.removeEventListener('offline', this.handleNetworkOffline);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);

        console.log('CRM Realtime Manager destroyed');
    }
}

// ===========================================
// GLOBAL INSTANCE & INITIALIZATION
// ===========================================

// Create global instance
window.CRMRealtimeManager = CRMRealtimeManager;

// Initialize default instance
let realtimeManager = null;

/**
 * Initialize the realtime manager
 */
function initializeRealtimeManager(options = {}) {
    if (realtimeManager) {
        console.warn('Realtime manager already initialized');
        return realtimeManager;
    }

    realtimeManager = new CRMRealtimeManager(options);
    
    // Setup global error handling
    realtimeManager.on('error', (error) => {
        console.error('Realtime Manager Error:', error);
        
        // Optional: Send to error tracking service
        if (window.Sentry) {
            window.Sentry.captureException(error.error || error);
        }
    });

    // Setup global performance monitoring
    realtimeManager.on('performanceUpdate', (metrics) => {
        console.log('Performance Update:', metrics);
        
        // Optional: Send to analytics
        if (window.gtag) {
            window.gtag('event', 'realtime_performance', {
                custom_map: metrics
            });
        }
    });

    console.log('Global realtime manager initialized');
    return realtimeManager;
}

/**
 * Get the global realtime manager instance
 */
function getRealtimeManager() {
    if (!realtimeManager) {
        throw new Error('Realtime manager not initialized. Call initializeRealtimeManager() first.');
    }
    return realtimeManager;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CRMRealtimeManager, initializeRealtimeManager, getRealtimeManager };
}

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Auto-initialize with default options
        initializeRealtimeManager();
    });
} else {
    // Auto-initialize immediately
    initializeRealtimeManager();
}

// Make functions globally available
window.initializeRealtimeManager = initializeRealtimeManager;
window.getRealtimeManager = getRealtimeManager;

console.log('CRM Realtime Module loaded');