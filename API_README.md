# NocoDB API Wrapper v2.0 - Context7 Enhanced

## Vue d'ensemble

Ce wrapper API pour NocoDB implémente les meilleures pratiques de Context7 avec des fonctionnalités avancées pour un CRM robuste et performant.

## Fonctionnalités principales

### 🔧 Configuration NocoDB
- Support des headers `xc-token` et `xc-auth`
- Base URL configurable avec priorité (config > localStorage > environment > default)
- Gestion des organisations et projets
- Validation automatique de la configuration

### 🚀 CRUD Operations Avancées
- **Deals** : Création, lecture, mise à jour, suppression avec gestion des relations
- **Contacts** : CRUD complet avec validation email
- **Companies** : CRUD avec validation URL
- Pagination intelligente (défaut 25, max 100)
- Filtrage avancé avec syntaxe NocoDB
- Optimistic updates avec rollback automatique

### 🔄 Synchronisation Intelligente
- Sync bidirectionnelle avec résolution de conflits
- Support de 4 stratégies de conflit : `client-wins`, `server-wins`, `merge`, `prompt`
- Auto-sync toutes les 5 minutes quand connecté
- Queue offline avec retry automatique

### 🌐 Gestion Hors-ligne Robuste
- Queue des opérations offline avec retry exponentiel
- Fallback vers localStorage en cas de perte de connexion
- Détection automatique de reconnexion réseau
- Synchronisation automatique des données en attente

### ⚡ Performance & Cache
- Cache intelligent avec TTL configurable (5 min par défaut)
- Cleanup automatique du cache (max 1000 entrées)
- Requêtes optimisées avec abortion après 30s
- Retry logic avec backoff exponentiel et jitter

### 🤝 Intégration Yjs
- Support de l'édition collaborative en temps réel
- Synchronisation bidirectionnelle avec documents Yjs
- Observers automatiques pour les mises à jour
- Résolution de conflits intégrée

### 📊 Analytics & Reporting
- Pipeline analytics avec métriques avancées
- Calculs de conversion par étape et priorité
- Prédictions et forecasts
- Rapports d'utilisation et recommandations

### 🛠️ Debug & Testing
- Mode debug activable via `localStorage.DEBUG = 'true'`
- Test de connexion complet avec validation des tables
- Validation automatique des schémas
- Utilitaires de debug exposés sur `window.nocodbDebug`

## Configuration

### Variables d'environnement supportées

```javascript
// Configuration minimale
const config = {
    baseUrl: 'http://localhost:8080',
    apiKey: 'your_api_key',        // ou authToken
    projectId: 'your_project_id',
    orgId: 'your_org_id'
};

// Initialisation
const apiManager = new APIManager(config);
```

### Headers d'authentification
```javascript
// Priorité : xc-token > xc-auth
headers: {
    'xc-token': 'your_api_token',     // API Token (recommandé)
    // OU
    'xc-auth': 'your_jwt_token'       // JWT Token
}
```

## Utilisation

### CRUD Operations de base

```javascript
// Récupération de deals avec filtres avancés
const dealsResult = await apiManager.getDeals({
    filters: {
        status: 'open',
        amount: { gte: 1000 },
        created_at: { between: ['2024-01-01', '2024-12-31'] }
    },
    pagination: { limit: 50, offset: 0 },
    sort: [{ field: 'amount', direction: 'desc' }],
    include: ['company', 'contact']
});

// Création optimiste d'un deal
const newDeal = await apiManager.createDeal({
    title: 'New Opportunity',
    amount: 25000,
    status: 'qualified',
    priority: 'high',
    probability: 75
}, { 
    optimistic: true, 
    validate: true 
});

// Mise à jour avec résolution de conflit
const updatedDeal = await apiManager.updateDeal(dealId, {
    amount: 30000,
    stage: 'proposal'
}, { 
    conflictResolution: 'merge' 
});
```

### Filtrage avancé (syntaxe NocoDB)

```javascript
// Filtres simples
const filters = {
    status: 'open',                    // (status,eq,open)
    amount: { gt: 1000 },             // (amount,gt,1000)
    title: { like: '%urgent%' },       // (title,like,%urgent%)
    priority: { in: ['high', 'medium'] } // (priority,in,high,medium)
};

// Filtres complexes
const complexFilters = {
    amount: { between: [1000, 50000] },  // (amount,btw,1000,50000)
    created_at: { gte: '2024-01-01' },   // (created_at,gte,2024-01-01)
    notes: { notNull: true }             // (notes,isnot,null)
};
```

### Synchronisation intelligente

```javascript
// Sync bidirectionnelle avec résolution de conflits
const syncResult = await apiManager.intelligentSync({
    direction: 'bidirectional',         // 'upload', 'download', 'bidirectional'
    conflictResolution: 'merge'         // 'client-wins', 'server-wins', 'merge', 'prompt'
});

console.log('Sync results:', syncResult.results);
// { deals: { uploaded: 5, downloaded: 3, conflicts: 1 }, ... }
```

### Analytics avancées

```javascript
// Pipeline analytics complet
const analytics = await apiManager.getPipelineAnalytics({
    timeframe: '30d',
    includeForecasts: true
});

console.log('Analytics:', {
    totalValue: analytics.overview.totalValue,
    conversionRate: analytics.conversion.overall,
    forecast: analytics.forecasts.expectedRevenue
});
```

## Events système

```javascript
// Écouter les événements API
apiManager.on('dealCreated', (event) => {
    console.log('Deal créé:', event.deal);
});

apiManager.on('syncCompleted', (event) => {
    console.log('Sync terminée:', event.results);
});

apiManager.on('conflictResolved', (event) => {
    console.log('Conflit résolu:', event.strategy);
});

// Écouter tous les événements
const unsubscribe = apiManager.onAll((eventData, event) => {
    console.log(`Event: ${event.type}`, eventData);
});
```

## Gestion d'erreurs

```javascript
try {
    const deal = await apiManager.createDeal(dealData);
} catch (error) {
    if (error instanceof APIError) {
        console.error('API Error:', error.status, error.message);
    } else if (error instanceof HTTPError) {
        console.error('HTTP Error:', error.status, error.details);
    }
}
```

## Debug & Testing

```javascript
// Activer le mode debug
localStorage.setItem('DEBUG', 'true');

// Tester la connexion
const testResult = await apiManager.testConnection();
console.table(testResult);

// Valider les schémas de tables
const schemas = await apiManager.validateSchemas();

// Générer un rapport d'utilisation
const report = apiManager.generateUsageReport();

// Utilitaires debug (si DEBUG activé)
window.nocodbDebug.testConnection();
window.nocodbDebug.clearCache();
window.nocodbDebug.processOfflineQueue();
```

## Configuration avancée

### Retry policy

```javascript
const config = {
    retryConfig: {
        attempts: 5,          // Nombre de tentatives
        baseDelay: 1000,      // Délai de base (ms)
        maxDelay: 10000,      // Délai maximum (ms)  
        backoffFactor: 2,     // Facteur d'augmentation
        jitter: true          // Ajouter du jitter
    }
};
```

### Cache configuration

```javascript
const config = {
    cache: {
        enabled: true,
        ttl: 10 * 60 * 1000,  // 10 minutes
    }
};
```

### Interceptors de requête

```javascript
// Ajouter un interceptor de requête
apiManager.addRequestInterceptor((requestData) => {
    console.log('Request:', requestData);
    return requestData;
});

// Ajouter un interceptor de réponse
apiManager.addResponseInterceptor((responseData) => {
    console.log('Response:', responseData);
    return responseData;
});
```

## Endpoints NocoDB supportés

### Structure des endpoints
```
Base URL: http://localhost:8080
Data API: /api/v1/db/data/{org}/{project}/{table}
Meta API: /api/v1/db/meta/projects/{project}
```

### Opérations CRUD
- `GET /api/v1/db/data/{org}/{project}/deals` - Liste des deals
- `POST /api/v1/db/data/{org}/{project}/deals` - Créer un deal
- `PATCH /api/v1/db/data/{org}/{project}/deals/{id}` - Modifier un deal
- `DELETE /api/v1/db/data/{org}/{project}/deals/{id}` - Supprimer un deal

## Compatibilité

- ✅ NocoDB v0.109.7+
- ✅ Navigateurs modernes (ES2020+)  
- ✅ Node.js 16+
- ✅ TypeScript (déclarations incluses)
- ✅ Module ESM et CommonJS

## License

Ce code est développé selon les patterns Context7 pour une utilisation avec NocoDB dans le cadre du projet CRM.