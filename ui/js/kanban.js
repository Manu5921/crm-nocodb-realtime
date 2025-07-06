// Kanban Board Management
class KanbanManager {
    constructor() {
        this.columns = {
            'lead': {
                id: 'lead-column',
                title: 'Lead',
                color: '#3B82F6',
                description: 'Nouveaux prospects'
            },
            'qualified': {
                id: 'qualified-column',
                title: 'Qualified',
                color: '#F59E0B',
                description: 'Prospects qualifiés'
            },
            'proposal': {
                id: 'proposal-column',
                title: 'Proposal',
                color: '#8B5CF6',
                description: 'Propositions envoyées'
            },
            'won': {
                id: 'won-lost-column',
                title: 'Won',
                color: '#10B981',
                description: 'Deals gagnés'
            },
            'lost': {
                id: 'won-lost-column',
                title: 'Lost',
                color: '#EF4444',
                description: 'Deals perdus'
            }
        };
        
        this.sortableInstances = {};
        this.init();
    }

    init() {
        this.setupSortable();
        this.setupColumnEvents();
        this.setupKeyboardNavigation();
        console.log('Kanban Manager initialized');
    }

    setupSortable() {
        Object.keys(this.columns).forEach(status => {
            const column = this.columns[status];
            const element = document.getElementById(column.id);
            
            if (element && !this.sortableInstances[column.id]) {
                this.sortableInstances[column.id] = Sortable.create(element, {
                    group: 'kanban-deals',
                    animation: 200,
                    ghostClass: 'sortable-ghost',
                    dragClass: 'sortable-drag',
                    chosenClass: 'sortable-chosen',
                    delay: 100,
                    delayOnTouchStart: true,
                    touchStartThreshold: 10,
                    forceFallback: true,
                    fallbackClass: 'sortable-fallback',
                    
                    onStart: (evt) => {
                        this.onDragStart(evt);
                    },
                    
                    onMove: (evt) => {
                        return this.onDragMove(evt);
                    },
                    
                    onEnd: (evt) => {
                        this.onDragEnd(evt);
                    },
                    
                    onAdd: (evt) => {
                        this.onDealMoved(evt);
                    },
                    
                    onUpdate: (evt) => {
                        this.onDealReordered(evt);
                    }
                });
            }
        });
    }

    onDragStart(evt) {
        const dealCard = evt.item;
        const dealId = dealCard.dataset.dealId;
        
        // Add visual feedback
        dealCard.classList.add('dragging');
        this.highlightDropZones(true);
        
        // Store original position for potential cancellation
        this.originalPosition = {
            container: evt.from,
            index: evt.oldIndex
        };
        
        // Emit event for other components
        this.emit('dragStart', { dealId, element: dealCard });
    }

    onDragMove(evt) {
        const related = evt.related;
        const dragged = evt.dragged;
        
        // Prevent dropping on certain elements
        if (related.classList.contains('kanban-header')) {
            return false;
        }
        
        // Visual feedback for drop zones
        this.updateDropZoneFeedback(evt.to);
        
        return true;
    }

    onDragEnd(evt) {
        const dealCard = evt.item;
        
        // Remove visual feedback
        dealCard.classList.remove('dragging');
        this.highlightDropZones(false);
        this.clearDropZoneFeedback();
        
        // Emit event
        this.emit('dragEnd', { element: dealCard });
    }

    onDealMoved(evt) {
        const dealCard = evt.item;
        const dealId = dealCard.dataset.dealId;
        const fromColumn = evt.from.dataset.status;
        const toColumn = evt.to.dataset.status;
        
        // Handle won/lost column logic
        let newStatus = toColumn;
        if (toColumn === 'won,lost') {
            newStatus = this.determineWonLostStatus(dealCard, evt.to);
        }
        
        // Update deal status
        if (window.crmApp) {
            window.crmApp.updateDealStatus(dealId, newStatus);
        }
        
        // Update visual state
        dealCard.dataset.status = newStatus;
        this.updateDealCardVisuals(dealCard, newStatus);
        
        // Emit event
        this.emit('dealMoved', {
            dealId,
            fromStatus: fromColumn,
            toStatus: newStatus,
            element: dealCard
        });
        
        // Animation
        this.animateMove(dealCard);
    }

    onDealReordered(evt) {
        const dealCard = evt.item;
        const dealId = dealCard.dataset.dealId;
        
        // Handle reordering within the same column
        this.emit('dealReordered', {
            dealId,
            newIndex: evt.newIndex,
            oldIndex: evt.oldIndex,
            element: dealCard
        });
    }

    determineWonLostStatus(dealCard, targetColumn) {
        // Simple logic: check if dropped in upper or lower half
        const columnRect = targetColumn.getBoundingClientRect();
        const cardRect = dealCard.getBoundingClientRect();
        const midpoint = columnRect.top + (columnRect.height / 2);
        
        return cardRect.top < midpoint ? 'won' : 'lost';
    }

    updateDealCardVisuals(dealCard, status) {
        // Update card color indicator
        dealCard.dataset.status = status;
        
        // Update any status-specific styling
        const statusClasses = ['status-lead', 'status-qualified', 'status-proposal', 'status-won', 'status-lost'];
        statusClasses.forEach(cls => dealCard.classList.remove(cls));
        dealCard.classList.add(`status-${status}`);
    }

    highlightDropZones(highlight) {
        const dropZones = document.querySelectorAll('.kanban-cards');
        dropZones.forEach(zone => {
            if (highlight) {
                zone.classList.add('drop-zone-active');
            } else {
                zone.classList.remove('drop-zone-active');
            }
        });
    }

    updateDropZoneFeedback(targetColumn) {
        // Clear previous feedback
        this.clearDropZoneFeedback();
        
        // Add feedback to current target
        if (targetColumn) {
            targetColumn.classList.add('drop-zone-hover');
        }
    }

    clearDropZoneFeedback() {
        const dropZones = document.querySelectorAll('.kanban-cards');
        dropZones.forEach(zone => {
            zone.classList.remove('drop-zone-hover');
        });
    }

    animateMove(dealCard) {
        dealCard.classList.add('animate-bounce');
        setTimeout(() => {
            dealCard.classList.remove('animate-bounce');
        }, 800);
    }

    setupColumnEvents() {
        // Column header click events
        document.querySelectorAll('.kanban-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const column = e.currentTarget.closest('.kanban-column');
                const status = column.querySelector('.kanban-cards').dataset.status;
                this.onColumnHeaderClick(status, column);
            });
        });
        
        // Column collapse/expand functionality
        document.querySelectorAll('.kanban-column').forEach(column => {
            const toggle = column.querySelector('.column-toggle');
            if (toggle) {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleColumn(column);
                });
            }
        });
    }

    onColumnHeaderClick(status, column) {
        // Could be used for column-specific actions
        this.emit('columnClick', { status, column });
    }

    toggleColumn(column) {
        const cards = column.querySelector('.kanban-cards');
        const isCollapsed = column.classList.contains('collapsed');
        
        if (isCollapsed) {
            column.classList.remove('collapsed');
            cards.style.display = 'block';
        } else {
            column.classList.add('collapsed');
            cards.style.display = 'none';
        }
        
        this.emit('columnToggle', { column, collapsed: !isCollapsed });
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('deal-card')) {
                this.handleCardKeyboard(e);
            }
        });
    }

    handleCardKeyboard(e) {
        const card = e.target;
        const dealId = card.dataset.dealId;
        
        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (window.crmApp) {
                    window.crmApp.openDealModal(window.crmApp.getDeal(dealId));
                }
                break;
                
            case 'ArrowRight':
                e.preventDefault();
                this.moveCardToNextColumn(card);
                break;
                
            case 'ArrowLeft':
                e.preventDefault();
                this.moveCardToPreviousColumn(card);
                break;
                
            case 'Delete':
                e.preventDefault();
                this.confirmDeleteCard(card);
                break;
        }
    }

    moveCardToNextColumn(card) {
        const currentStatus = card.dataset.status;
        const statusFlow = ['lead', 'qualified', 'proposal', 'won'];
        const currentIndex = statusFlow.indexOf(currentStatus);
        
        if (currentIndex < statusFlow.length - 1) {
            const nextStatus = statusFlow[currentIndex + 1];
            this.moveCardToColumn(card, nextStatus);
        }
    }

    moveCardToPreviousColumn(card) {
        const currentStatus = card.dataset.status;
        const statusFlow = ['lead', 'qualified', 'proposal', 'won'];
        const currentIndex = statusFlow.indexOf(currentStatus);
        
        if (currentIndex > 0) {
            const previousStatus = statusFlow[currentIndex - 1];
            this.moveCardToColumn(card, previousStatus);
        }
    }

    moveCardToColumn(card, newStatus) {
        const dealId = card.dataset.dealId;
        const targetColumn = this.getColumnElement(newStatus);
        
        if (targetColumn) {
            targetColumn.appendChild(card);
            
            if (window.crmApp) {
                window.crmApp.updateDealStatus(dealId, newStatus);
            }
            
            this.updateDealCardVisuals(card, newStatus);
            this.animateMove(card);
        }
    }

    getColumnElement(status) {
        const columnMap = {
            'lead': 'lead-column',
            'qualified': 'qualified-column',
            'proposal': 'proposal-column',
            'won': 'won-lost-column',
            'lost': 'won-lost-column'
        };
        
        return document.getElementById(columnMap[status]);
    }

    confirmDeleteCard(card) {
        const dealId = card.dataset.dealId;
        const deal = window.crmApp ? window.crmApp.getDeal(dealId) : null;
        
        if (deal && confirm(`Êtes-vous sûr de vouloir supprimer le deal "${deal.title}" ?`)) {
            this.deleteCard(card);
        }
    }

    deleteCard(card) {
        const dealId = card.dataset.dealId;
        
        // Animate out
        card.classList.add('animate-slide-out');
        
        setTimeout(() => {
            card.remove();
            
            if (window.crmApp) {
                window.crmApp.deleteDeal(dealId);
            }
            
            this.emit('dealDeleted', { dealId });
        }, 300);
    }

    // Event system
    emit(eventName, data) {
        const event = new CustomEvent(`kanban:${eventName}`, {
            detail: data
        });
        document.dispatchEvent(event);
    }

    on(eventName, callback) {
        document.addEventListener(`kanban:${eventName}`, callback);
    }

    off(eventName, callback) {
        document.removeEventListener(`kanban:${eventName}`, callback);
    }

    // Public API
    refresh() {
        this.setupSortable();
    }

    destroy() {
        Object.values(this.sortableInstances).forEach(instance => {
            instance.destroy();
        });
        this.sortableInstances = {};
    }

    getColumnStats(status) {
        const column = this.getColumnElement(status);
        if (!column) return null;
        
        const cards = column.querySelectorAll('.deal-card');
        const totalAmount = Array.from(cards).reduce((sum, card) => {
            const dealId = card.dataset.dealId;
            const deal = window.crmApp ? window.crmApp.getDeal(dealId) : null;
            return sum + (deal ? deal.amount : 0);
        }, 0);
        
        return {
            count: cards.length,
            totalAmount,
            averageAmount: cards.length > 0 ? totalAmount / cards.length : 0
        };
    }

    getAllStats() {
        const stats = {};
        Object.keys(this.columns).forEach(status => {
            stats[status] = this.getColumnStats(status);
        });
        return stats;
    }
}

// Initialize Kanban Manager
document.addEventListener('DOMContentLoaded', () => {
    window.kanbanManager = new KanbanManager();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KanbanManager;
}