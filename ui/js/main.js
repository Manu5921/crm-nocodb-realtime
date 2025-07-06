// Main CRM Application
class CRMApp {
    constructor() {
        this.deals = [];
        this.isDebugMode = localStorage.getItem('DEBUG') === 'true';
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        this.currentDeal = null;
        this.sortables = {};
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDarkMode();
        this.setupKanban();
        this.loadDeals();
        this.updateStats();
        this.setupDebugPanel();
        
        // Initialize other modules
        if (window.NotesManager) {
            this.notesManager = new NotesManager();
        }
        
        if (window.RealtimeManager) {
            this.realtimeManager = new RealtimeManager();
        }
        
        console.log('CRM App initialized');
    }

    setupEventListeners() {
        // Dark mode toggle
        document.getElementById('dark-mode-toggle').addEventListener('click', () => {
            this.toggleDarkMode();
        });

        // Add deal button
        document.getElementById('add-deal-btn').addEventListener('click', () => {
            this.openDealModal();
        });

        // Modal controls
        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeDealModal();
        });

        document.getElementById('cancel-deal').addEventListener('click', () => {
            this.closeDealModal();
        });

        document.getElementById('save-deal').addEventListener('click', () => {
            this.saveDeal();
        });

        // Debug panel
        document.getElementById('debug-toggle').addEventListener('click', () => {
            this.toggleDebugPanel();
        });

        document.getElementById('close-debug').addEventListener('click', () => {
            this.toggleDebugPanel();
        });

        document.getElementById('clear-storage').addEventListener('click', () => {
            this.clearStorage();
        });

        document.getElementById('export-data').addEventListener('click', () => {
            this.exportData();
        });

        // Modal backdrop click
        document.getElementById('deal-modal').addEventListener('click', (e) => {
            if (e.target.id === 'deal-modal') {
                this.closeDealModal();
            }
        });

        // Escape key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDealModal();
            }
        });
    }

    setupDarkMode() {
        if (this.isDarkMode) {
            document.documentElement.classList.add('dark');
            document.getElementById('sun-icon').classList.add('hidden');
            document.getElementById('moon-icon').classList.remove('hidden');
        } else {
            document.documentElement.classList.remove('dark');
            document.getElementById('sun-icon').classList.remove('hidden');
            document.getElementById('moon-icon').classList.add('hidden');
        }
    }

    toggleDarkMode() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', this.isDarkMode);
        this.setupDarkMode();
    }

    setupKanban() {
        const columns = ['lead', 'qualified', 'proposal', 'won-lost'];
        
        columns.forEach(columnId => {
            const column = document.getElementById(`${columnId}-column`);
            if (column) {
                this.sortables[columnId] = Sortable.create(column, {
                    group: 'deals',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    dragClass: 'sortable-drag',
                    onStart: (evt) => {
                        evt.item.classList.add('dragging');
                        document.querySelectorAll('.kanban-cards').forEach(col => {
                            col.classList.add('drop-zone-active');
                        });
                    },
                    onEnd: (evt) => {
                        evt.item.classList.remove('dragging');
                        document.querySelectorAll('.kanban-cards').forEach(col => {
                            col.classList.remove('drop-zone-active');
                        });
                        
                        // Update deal status
                        const dealId = evt.item.dataset.dealId;
                        const newStatus = evt.to.dataset.status;
                        this.updateDealStatus(dealId, newStatus);
                    }
                });
            }
        });
    }

    loadDeals() {
        const storedDeals = localStorage.getItem('crm-deals');
        if (storedDeals) {
            this.deals = JSON.parse(storedDeals);
        } else {
            // Load sample data
            this.deals = this.getSampleDeals();
        }
        
        this.renderDeals();
    }

    getSampleDeals() {
        return [
            {
                id: 'deal-1',
                title: 'Acme Corp - Logiciel CRM',
                amount: 15000,
                status: 'lead',
                company: 'Acme Corp',
                contact: 'Jean Dupont',
                notes: 'Premier contact établi. Intérêt confirmé pour notre solution CRM.',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'deal-2',
                title: 'TechStart - Consultation',
                amount: 5000,
                status: 'qualified',
                company: 'TechStart',
                contact: 'Marie Martin',
                notes: 'Besoin validé. Proposition à préparer.',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'deal-3',
                title: 'BigCorp - Intégration',
                amount: 25000,
                status: 'proposal',
                company: 'BigCorp',
                contact: 'Pierre Durand',
                notes: 'Proposition envoyée. Attente de retour.',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'deal-4',
                title: 'SmallBiz - Support',
                amount: 3000,
                status: 'won',
                company: 'SmallBiz',
                contact: 'Sophie Lefebvre',
                notes: 'Deal signé ! Début du projet prévu la semaine prochaine.',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];
    }

    renderDeals() {
        // Clear all columns
        document.querySelectorAll('.kanban-cards').forEach(column => {
            column.innerHTML = '';
        });

        // Render deals in their respective columns
        this.deals.forEach(deal => {
            const dealCard = this.createDealCard(deal);
            const targetColumn = this.getTargetColumn(deal.status);
            if (targetColumn) {
                targetColumn.appendChild(dealCard);
            }
        });

        this.updateStats();
    }

    createDealCard(deal) {
        const card = document.createElement('div');
        card.className = 'deal-card animate-slide-in';
        card.dataset.dealId = deal.id;
        card.dataset.status = deal.status;

        const priorityClass = this.getPriorityClass(deal.amount);
        const formattedAmount = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format(deal.amount);

        card.innerHTML = `
            <div class="priority-indicator ${priorityClass}"></div>
            <div class="deal-card-header">
                <h4 class="deal-card-title">${deal.title}</h4>
                <span class="deal-card-amount">${formattedAmount}</span>
            </div>
            <div class="deal-card-meta">
                <div>
                    <div class="deal-card-company">${deal.company}</div>
                    <div class="deal-card-contact">${deal.contact}</div>
                </div>
                <div class="deal-card-date">
                    ${new Date(deal.updatedAt).toLocaleDateString('fr-FR')}
                </div>
            </div>
        `;

        // Add click handler
        card.addEventListener('click', () => {
            this.openDealModal(deal);
        });

        return card;
    }

    getPriorityClass(amount) {
        if (amount >= 20000) return 'priority-high';
        if (amount >= 10000) return 'priority-medium';
        return 'priority-low';
    }

    getTargetColumn(status) {
        const columnMap = {
            'lead': 'lead-column',
            'qualified': 'qualified-column',
            'proposal': 'proposal-column',
            'won': 'won-lost-column',
            'lost': 'won-lost-column'
        };
        
        return document.getElementById(columnMap[status]);
    }

    updateDealStatus(dealId, newStatus) {
        const deal = this.deals.find(d => d.id === dealId);
        if (deal) {
            // Handle won-lost column
            if (newStatus === 'won,lost') {
                // For now, default to 'won' - this could be enhanced with a modal
                newStatus = 'won';
            }
            
            deal.status = newStatus;
            deal.updatedAt = new Date().toISOString();
            this.saveDeals();
            this.updateStats();
            this.showNotification(`Deal déplacé vers ${newStatus}`, 'success');
        }
    }

    openDealModal(deal = null) {
        this.currentDeal = deal;
        const modal = document.getElementById('deal-modal');
        const form = document.getElementById('deal-form');
        
        if (deal) {
            // Edit mode
            document.getElementById('modal-title').textContent = 'Modifier le Deal';
            document.getElementById('deal-title').value = deal.title;
            document.getElementById('deal-amount').value = deal.amount;
            document.getElementById('deal-status').value = deal.status;
            document.getElementById('deal-company').value = deal.company;
            document.getElementById('deal-contact').value = deal.contact;
            document.getElementById('deal-notes').value = deal.notes || '';
        } else {
            // Add mode
            document.getElementById('modal-title').textContent = 'Nouveau Deal';
            form.reset();
        }
        
        modal.classList.remove('hidden');
        document.getElementById('deal-title').focus();
    }

    closeDealModal() {
        const modal = document.getElementById('deal-modal');
        modal.classList.add('hidden');
        this.currentDeal = null;
    }

    saveDeal() {
        const form = document.getElementById('deal-form');
        const formData = new FormData(form);
        
        const dealData = {
            title: document.getElementById('deal-title').value,
            amount: parseFloat(document.getElementById('deal-amount').value) || 0,
            status: document.getElementById('deal-status').value,
            company: document.getElementById('deal-company').value,
            contact: document.getElementById('deal-contact').value,
            notes: document.getElementById('deal-notes').value
        };

        if (!dealData.title.trim()) {
            this.showNotification('Le titre du deal est requis', 'error');
            return;
        }

        if (this.currentDeal) {
            // Update existing deal
            const deal = this.deals.find(d => d.id === this.currentDeal.id);
            if (deal) {
                Object.assign(deal, dealData);
                deal.updatedAt = new Date().toISOString();
            }
        } else {
            // Create new deal
            const newDeal = {
                id: 'deal-' + Date.now(),
                ...dealData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.deals.push(newDeal);
        }

        this.saveDeals();
        this.renderDeals();
        this.closeDealModal();
        this.showNotification('Deal sauvegardé avec succès', 'success');
    }

    saveDeals() {
        localStorage.setItem('crm-deals', JSON.stringify(this.deals));
    }

    updateStats() {
        const totalDeals = this.deals.length;
        const pipelineValue = this.deals.reduce((sum, deal) => sum + deal.amount, 0);
        const wonDeals = this.deals.filter(deal => deal.status === 'won').length;
        const conversionRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;

        document.getElementById('total-deals').textContent = totalDeals;
        document.getElementById('pipeline-value').textContent = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format(pipelineValue);
        document.getElementById('conversion-rate').textContent = `${conversionRate}%`;

        // Update column counts
        const statusCounts = this.deals.reduce((acc, deal) => {
            acc[deal.status] = (acc[deal.status] || 0) + 1;
            return acc;
        }, {});

        document.querySelectorAll('.deal-count').forEach(counter => {
            const statuses = counter.dataset.status.split(',');
            const count = statuses.reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
            counter.textContent = count;
        });
    }

    setupDebugPanel() {
        if (this.isDebugMode) {
            this.toggleDebugPanel();
        }
        this.updateDebugInfo();
    }

    toggleDebugPanel() {
        const panel = document.getElementById('debug-panel');
        panel.classList.toggle('hidden');
        this.updateDebugInfo();
    }

    updateDebugInfo() {
        const storageSize = JSON.stringify(localStorage).length;
        const dealsCount = this.deals.length;
        const lastSync = localStorage.getItem('lastSync') || 'Never';
        const yjsConnected = window.RealtimeManager ? window.RealtimeManager.isConnected : false;

        document.getElementById('debug-storage').textContent = `${storageSize} bytes`;
        document.getElementById('debug-deals').textContent = dealsCount;
        document.getElementById('debug-yjs').textContent = yjsConnected;
        document.getElementById('debug-sync').textContent = lastSync;
    }

    clearStorage() {
        if (confirm('Êtes-vous sûr de vouloir effacer toutes les données ?')) {
            localStorage.clear();
            this.deals = [];
            this.renderDeals();
            this.showNotification('Données effacées', 'warning');
        }
    }

    exportData() {
        const data = {
            deals: this.deals,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crm-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showNotification('Données exportées', 'success');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Public API methods
    getDeal(id) {
        return this.deals.find(deal => deal.id === id);
    }

    updateDeal(id, updates) {
        const deal = this.getDeal(id);
        if (deal) {
            Object.assign(deal, updates);
            deal.updatedAt = new Date().toISOString();
            this.saveDeals();
            this.renderDeals();
            return true;
        }
        return false;
    }

    deleteDeal(id) {
        const index = this.deals.findIndex(deal => deal.id === id);
        if (index > -1) {
            this.deals.splice(index, 1);
            this.saveDeals();
            this.renderDeals();
            return true;
        }
        return false;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.crmApp = new CRMApp();
});

// Enable debug mode from console
window.enableDebug = () => {
    localStorage.setItem('DEBUG', 'true');
    location.reload();
};

window.disableDebug = () => {
    localStorage.removeItem('DEBUG');
    location.reload();
};