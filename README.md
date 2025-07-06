# 🚀 CRM Léger Temps Réel - NocoDB + Yjs + Hocuspocus

## 📊 Vue d'Ensemble

**CRM collaboratif léger** avec synchronisation temps réel pour auto-entrepreneurs et petites équipes.

- **Backend :** NocoDB + PostgreSQL pour la gestion des données
- **Frontend :** HTML/Tailwind + Vanilla JS (< 250kB gzip) 
- **Temps Réel :** Yjs + Hocuspocus pour collaboration live
- **Infrastructure :** Docker Compose + Coolify ready
- **Automatisation :** n8n intégré pour workflows futurs

---

## 🎯 Fonctionnalités

### **CRM Core**
- ✅ **Pipeline Kanban** : Lead → Qualified → Proposal → Won/Lost
- ✅ **Gestion Deals** : CRUD complet avec relations
- ✅ **Contacts & Companies** : Base de données relationnelle
- ✅ **Notes Collaboratives** : Édition temps réel multi-utilisateur
- ✅ **Analytics Pipeline** : Stats et prévisions automatiques

### **Collaboration Temps Réel** 
- ✅ **Drag-and-Drop Sync** : Position des cartes synchronisée
- ✅ **Présence Utilisateurs** : Curseurs et avatars en temps réel
- ✅ **Notes Partagées** : TipTap + CRDT pour édition collaborative
- ✅ **Conflict Resolution** : CRDT automatique sans merge conflicts

### **Architecture Robuste**
- ✅ **Offline-First** : Fonctionne hors ligne avec sync auto
- ✅ **Debug Ping-Pong** : Diagnostics intégrés pour résolution rapide
- ✅ **Scaling Ready** : Redis persistence + multi-instance
- ✅ **Security** : JWT, CORS, rate limiting intégrés

---

## 🛠️ Installation

### **Prérequis**
- Docker & Docker Compose
- 4 cœurs CPU, 6GB RAM minimum
- Ports disponibles : 80, 3001, 5432, 6379, 8080

### **Setup Rapide**

```bash
# 1. Cloner le projet
git clone <your-repo> crm-project
cd crm-project

# 2. Configuration environnement
cp .env.example .env
# Éditer .env avec vos paramètres

# 3. Démarrage des services
docker compose up -d

# 4. Vérification santé des services
./scripts/diagnostics.sh --quick

# 5. Accès applications
# CRM UI     : http://localhost
# NocoDB     : http://localhost:8080
# n8n (opt)  : http://localhost:5678
```

### **First Setup NocoDB**

```bash
# 1. Accéder NocoDB Admin : http://localhost:8080
# Email: admin@crm.local / Password: admin123

# 2. Créer nouveau projet "CRM"
# 3. Importer le schéma depuis PostgreSQL existant

# 4. Récupérer API token
# Settings > API Tokens > Create Token

# 5. Configurer le frontend
# Ouvrir http://localhost et configurer dans les settings
```

---

## 🏗️ Architecture

### **Stack Technique**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │  Collaboration  │
│                 │    │                 │    │                 │
│ • HTML/Tailwind │◄──►│ • NocoDB API    │◄──►│ • Hocuspocus    │
│ • Vanilla JS    │    │ • PostgreSQL    │    │ • Yjs CRDT      │
│ • SortableJS    │    │ • REST/GraphQL  │    │ • Redis Persist │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Infrastructure │
                    │                 │
                    │ • Docker        │
                    │ • Nginx Proxy   │
                    │ • Coolify Ready │
                    └─────────────────┘
```

### **Schéma Base de Données**

```sql
-- Tables principales CRM
companies (id, name, industry, website, size)
    ↓
contacts (id, name, email, phone, company_id, position)
    ↓  
deals (id, title, amount, status, company_id, contact_id, notes)
    ↓
activities (id, type, description, deal_id, contact_id)
```

### **Documents Yjs**

```javascript
// Structure des documents collaboratifs
crm:deal:{dealId} {
  data: Y.Map({
    title, amount, status, position, 
    assignee, priority, tags
  }),
  notes: Y.Text(), // Notes collaboratives
  activity: Y.Array() // Log activités temps réel
}
```

---

## 🎮 Utilisation

### **Interface Kanban**

```bash
# Navigation principale
- Drag & Drop deals entre colonnes
- Clic sur deal → Modal d'édition
- Notes collaboratives avec TipTap
- Présence utilisateurs en temps réel
- Stats pipeline automatiques
```

### **Configuration API**

```javascript
// Dans le navigateur (Console DevTools)
window.apiManager.configure({
  baseUrl: 'http://localhost:8080',
  apiKey: 'your_nocodb_api_key',
  projectId: 'your_project_id'
});

// Test de connexion
await window.apiManager.testConnection();

// Synchronisation complète
await window.apiManager.fullSync();
```

### **Debug Mode**

```javascript
// Activer le debug panel
localStorage.setItem('DEBUG', 'true');
window.enableDebug();

// Monitoring temps réel
window.realtimeManager.getStats();
window.apiManager.getMetrics();
```

---

## 🔧 Configuration

### **Variables d'Environnement (.env)**

```bash
# === BASE DE DONNÉES ===
NC_DB=pg://postgres:5432?u=crm_user&p=CHANGE_PASSWORD&d=crm_db
NC_AUTH_JWT_SECRET=CHANGE_THIS_SECRET_IN_PRODUCTION

# === SÉCURITÉ ===
NC_ADMIN_EMAIL=admin@votre-domaine.com  
NC_ADMIN_PASSWORD=CHANGE_STRONG_PASSWORD

# === URLS PUBLIQUES ===
NC_PUBLIC_URL=https://votre-crm.com
CORS_ORIGIN=https://votre-crm.com

# === PERFORMANCE ===
NC_LOG_LEVEL=info
LOG_LEVEL=info
NODE_ENV=production

# === N8N AUTOMATION (Optionnel) ===
N8N_USER=admin
N8N_PASSWORD=CHANGE_N8N_PASSWORD
WEBHOOK_URL=https://votre-crm.com/webhooks
```

### **Coolify Deployment**

```yaml
# coolify.yaml
version: '3.8'
services:
  web:
    image: nginx:alpine
    volumes:
      - ./ui:/usr/share/nginx/html
      - ./docker/nginx.conf:/etc/nginx/nginx.conf
    environment:
      - DOMAIN=${COOLIFY_FQDN}
  
  nocodb:
    image: nocodb/nocodb:latest
    environment:
      - NC_PUBLIC_URL=https://${COOLIFY_FQDN}
      - NC_DB=${DATABASE_URL}
  
  hocuspocus:
    build: ./docker/hocuspocus
    environment:
      - REDIS_URL=${REDIS_URL}
```

---

## 🐞 Debugging

### **Script Diagnostics**

```bash
# Diagnostic complet
./scripts/diagnostics.sh

# Diagnostic rapide (50 lignes logs)
./scripts/diagnostics.sh --quick

# Générer rapport HTML interactif
# → Crée diagnostics.tar.gz avec tout le nécessaire
```

### **Troubleshooting Courant**

| **Problème** | **Symptôme** | **Solution** |
|--------------|--------------|-------------|
| **NocoDB inaccessible** | Page blanche http://localhost:8080 | `docker compose logs nocodb` + vérifier PostgreSQL |
| **Temps réel non fonctionnel** | Pas de sync kanban | Vérifier WebSocket ws://localhost:3001 |
| **Données non sauvées** | Perte au refresh | Vérifier localStorage + API connection |
| **Performance lente** | Interface laggy | Réduire nombre de deals ou augmenter RAM |

### **Debug Ping-Pong**

```bash
# En cas d'erreur, générer rapport automatique :
./scripts/diagnostics.sh > rapport.txt

# Le rapport inclut :
# - Status de tous les services
# - Logs des 300 dernières lignes  
# - Métriques système
# - Configuration anonymisée
# - Template de bug report pré-rempli
```

---

## 📈 Performance & Scaling

### **Optimisations**

```javascript
// Frontend : Bundle size optimisé
- HTML/CSS : ~50KB
- JavaScript : ~180KB gzip
- Tailwind : CDN (pas compté)
- Total frontend : < 250KB ✅

// Backend : Performance NocoDB
- PostgreSQL avec indexes optimisés
- Redis cache pour sessions
- Nginx avec gzip + cache headers
```

### **Scaling Horizontal**

```yaml
# Multi-instance avec load balancer
version: '3.8'
services:
  nocodb:
    deploy:
      replicas: 3
    environment:
      - NC_REDIS_URL=redis://redis:6379
  
  hocuspocus:
    deploy:
      replicas: 2
    environment:
      - REDIS_HOST=redis # Shared state
```

---

## 🔒 Sécurité

### **Checklist Production**

- [ ] **Passwords** : Changer tous les mots de passe par défaut
- [ ] **JWT Secret** : Générer secret fort (32+ caractères)
- [ ] **CORS** : Configurer domaines autorisés
- [ ] **HTTPS** : Certificat SSL valide
- [ ] **Firewall** : Fermer ports non nécessaires (5432, 6379)
- [ ] **Backup** : Automatiser backup PostgreSQL
- [ ] **Monitoring** : Logs centralisés + alertes

### **Headers Sécurité (Nginx)**

```nginx
# Déjà configurés dans nginx.conf
add_header X-Frame-Options "SAMEORIGIN";
add_header X-XSS-Protection "1; mode=block";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "strict-origin-when-cross-origin";
```

---

## 🚀 Déploiement Production

### **Coolify (Recommandé)**

```bash
# 1. Créer projet dans Coolify
# 2. Git repository : votre-repo CRM
# 3. Environment variables : copier depuis .env
# 4. Domain : votre-domaine.com
# 5. Deploy → Automatic HTTPS + monitoring
```

### **Docker Swarm**

```bash
# 1. Init swarm
docker swarm init

# 2. Deploy stack
docker stack deploy -c docker-compose.prod.yml crm

# 3. Monitor
docker service ls
docker service logs crm_nocodb
```

### **Backup Strategy**

```bash
# Script backup automatique
#!/bin/bash
# Backup PostgreSQL
docker exec crm-postgres pg_dump -U crm_user crm_db > backup_$(date +%Y%m%d).sql

# Backup Redis (si persistence critique)
docker exec crm-redis redis-cli --rdb /data/backup.rdb

# Backup uploads NocoDB
docker cp crm-nocodb:/usr/app/data ./backups/nocodb_$(date +%Y%m%d)/
```

---

## 🤝 Contributeurs

### **Architecture**
- **Backend** : NocoDB API + PostgreSQL
- **Frontend** : HTML/Tailwind + Vanilla JS  
- **Temps Réel** : Yjs + Hocuspocus + Redis
- **Debug** : Ping-Pong methodology intégrée

### **Extensions Futures**
- Mobile PWA (service worker déjà préparé)
- Intégration email (n8n workflows)
- API externe (Zapier, webhooks)
- Analytics avancées (BI dashboard)

---

## 📞 Support

### **Documentation**
- [NocoDB Docs](https://docs.nocodb.com/)
- [Yjs Docs](https://docs.yjs.dev/)
- [Hocuspocus Docs](https://tiptap.dev/hocuspocus)

### **Debug Assistance**

```bash
# Générer rapport de bug automatique
./scripts/diagnostics.sh
# → Partager diagnostics.tar.gz pour assistance

# Logs temps réel
docker compose logs -f nocodb hocuspocus

# Métriques performance
curl http://localhost:8080/api/v1/health
curl http://localhost:3001/health
```

---

**🎯 Prêt pour production !** Pipeline Kanban temps réel en < 10 minutes de setup. 

**Debug Ping-Pong intégré** pour résolution rapide des incidents.

**Scaling horizontal ready** pour croissance future.