#!/bin/bash

# =======================================================
# SCRIPT DIAGNOSTIC SERVEUR CONTABO - COOLIFY + NOCODB
# =======================================================

SERVER_IP="89.117.61.193"
SERVER_USER="root"

echo "🔍 DIAGNOSTIC SERVEUR CONTABO - $SERVER_IP"
echo "=================================================="

# Fonction pour exécuter commandes SSH
run_ssh() {
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP "$1"
}

# Test connectivité
echo "📡 Test de connectivité..."
if ping -c 1 $SERVER_IP > /dev/null 2>&1; then
    echo "✅ Serveur accessible"
else
    echo "❌ Serveur inaccessible"
    exit 1
fi

echo ""
echo "🐳 ANALYSE DOCKER & COOLIFY"
echo "=============================="

# Status services principaux
echo "📋 Services Docker actifs:"
run_ssh "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'" || echo "❌ Erreur Docker"

echo ""
echo "🔍 Recherche NocoDB existant:"
run_ssh "docker ps | grep -i nocodb" || echo "ℹ️  Aucun container NocoDB trouvé"

echo ""
echo "🌐 ANALYSE RÉSEAU & PORTS"
echo "========================="

echo "📊 Ports utilisés (80, 443, 8080, 5432, 6379, 3001):"
run_ssh "netstat -tlnp 2>/dev/null | grep -E ':80 |:443 |:8080 |:5432 |:6379 |:3001 '" || echo "ℹ️  Pas de netstat ou ports libres"

echo ""
echo "🗂️  PROJETS COOLIFY"
echo "==================="

echo "📁 Applications Coolify:"
run_ssh "ls -la /var/lib/coolify/applications/ 2>/dev/null" || echo "ℹ️  Répertoire Coolify non trouvé"

echo ""
echo "📄 Configuration NocoDB existante:"
run_ssh "find /var/lib/coolify/applications -name 'docker-compose.yml' -exec grep -l 'nocodb' {} \; 2>/dev/null" || echo "ℹ️  Pas de config NocoDB trouvée"

echo ""
echo "💾 STOCKAGE & RESSOURCES"
echo "========================"

echo "💿 Espace disque:"
run_ssh "df -h | grep -E '/$|/var'" || echo "❌ Erreur espace disque"

echo ""
echo "🧠 Mémoire disponible:"
run_ssh "free -h" || echo "❌ Erreur mémoire"

echo ""
echo "🔧 COOLIFY STATUS"
echo "================="

echo "🚀 Status service Coolify:"
run_ssh "systemctl status coolify --no-pager -l" || echo "❌ Service Coolify non trouvé"

echo ""
echo "🌐 DOMAINES & DNS"
echo "================="

echo "🔗 Test accès Coolify dashboard:"
if curl -k -s --connect-timeout 5 https://$SERVER_IP:8000 > /dev/null; then
    echo "✅ Dashboard Coolify accessible sur https://$SERVER_IP:8000"
else
    echo "❌ Dashboard Coolify inaccessible"
fi

echo ""
echo "📋 RECOMMANDATIONS"
echo "=================="

# Analyse et recommandations
echo "Basé sur cette analyse:"

run_ssh "docker ps | grep -i nocodb" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "⚠️  NocoDB existant détecté - Utiliser ports alternatifs pour le CRM"
    echo "   → Ports recommandés: 8081 (NocoDB), 5433 (PostgreSQL), 6380 (Redis)"
else
    echo "✅ Aucun NocoDB existant - Ports standards disponibles"
    echo "   → Utiliser ports par défaut: 8080, 5432, 6379"
fi

echo ""
echo "🎯 PROCHAINES ÉTAPES:"
echo "1. Accéder dashboard: https://$SERVER_IP:8000"
echo "2. Créer nouveau projet avec configuration adaptée"
echo "3. Configurer DNS pour sous-domaine CRM"
echo "4. Déployer avec les ports recommandés ci-dessus"

echo ""
echo "==============================================="
echo "✅ Diagnostic terminé - $(date)"
echo "==============================================="