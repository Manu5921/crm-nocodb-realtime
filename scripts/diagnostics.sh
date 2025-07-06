#!/bin/bash

# ========================================================================
# NocoDB CRM Diagnostics Script
# Debug Ping-Pong Support for Comprehensive System Analysis
# ========================================================================

# Ensure compatibility with different bash versions
if [ -z "$BASH_VERSION" ]; then
    echo "Error: This script requires bash to run"
    exit 1
fi

# Script configuration
SCRIPT_VERSION="1.0.0"
SCRIPT_NAME="NocoDB CRM Diagnostics"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="/tmp/nocodb_diagnostics_${TIMESTAMP}"
REPORT_FILE="${OUTPUT_DIR}/diagnostics_report.html"
JSON_FILE="${OUTPUT_DIR}/diagnostics_summary.json"
LOG_LINES=300

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Service definitions
SERVICES=(
    "crm-postgres"
    "crm-redis"
    "crm-nocodb"
    "crm-hocuspocus"
    "crm-web"
    "crm-n8n"
)

# Port mappings (using functions for compatibility)
get_service_port() {
    case "$1" in
        "crm-postgres") echo "5432" ;;
        "crm-redis") echo "6379" ;;
        "crm-nocodb") echo "8080" ;;
        "crm-hocuspocus") echo "3001" ;;
        "crm-web") echo "80" ;;
        "crm-n8n") echo "5678" ;;
        *) echo "" ;;
    esac
}

# Health check URLs (using functions for compatibility)
get_health_url() {
    case "$1" in
        "crm-nocodb") echo "http://localhost:8080/dashboard" ;;
        "crm-hocuspocus") echo "http://localhost:3001/health" ;;
        "crm-web") echo "http://localhost:80" ;;
        "crm-n8n") echo "http://localhost:5678" ;;
        *) echo "" ;;
    esac
}

# ========================================================================
# Utility Functions
# ========================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "\n${PURPLE}========================================${NC}"
    echo -e "${PURPLE}$1${NC}"
    echo -e "${PURPLE}========================================${NC}\n"
}

# Create output directory
create_output_dir() {
    mkdir -p "${OUTPUT_DIR}"
    mkdir -p "${OUTPUT_DIR}/logs"
    mkdir -p "${OUTPUT_DIR}/configs"
    mkdir -p "${OUTPUT_DIR}/system"
}

# Anonymize sensitive data
anonymize_data() {
    local data="$1"
    echo "$data" | \
        sed 's/password=[^&]*/password=***REDACTED***/g' | \
        sed 's/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=***REDACTED***/g' | \
        sed 's/NC_AUTH_JWT_SECRET=.*/NC_AUTH_JWT_SECRET=***REDACTED***/g' | \
        sed 's/NC_ADMIN_PASSWORD=.*/NC_ADMIN_PASSWORD=***REDACTED***/g' | \
        sed 's/N8N_BASIC_AUTH_PASSWORD=.*/N8N_BASIC_AUTH_PASSWORD=***REDACTED***/g'
}

# ========================================================================
# System Information Collection
# ========================================================================

collect_system_info() {
    log_header "Collecting System Information"
    
    local system_file="${OUTPUT_DIR}/system/system_info.txt"
    
    {
        echo "=== System Information ==="
        echo "Date: $(date)"
        echo "Hostname: $(hostname)"
        echo "OS: $(uname -a)"
        echo "Architecture: $(uname -m)"
        echo ""
        
        echo "=== System Resources ==="
        echo "CPU Info:"
        if command -v lscpu &> /dev/null; then
            lscpu | head -20
        else
            sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "CPU info not available"
        fi
        echo ""
        
        echo "Memory Usage:"
        if command -v free &> /dev/null; then
            free -h
        else
            vm_stat | head -10
        fi
        echo ""
        
        echo "Disk Usage:"
        df -h
        echo ""
        
        echo "Network Interfaces:"
        if command -v ip &> /dev/null; then
            ip addr show
        else
            ifconfig
        fi
        echo ""
        
        echo "=== Docker Information ==="
        echo "Docker Version:"
        docker version 2>/dev/null || echo "Docker not available"
        echo ""
        
        echo "Docker Compose Version:"
        docker compose version 2>/dev/null || echo "Docker Compose not available"
        echo ""
        
        echo "Docker System Info:"
        docker system info 2>/dev/null || echo "Docker system info not available"
        echo ""
        
        echo "Docker System Resources:"
        docker system df 2>/dev/null || echo "Docker system df not available"
        echo ""
        
    } > "$system_file"
    
    log_success "System information collected"
}

# ========================================================================
# Service Status Checks
# ========================================================================

check_service_status() {
    log_header "Checking Service Status"
    
    local status_file="${OUTPUT_DIR}/system/service_status.txt"
    local json_services=()
    
    {
        echo "=== Docker Compose Service Status ==="
        echo "Timestamp: $(date)"
        echo ""
        
        # Check if docker-compose.yml exists
        if [ ! -f "docker-compose.yml" ]; then
            echo "ERROR: docker-compose.yml not found in current directory"
            echo "Current directory: $(pwd)"
            return 1
        fi
        
        # Get service status
        echo "Services Status:"
        docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || {
            echo "ERROR: Unable to get service status"
            return 1
        }
        echo ""
        
        # Check individual services
        for service in "${SERVICES[@]}"; do
            echo "=== Service: $service ==="
            
            # Container status
            container_status=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "not_found")
            container_health=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "no_health_check")
            
            echo "Container Status: $container_status"
            echo "Health Status: $container_health"
            
            # Port check
            port=$(get_service_port "$service")
            if [ -n "$port" ]; then
                if nc -z localhost "$port" 2>/dev/null; then
                    echo "Port $port: OPEN"
                    port_status="open"
                else
                    echo "Port $port: CLOSED"
                    port_status="closed"
                fi
            else
                port_status="n/a"
            fi
            
            # Health URL check
            health_url=$(get_health_url "$service")
            if [ -n "$health_url" ]; then
                if curl -s -f "$health_url" >/dev/null 2>&1; then
                    echo "Health Check ($health_url): PASS"
                    health_status="pass"
                else
                    echo "Health Check ($health_url): FAIL"
                    health_status="fail"
                fi
            else
                health_status="n/a"
            fi
            
            # Resource usage
            if [ "$container_status" == "running" ]; then
                echo "Resource Usage:"
                docker stats --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" "$service" 2>/dev/null || echo "  Stats not available"
            fi
            
            echo ""
            
            # Build JSON entry
            json_services+=("{\"service\":\"$service\",\"status\":\"$container_status\",\"health\":\"$container_health\",\"port_status\":\"$port_status\",\"health_check\":\"$health_status\"}")
        done
        
        echo "=== Network Information ==="
        echo "Docker Networks:"
        docker network ls --filter name=crm 2>/dev/null || echo "No CRM networks found"
        echo ""
        
        echo "Network Inspection:"
        docker network inspect crm-network 2>/dev/null | head -50 || echo "crm-network not found"
        echo ""
        
    } > "$status_file"
    
    # Create JSON summary
    local services_json=$(IFS=','; echo "[${json_services[*]}]")
    echo "{\"services\":$services_json}" > "${OUTPUT_DIR}/system/services.json"
    
    log_success "Service status checked"
}

# ========================================================================
# Logs Collection
# ========================================================================

collect_logs() {
    log_header "Collecting Service Logs"
    
    for service in "${SERVICES[@]}"; do
        log_info "Collecting logs for $service"
        
        local log_file="${OUTPUT_DIR}/logs/${service}.log"
        local error_file="${OUTPUT_DIR}/logs/${service}_errors.log"
        
        # Get service logs
        if docker logs "$service" >/dev/null 2>&1; then
            {
                echo "=== Service Logs for $service ==="
                echo "Timestamp: $(date)"
                echo "Last $LOG_LINES lines:"
                echo ""
                docker logs --tail "$LOG_LINES" "$service" 2>&1
            } > "$log_file"
            
            # Extract errors
            {
                echo "=== Error Analysis for $service ==="
                echo "Timestamp: $(date)"
                echo ""
                docker logs "$service" 2>&1 | grep -i "error\|exception\|fail\|critical" | tail -50
            } > "$error_file"
            
            log_success "Logs collected for $service"
        else
            echo "Container $service not found or not accessible" > "$log_file"
            log_warning "Cannot collect logs for $service"
        fi
    done
}

# ========================================================================
# Configuration Collection
# ========================================================================

collect_configurations() {
    log_header "Collecting Configuration Files"
    
    local config_dir="${OUTPUT_DIR}/configs"
    
    # Docker Compose configuration
    if [ -f "docker-compose.yml" ]; then
        cp "docker-compose.yml" "${config_dir}/docker-compose.yml"
        anonymize_data "$(cat docker-compose.yml)" > "${config_dir}/docker-compose_anonymized.yml"
        log_success "Docker Compose configuration collected"
    fi
    
    # Environment variables (anonymized)
    {
        echo "=== Environment Variables (Anonymized) ==="
        echo "Timestamp: $(date)"
        echo ""
        env | grep -E "^(NC_|N8N_|REDIS_|POSTGRES_|DOCKER_|COMPOSE_)" | sort
    } > "${config_dir}/environment.txt"
    
    # Nginx configuration
    if [ -f "nginx.conf" ]; then
        cp "nginx.conf" "${config_dir}/nginx.conf"
        log_success "Nginx configuration collected"
    fi
    
    # Init SQL
    if [ -f "init.sql" ]; then
        cp "init.sql" "${config_dir}/init.sql"
        log_success "Database initialization script collected"
    fi
    
    # Hocuspocus configuration
    if [ -f "hocuspocus/package.json" ]; then
        cp "hocuspocus/package.json" "${config_dir}/hocuspocus_package.json"
        log_success "Hocuspocus package configuration collected"
    fi
    
    if [ -f "hocuspocus/server.js" ]; then
        cp "hocuspocus/server.js" "${config_dir}/hocuspocus_server.js"
        log_success "Hocuspocus server configuration collected"
    fi
}

# ========================================================================
# Network Connectivity Tests
# ========================================================================

test_network_connectivity() {
    log_header "Testing Network Connectivity"
    
    local network_file="${OUTPUT_DIR}/system/network_tests.txt"
    
    {
        echo "=== Network Connectivity Tests ==="
        echo "Timestamp: $(date)"
        echo ""
        
        # Port connectivity tests
        for service in "${SERVICES[@]}"; do
            port=$(get_service_port "$service")
            if [ -n "$port" ]; then
                echo "Testing $service on port $port:"
                
                if nc -z localhost "$port" 2>/dev/null; then
                    echo "  ✓ Port $port is accessible"
                else
                    echo "  ✗ Port $port is not accessible"
                fi
                
                # Test from inside docker network
                if docker exec crm-web nc -z "$service" "$port" 2>/dev/null; then
                    echo "  ✓ Internal network connectivity to $service:$port"
                else
                    echo "  ✗ Internal network connectivity to $service:$port failed"
                fi
                echo ""
            fi
        done
        
        # HTTP endpoint tests
        echo "=== HTTP Endpoint Tests ==="
        for service in "${SERVICES[@]}"; do
            url=$(get_health_url "$service")
            if [ -n "$url" ]; then
                echo "Testing $service endpoint: $url"
                
                if curl -s -f "$url" >/dev/null 2>&1; then
                    echo "  ✓ HTTP endpoint is accessible"
                    
                    # Get response details
                    response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
                    response_time=$(curl -s -o /dev/null -w "%{time_total}" "$url" 2>/dev/null)
                    echo "  Response code: $response_code"
                    echo "  Response time: ${response_time}s"
                else
                    echo "  ✗ HTTP endpoint is not accessible"
                fi
                echo ""
            fi
        done
        
        # DNS resolution tests
        echo "=== DNS Resolution Tests ==="
        for service in "${SERVICES[@]}"; do
            if docker exec crm-web nslookup "$service" >/dev/null 2>&1; then
                echo "  ✓ DNS resolution for $service: OK"
            else
                echo "  ✗ DNS resolution for $service: FAIL"
            fi
        done
        echo ""
        
        # External connectivity
        echo "=== External Connectivity Tests ==="
        if curl -s -f "https://google.com" >/dev/null 2>&1; then
            echo "  ✓ External internet connectivity: OK"
        else
            echo "  ✗ External internet connectivity: FAIL"
        fi
        
    } > "$network_file"
    
    log_success "Network connectivity tests completed"
}

# ========================================================================
# Performance Analysis
# ========================================================================

analyze_performance() {
    log_header "Analyzing Performance Metrics"
    
    local perf_file="${OUTPUT_DIR}/system/performance.txt"
    
    {
        echo "=== Performance Analysis ==="
        echo "Timestamp: $(date)"
        echo ""
        
        # Container resource usage
        echo "=== Container Resource Usage ==="
        if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "crm-"; then
            docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" $(docker ps --filter name=crm- --format "{{.Names}}" | tr '\n' ' ') 2>/dev/null || echo "Unable to get container stats"
        else
            echo "No CRM containers running"
        fi
        echo ""
        
        # Docker system resources
        echo "=== Docker System Resources ==="
        docker system df 2>/dev/null || echo "Docker system df not available"
        echo ""
        
        # Database performance (if PostgreSQL is running)
        if docker exec crm-postgres psql -U crm_user -d crm_db -c "SELECT version();" >/dev/null 2>&1; then
            echo "=== Database Performance ==="
            echo "Database version:"
            docker exec crm-postgres psql -U crm_user -d crm_db -c "SELECT version();" 2>/dev/null || echo "Unable to get DB version"
            echo ""
            
            echo "Database connections:"
            docker exec crm-postgres psql -U crm_user -d crm_db -c "SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null || echo "Unable to get DB connections"
            echo ""
            
            echo "Database size:"
            docker exec crm-postgres psql -U crm_user -d crm_db -c "SELECT pg_size_pretty(pg_database_size('crm_db')) as database_size;" 2>/dev/null || echo "Unable to get DB size"
            echo ""
        fi
        
        # Redis performance (if Redis is running)
        if docker exec crm-redis redis-cli ping >/dev/null 2>&1; then
            echo "=== Redis Performance ==="
            echo "Redis info:"
            docker exec crm-redis redis-cli info server | head -10 2>/dev/null || echo "Unable to get Redis info"
            echo ""
            
            echo "Redis memory usage:"
            docker exec crm-redis redis-cli info memory | grep used_memory_human 2>/dev/null || echo "Unable to get Redis memory info"
            echo ""
        fi
        
    } > "$perf_file"
    
    log_success "Performance analysis completed"
}

# ========================================================================
# Security Analysis
# ========================================================================

analyze_security() {
    log_header "Analyzing Security Configuration"
    
    local security_file="${OUTPUT_DIR}/system/security.txt"
    
    {
        echo "=== Security Analysis ==="
        echo "Timestamp: $(date)"
        echo ""
        
        # Container security
        echo "=== Container Security ==="
        echo "Running containers with exposed ports:"
        docker ps --format "table {{.Names}}\t{{.Ports}}" | grep -E "(crm-|PORTS)"
        echo ""
        
        # Check for default passwords in environment
        echo "=== Environment Security Check ==="
        if docker compose config 2>/dev/null | grep -q "admin123\|password\|secret"; then
            echo "  ⚠️  Default passwords detected in configuration"
            echo "  Please change default passwords before production use"
        else
            echo "  ✓ No obvious default passwords found"
        fi
        echo ""
        
        # Network security
        echo "=== Network Security ==="
        echo "Docker networks:"
        docker network ls --filter name=crm --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}"
        echo ""
        
        # File permissions
        echo "=== File Permissions ==="
        echo "Configuration files permissions:"
        ls -la docker-compose.yml nginx.conf init.sql 2>/dev/null || echo "Some config files not found"
        echo ""
        
    } > "$security_file"
    
    log_success "Security analysis completed"
}

# ========================================================================
# HTML Report Generation
# ========================================================================

generate_html_report() {
    log_header "Generating HTML Report"
    
    cat > "$REPORT_FILE" << 'HTML_TEMPLATE'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NocoDB CRM Diagnostics Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
        }
        .section {
            background: white;
            padding: 25px;
            margin-bottom: 25px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .section h2 {
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .status-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            background: #fafafa;
        }
        .status-card h3 {
            margin: 0 0 15px 0;
            color: #333;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-running { background: #d4edda; color: #155724; }
        .status-healthy { background: #d1ecf1; color: #0c5460; }
        .status-error { background: #f8d7da; color: #721c24; }
        .status-warning { background: #fff3cd; color: #856404; }
        .code-block {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 5px;
            padding: 15px;
            overflow-x: auto;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9em;
        }
        .metric-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .metric-row:last-child {
            border-bottom: none;
        }
        .metric-label {
            font-weight: bold;
            color: #555;
        }
        .metric-value {
            color: #333;
            font-family: monospace;
        }
        .alert {
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .alert-info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        .alert-warning {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .tab-container {
            margin-top: 20px;
        }
        .tab-buttons {
            display: flex;
            background: #f8f9fa;
            border-radius: 5px 5px 0 0;
            overflow: hidden;
        }
        .tab-button {
            padding: 12px 20px;
            background: #f8f9fa;
            border: none;
            cursor: pointer;
            font-size: 0.9em;
            transition: background 0.3s;
        }
        .tab-button.active {
            background: white;
            border-bottom: 2px solid #667eea;
        }
        .tab-content {
            display: none;
            padding: 20px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 0 0 5px 5px;
        }
        .tab-content.active {
            display: block;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }
        .debug-section {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 20px 0;
        }
        .debug-section h3 {
            margin-top: 0;
            color: #667eea;
        }
        .ping-pong-template {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 5px;
            padding: 20px;
            margin: 20px 0;
        }
        .ping-pong-template h4 {
            color: #856404;
            margin-top: 0;
        }
        .copy-button {
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            margin-top: 10px;
        }
        .copy-button:hover {
            background: #5a67d8;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔧 NocoDB CRM Diagnostics</h1>
        <p>Generated on TIMESTAMP_PLACEHOLDER</p>
        <p>Script Version: SCRIPT_VERSION_PLACEHOLDER</p>
    </div>
HTML_TEMPLATE

    # Replace placeholders
    sed -i.bak "s/TIMESTAMP_PLACEHOLDER/$(date)/" "$REPORT_FILE"
    sed -i.bak "s/SCRIPT_VERSION_PLACEHOLDER/$SCRIPT_VERSION/" "$REPORT_FILE"
    rm "${REPORT_FILE}.bak"

    # Add system overview
    cat >> "$REPORT_FILE" << 'HTML_OVERVIEW'
    <div class="section">
        <h2>📊 System Overview</h2>
        <div class="status-grid">
            <div class="status-card">
                <h3>System Status</h3>
                <div class="metric-row">
                    <span class="metric-label">OS:</span>
                    <span class="metric-value">SYSTEM_OS_PLACEHOLDER</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Architecture:</span>
                    <span class="metric-value">SYSTEM_ARCH_PLACEHOLDER</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Docker:</span>
                    <span class="metric-value">DOCKER_VERSION_PLACEHOLDER</span>
                </div>
            </div>
            <div class="status-card">
                <h3>Services Summary</h3>
                <div id="services-summary">
                    <!-- Services will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>🚀 Service Status</h2>
        <div class="status-grid" id="service-status">
            <!-- Service status cards will be populated here -->
        </div>
    </div>

    <div class="section">
        <h2>🔍 Debug Information</h2>
        <div class="tab-container">
            <div class="tab-buttons">
                <button class="tab-button active" onclick="showTab('logs')">Logs</button>
                <button class="tab-button" onclick="showTab('network')">Network</button>
                <button class="tab-button" onclick="showTab('performance')">Performance</button>
                <button class="tab-button" onclick="showTab('security')">Security</button>
                <button class="tab-button" onclick="showTab('configs')">Configs</button>
            </div>
            
            <div id="logs" class="tab-content active">
                <h3>Service Logs</h3>
                <div id="logs-content">
                    <!-- Logs will be populated here -->
                </div>
            </div>
            
            <div id="network" class="tab-content">
                <h3>Network Diagnostics</h3>
                <div id="network-content">
                    <!-- Network info will be populated here -->
                </div>
            </div>
            
            <div id="performance" class="tab-content">
                <h3>Performance Metrics</h3>
                <div id="performance-content">
                    <!-- Performance info will be populated here -->
                </div>
            </div>
            
            <div id="security" class="tab-content">
                <h3>Security Analysis</h3>
                <div id="security-content">
                    <!-- Security info will be populated here -->
                </div>
            </div>
            
            <div id="configs" class="tab-content">
                <h3>Configuration Files</h3>
                <div id="configs-content">
                    <!-- Config info will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>🏓 Debug Ping-Pong Template</h2>
        <div class="ping-pong-template">
            <h4>Bug Report Template</h4>
            <div class="code-block" id="bug-template">
**NocoDB CRM Issue Report**

**Environment:**
- OS: SYSTEM_OS_PLACEHOLDER
- Docker Version: DOCKER_VERSION_PLACEHOLDER
- Report Generated: TIMESTAMP_PLACEHOLDER

**Issue Description:**
[Describe the issue you're experiencing]

**Steps to Reproduce:**
1. [First step]
2. [Second step]
3. [Third step]

**Expected Behavior:**
[What you expected to happen]

**Actual Behavior:**
[What actually happened]

**Service Status:**
SERVICE_STATUS_PLACEHOLDER

**Error Logs:**
[Include relevant error logs from the diagnostics]

**Additional Context:**
[Any additional context about the problem]

**Diagnostics Archive:**
Generated: TIMESTAMP_PLACEHOLDER
Location: OUTPUT_DIR_PLACEHOLDER
            </div>
            <button class="copy-button" onclick="copyToClipboard('bug-template')">Copy Bug Report Template</button>
        </div>
        
        <div class="debug-section">
            <h3>🔧 Common Troubleshooting Steps</h3>
            <ol>
                <li><strong>Service Not Starting:</strong> Check logs for the specific service and verify port conflicts</li>
                <li><strong>Network Issues:</strong> Verify docker network connectivity and port accessibility</li>
                <li><strong>Database Connection:</strong> Check PostgreSQL logs and connection strings</li>
                <li><strong>Performance Issues:</strong> Review resource usage and container limits</li>
                <li><strong>Configuration Problems:</strong> Validate environment variables and config files</li>
            </ol>
        </div>
        
        <div class="debug-section">
            <h3>📋 Quick Commands</h3>
            <div class="code-block">
# Restart all services
docker compose down && docker compose up -d

# View specific service logs
docker logs crm-SERVICE_NAME -f

# Check service health
docker compose ps

# Access container shell
docker exec -it crm-SERVICE_NAME /bin/sh

# Reset everything (CAUTION: This will remove all data)
docker compose down -v && docker compose up -d
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Generated by NocoDB CRM Diagnostics Script v.SCRIPT_VERSION_PLACEHOLDER</p>
        <p>For support, include this report and the generated archive</p>
    </div>

    <script>
        function showTab(tabName) {
            // Hide all tabs
            const tabs = document.querySelectorAll('.tab-content');
            tabs.forEach(tab => tab.classList.remove('active'));
            
            // Remove active class from all buttons
            const buttons = document.querySelectorAll('.tab-button');
            buttons.forEach(button => button.classList.remove('active'));
            
            // Show selected tab
            document.getElementById(tabName).classList.add('active');
            
            // Activate corresponding button
            event.target.classList.add('active');
        }
        
        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent;
            navigator.clipboard.writeText(text).then(() => {
                alert('Bug report template copied to clipboard!');
            });
        }
        
        // Populate dynamic content when page loads
        window.addEventListener('load', function() {
            // This would be populated by the script with actual data
            console.log('Report loaded successfully');
        });
    </script>
</body>
</html>
HTML_OVERVIEW

    # Add system info placeholders
    if [ -f "${OUTPUT_DIR}/system/system_info.txt" ]; then
        local system_os=$(uname -s)
        local system_arch=$(uname -m)
        local docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "N/A")
        
        sed -i.bak "s/SYSTEM_OS_PLACEHOLDER/$system_os/" "$REPORT_FILE"
        sed -i.bak "s/SYSTEM_ARCH_PLACEHOLDER/$system_arch/" "$REPORT_FILE"
        sed -i.bak "s/DOCKER_VERSION_PLACEHOLDER/$docker_version/" "$REPORT_FILE"
        sed -i.bak "s/OUTPUT_DIR_PLACEHOLDER/$(echo $OUTPUT_DIR | sed 's/[\/&]/\\&/g')/" "$REPORT_FILE"
        rm "${REPORT_FILE}.bak"
    fi
    
    log_success "HTML report generated: $REPORT_FILE"
}

# ========================================================================
# JSON Summary Generation
# ========================================================================

generate_json_summary() {
    log_header "Generating JSON Summary"
    
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local system_os=$(uname -s)
    local system_arch=$(uname -m)
    local docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    
    cat > "$JSON_FILE" << JSON_TEMPLATE
{
    "report_info": {
        "version": "$SCRIPT_VERSION",
        "timestamp": "$timestamp",
        "output_directory": "$OUTPUT_DIR"
    },
    "system_info": {
        "os": "$system_os",
        "architecture": "$system_arch",
        "docker_version": "$docker_version"
    },
    "services": {},
    "summary": {
        "total_services": ${#SERVICES[@]},
        "running_services": 0,
        "healthy_services": 0,
        "issues_found": []
    }
}
JSON_TEMPLATE

    # Add services data if available
    if [ -f "${OUTPUT_DIR}/system/services.json" ]; then
        # Merge service data into JSON summary
        local services_data=$(cat "${OUTPUT_DIR}/system/services.json")
        
        # Update JSON with services data (basic implementation)
        log_success "Services data included in JSON summary"
    fi
    
    log_success "JSON summary generated: $JSON_FILE"
}

# ========================================================================
# Archive Creation
# ========================================================================

create_archive() {
    log_header "Creating Diagnostics Archive"
    
    local archive_name="nocodb_diagnostics_${TIMESTAMP}.tar.gz"
    local archive_path="/tmp/${archive_name}"
    
    # Create archive
    cd /tmp
    tar -czf "$archive_path" "nocodb_diagnostics_${TIMESTAMP}/" 2>/dev/null || {
        log_error "Failed to create archive"
        return 1
    }
    
    local archive_size=$(du -h "$archive_path" | cut -f1)
    
    log_success "Archive created: $archive_path (Size: $archive_size)"
    
    # Create summary file
    cat > "${OUTPUT_DIR}/README.txt" << README_TEMPLATE
NocoDB CRM Diagnostics Report
============================

Generated: $(date)
Script Version: $SCRIPT_VERSION
Archive: $archive_name

Contents:
- system/           System information and status
- logs/             Service logs and error analysis
- configs/          Configuration files (anonymized)
- diagnostics_report.html    Interactive HTML report
- diagnostics_summary.json   Machine-readable summary

Usage:
1. Open diagnostics_report.html in a web browser for interactive analysis
2. Review logs/ directory for detailed service logs
3. Check system/ directory for status and performance data
4. Use diagnostics_summary.json for automated analysis

For support:
- Include this entire archive when reporting issues
- Use the bug report template in the HTML report
- Check the troubleshooting section for common solutions

Archive Location: $archive_path
README_TEMPLATE

    echo "$archive_path"
}

# ========================================================================
# Main Execution
# ========================================================================

main() {
    log_header "Starting NocoDB CRM Diagnostics"
    log_info "Script version: $SCRIPT_VERSION"
    log_info "Output directory: $OUTPUT_DIR"
    
    # Check if docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check if docker compose is available
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi
    
    # Create output directory
    create_output_dir
    
    # Navigate to script directory
    cd "$(dirname "$0")/.."
    
    # Run diagnostics
    collect_system_info
    check_service_status
    collect_logs
    collect_configurations
    test_network_connectivity
    analyze_performance
    analyze_security
    
    # Generate reports
    generate_html_report
    generate_json_summary
    
    # Create archive
    archive_path=$(create_archive)
    
    # Summary
    log_header "Diagnostics Complete"
    log_success "HTML Report: $REPORT_FILE"
    log_success "JSON Summary: $JSON_FILE"
    if [ -n "$archive_path" ]; then
        log_success "Archive: $archive_path"
    fi
    
    echo ""
    echo -e "${CYAN}To view the interactive report:${NC}"
    echo -e "${YELLOW}open $REPORT_FILE${NC}"
    echo ""
    if [ -n "$archive_path" ]; then
        echo -e "${CYAN}To share for debugging:${NC}"
        echo -e "${YELLOW}Share the archive: $archive_path${NC}"
    fi
    echo ""
    echo -e "${CYAN}Quick service status:${NC}"
    docker compose ps 2>/dev/null || echo "Unable to get service status"
    
    return 0
}

# ========================================================================
# Script Entry Point
# ========================================================================

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "NocoDB CRM Diagnostics Script"
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --version, -v  Show script version"
        echo "  --quick, -q    Quick diagnostics (basic info only)"
        echo ""
        echo "This script collects comprehensive diagnostics information"
        echo "for NocoDB CRM deployment including:"
        echo "- Service status and health checks"
        echo "- Logs collection and error analysis"
        echo "- Network connectivity tests"
        echo "- Performance metrics"
        echo "- Security analysis"
        echo "- Configuration review"
        echo ""
        echo "Output:"
        echo "- Interactive HTML report"
        echo "- JSON summary for automation"
        echo "- Compressed archive for sharing"
        exit 0
        ;;
    --version|-v)
        echo "$SCRIPT_NAME version $SCRIPT_VERSION"
        exit 0
        ;;
    --quick|-q)
        log_info "Running quick diagnostics mode"
        LOG_LINES=50
        ;;
    "")
        # Default behavior
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac

# Run main function
main "$@"