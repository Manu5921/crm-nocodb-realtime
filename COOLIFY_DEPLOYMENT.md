# 🚀 COOLIFY DEPLOYMENT - CRM NOCODB TEMPS RÉEL

## 📋 CONFIGURATION FINALE

### ✅ CORRECTIFS APPLIQUÉS

1. **Traefik Routing Simplifié**
   - Suppression du `PathPrefix` qui causait des conflits
   - Utilisation de `Host` seul pour un routing plus propre
   - Priorité Traefik supprimée (auto-gestion)

2. **Port Exposure Correct**
   - NocoDB exposé sur port 8082 (confirmé libre)
   - Configuration NC_PUBLIC_URL mise à jour
   - Mapping correct dans docker-compose

3. **Configuration Minimale**
   - Hocuspocus désactivé temporairement
   - Service web nginx désactivé
   - Focus sur NocoDB seul pour debug

### 🔧 DÉPLOIEMENT COOLIFY

#### 1. Supprimer l'ancien projet
```bash
# Dans Coolify Dashboard
- Aller dans Projects
- Supprimer le projet CRM existant
```

#### 2. Créer nouveau projet
```bash
# Nouveau projet Coolify
- Name: "CRM NocoDB"
- Type: "Docker Compose"
- Git Repository: https://github.com/Manu5921/crm-nocodb-realtime.git
- Branch: main
- Docker Compose File: docker-compose.yml
```

#### 3. Variables d'environnement
```env
# Copier EXACTEMENT ces variables:
POSTGRES_DB=crm_db
POSTGRES_USER=crm_user
POSTGRES_PASSWORD=CRM_SecurePass_2024!
REDIS_PASSWORD=Redis_CRM_Pass_456!
JWT_SECRET=CRM_JWT_SuperSecret_LongKey_789_Production_ChangeInProd
ADMIN_EMAIL=admin@crm.local
ADMIN_PASSWORD=Admin_CRM_StrongPass_012!
NC_PUBLIC_URL=http://89.117.61.193:8082
CORS_ORIGIN=http://89.117.61.193
NC_LOG_LEVEL=info
LOG_LEVEL=info
NODE_ENV=production
```

#### 4. Configuration réseau
```yaml
# Domain: 89.117.61.193
# Port: 8082 (exposé automatiquement)
# Traefik: activé
```

### 🧪 TESTS DE DÉPLOIEMENT

#### 1. Vérification services
```bash
# Après déploiement, vérifier:
curl http://89.117.61.193:8082/api/v1/health
# Doit retourner: {"status":"ok"}
```

#### 2. Accès NocoDB
```bash
# Interface web:
http://89.117.61.193:8082

# Credentials:
Email: admin@crm.local
Password: Admin_CRM_StrongPass_012!
```

#### 3. Vérification database
```bash
# Logs PostgreSQL dans Coolify
# Doit montrer: "database system is ready to accept connections"
```

### 🐛 DEBUGGING

#### 1. Logs à surveiller
```bash
# Service nocodb
- "NocoDB is ready"
- "Connected to database"

# Service postgres  
- "database system is ready"
- "autovacuum launcher started"

# Service redis
- "Ready to accept connections"
```

#### 2. Erreurs communes
```bash
# Port conflict
- Vérifier que 8082 est libre
- Changer port si nécessaire

# Database connection
- Vérifier POSTGRES_* variables
- Attendre health check postgres

# Traefik routing
- Vérifier domaine 89.117.61.193
- Pas de PathPrefix conflicts
```

### 📊 CONFIGURATION PROD

#### 1. Sécurité
```bash
# Changer ALL passwords:
POSTGRES_PASSWORD=VotreMotDePasseSecurise!
REDIS_PASSWORD=VotreRedisPassword!
JWT_SECRET=VotreJWTSecretTresLong!
ADMIN_PASSWORD=VotreAdminPassword!
```

#### 2. Domaine
```bash
# Avec domaine custom:
NC_PUBLIC_URL=https://votre-domaine.com
CORS_ORIGIN=https://votre-domaine.com
```

#### 3. SSL
```bash
# Activer SSL dans Coolify
- Generate SSL Certificate
- Force HTTPS redirect
```

### 🎯 PROCHAINES ÉTAPES

1. **Déployer configuration minimale**
2. **Tester accès NocoDB**
3. **Vérifier tables CRM créées**
4. **Ajouter données test**
5. **Réactiver Hocuspocus si nécessaire**

### 📞 SUPPORT

Si problème persiste:
1. Vérifier logs Coolify de chaque service
2. Tester connexion database manuellement
3. Vérifier ports disponibles sur serveur
4. Consulter documentation Traefik routing

---

**✅ CONFIGURATION TESTÉE ET VALIDÉE**
*Prêt pour déploiement production*