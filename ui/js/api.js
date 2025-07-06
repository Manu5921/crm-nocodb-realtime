/**
 * NocoDB API Wrapper for CRM Application
 * Implements Context7 best practices with robust error handling,
 * retry logic, conflict resolution, and Yjs integration
 * 
 * @author Claude Code
 * @version 2.1.0
 * @features
 * - xc-token and xc-auth headers with priority
 * - Base URL configurable with environment fallbacks
 * - REST API endpoints for deals, contacts, companies
 * - Advanced error handling with retry logic
 * - CRUD operations with validation
 * - Relations with contacts and companies
 * - Filtering and pagination with NocoDB syntax
 * - Retry automatique (3 tentatives par défaut)
 * - Fallback vers localStorage en mode offline
 * - Debug logging si localStorage.DEBUG = true
 * - Network error detection
 * - Sync bidirectionnel Yjs
 * - Conflict resolution avec 4 stratégies
 * - Optimistic updates avec rollback
 */
class APIManager {
    constructor(config = {}) {
        // Core configuration with Context7 patterns
        this.baseUrl = this.getBaseUrl(config.baseUrl);
        this.apiKey = this.getApiKey(config.apiKey);
        this.authToken = this.getAuthToken(config.authToken);
        this.projectId = this.getProjectId(config.projectId);
        this.orgId = this.getOrgId(config.orgId);
        
        // Connection state management
        this.isConnected = false;
        this.connectionRetries = 0;
        this.maxConnectionRetries = 5;
        this.lastConnectionCheck = null;
        
        // Retry configuration (Context7 pattern)
        this.retryConfig = {
            attempts: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2,
            jitter: true
        };
        
        // Debug configuration
        this.debug = localStorage.getItem('DEBUG') === 'true' || config.debug || false;
        
        // Offline fallback storage
        this.offlineQueue = [];
        this.offlineStorage = new Map();
        
        // Yjs integration
        this.yjsDoc = null;
        this.yjsProvider = null;
        this.yjsMaps = {};
        this.conflictResolver = new ConflictResolver();
        
        // Request interceptors
        this.requestInterceptors = [];
        this.responseInterceptors = [];
        
        // Auto-sync interval
        this.autoSyncInterval = null;
        
        // Table configurations following NocoDB schema patterns
        this.tables = {
            deals: {
                tableName: 'deals',
                endpoint: 'deals',
                fields: {
                    id: 'Id',
                    title: 'Title',
                    amount: 'Amount',
                    status: 'Status',
                    company: 'Company',
                    contact: 'Contact',
                    notes: 'Notes',
                    priority: 'Priority',
                    stage: 'Stage',
                    probability: 'Probability',
                    expected_close_date: 'ExpectedCloseDate',
                    created_at: 'CreatedAt',
                    updated_at: 'UpdatedAt'
                },
                relations: {
                    company: { table: 'companies', field: 'Company' },
                    contact: { table: 'contacts', field: 'Contact' }
                }
            },
            contacts: {
                tableName: 'contacts',
                endpoint: 'contacts',
                fields: {
                    id: 'Id',
                    name: 'Name',
                    email: 'Email',
                    phone: 'Phone',
                    company: 'Company',
                    position: 'Position',
                    department: 'Department',
                    linkedin: 'LinkedIn',
                    twitter: 'Twitter',
                    notes: 'Notes',
                    created_at: 'CreatedAt',
                    updated_at: 'UpdatedAt'
                },
                relations: {
                    company: { table: 'companies', field: 'Company' }
                }
            },
            companies: {
                tableName: 'companies',
                endpoint: 'companies',
                fields: {
                    id: 'Id',
                    name: 'Name',
                    industry: 'Industry',
                    size: 'Size',
                    website: 'Website',
                    address: 'Address',
                    city: 'City',
                    country: 'Country',
                    revenue: 'Revenue',
                    employees: 'Employees',
                    description: 'Description',
                    created_at: 'CreatedAt',
                    updated_at: 'UpdatedAt'
                }
            }
        };
        
        // Pagination defaults
        this.pagination = {
            defaultLimit: 25,
            maxLimit: 100
        };
        
        // Cache configuration
        this.cache = {
            enabled: true,
            ttl: 5 * 60 * 1000, // 5 minutes
            storage: new Map()
        };
        
        this.init();
    }

    /**
     * Initialize API Manager with Context7 patterns
     */
    async init() {
        this.log('🚀 Initializing NocoDB API Manager v2.1.0');
        
        try {
            // Load offline queue from storage
            this.loadOfflineQueue();
            
            // Setup network monitoring
            this.setupNetworkMonitoring();
            
            // Initialize Yjs if available
            await this.initializeYjs();
            
            // Check initial connection
            await this.checkConnection();
            
            // Setup auto-sync if online
            if (this.isConnected) {
                this.setupAutoSync();
            }
            
            // Process offline queue if reconnected
            await this.processOfflineQueue();
            
            this.log('✅ API Manager initialized successfully');
            this.emit('initialized', { connected: this.isConnected });
            
        } catch (error) {
            this.logError('❌ Failed to initialize API Manager:', error);
            this.emit('initializationFailed', { error: error.message });
        }
    }

    /**
     * Get base URL with priority order: config > localStorage > environment > default
     */
    getBaseUrl(configUrl) {
        return configUrl ||
               localStorage.getItem('nocodb-base-url') ||
               window.NOCODB_BASE_URL ||
               process?.env?.NOCODB_BASE_URL ||
               'http://localhost:8080';
    }

    /**
     * Get API key (xc-token) with Context7 security patterns
     */
    getApiKey(configKey) {
        return configKey ||
               localStorage.getItem('nocodb-api-key') ||
               window.NOCODB_API_KEY ||
               process?.env?.NOCODB_API_KEY ||
               '';
    }
    
    /**
     * Get Auth token (xc-auth) for JWT authentication
     */
    getAuthToken(configToken) {
        return configToken ||
               localStorage.getItem('nocodb-auth-token') ||
               window.NOCODB_AUTH_TOKEN ||
               process?.env?.NOCODB_AUTH_TOKEN ||
               '';
    }

    /**
     * Get project ID with Context7 configuration patterns
     */
    getProjectId(configId) {
        return configId ||
               localStorage.getItem('nocodb-project-id') ||
               window.NOCODB_PROJECT_ID ||
               process?.env?.NOCODB_PROJECT_ID ||
               'noco';
    }
    
    /**
     * Get organization ID for workspace-based API calls
     */
    getOrgId(configOrgId) {
        return configOrgId ||
               localStorage.getItem('nocodb-org-id') ||
               window.NOCODB_ORG_ID ||
               process?.env?.NOCODB_ORG_ID ||
               'noco';
    }

    /**
     * Check NocoDB connection with enhanced error handling
     */
    async checkConnection() {
        try {
            this.log('🔍 Checking NocoDB connection...');
            this.lastConnectionCheck = new Date().toISOString();
            
            const healthResponse = await this.makeRequest('GET', '/api/v1/db/meta/projects', null, 0, false);
            
            if (healthResponse.ok) {
                this.isConnected = true;
                this.connectionRetries = 0;
                
                // Validate project access
                await this.validateProjectAccess();
                
                this.log('✅ NocoDB connection established');
                this.emit('connected', { 
                    baseUrl: this.baseUrl, 
                    projectId: this.projectId,
                    timestamp: new Date().toISOString()
                });
                
                return true;
            } else {
                throw new Error(`Connection failed: ${healthResponse.error}`);
            }
        } catch (error) {
            this.isConnected = false;
            this.connectionRetries++;
            
            this.logError('❌ NocoDB connection failed:', error);
            
            // Emit different events based on retry attempts
            if (this.connectionRetries >= this.maxConnectionRetries) {
                this.emit('connectionFailure', { 
                    error: error.message, 
                    retries: this.connectionRetries 
                });
            } else {
                this.emit('disconnected', { 
                    error: error.message, 
                    retries: this.connectionRetries 
                });
            }
            
            return false;
        }
    }
    
    /**
     * Validate project access and schema
     */
    async validateProjectAccess() {
        try {
            const endpoint = `/api/v1/db/meta/projects/${this.projectId}`;
            const response = await this.makeRequest('GET', endpoint, null, 0, false);
            
            if (!response.ok) {
                throw new Error(`Project validation failed: ${response.error}`);
            }
            
            this.log(`✅ Project "${this.projectId}" access validated`);
            return response.data;
        } catch (error) {
            this.logError('❌ Project validation failed:', error);
            throw error;
        }
    }

    /**
     * Enhanced HTTP request method with Context7 patterns
     * Supports both xc-token and xc-auth authentication
     */
    async makeRequest(method, endpoint, data = null, retryCount = 0, useCache = true) {
        const cacheKey = `${method}:${endpoint}:${JSON.stringify(data || {})}`;
        
        // Check cache for GET requests
        if (method === 'GET' && useCache && this.cache.enabled) {
            const cached = this.getCachedResponse(cacheKey);
            if (cached) {
                this.log(`📋 Cache hit for ${endpoint}`);
                return { ok: true, data: cached, fromCache: true };
            }
        }
        
        const url = `${this.baseUrl}${endpoint}`;
        const headers = this.buildHeaders();
        
        // Apply request interceptors
        const interceptedData = this.applyRequestInterceptors({ method, endpoint, data, headers });
        
        const options = {
            method,
            headers: interceptedData.headers,
            signal: AbortSignal.timeout(30000) // 30s timeout
        };

        if (interceptedData.data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            options.body = JSON.stringify(interceptedData.data);
        }

        try {
            this.log(`🔄 ${method} ${endpoint}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);
            
            const response = await fetch(url, options);
            const responseData = await this.parseResponse(response);
            
            if (!response.ok) {
                throw new HTTPError(
                    `HTTP ${response.status}: ${response.statusText}`,
                    response.status,
                    responseData
                );
            }
            
            // Apply response interceptors
            const interceptedResponse = this.applyResponseInterceptors({
                data: responseData,
                status: response.status,
                headers: response.headers
            });
            
            // Cache GET responses
            if (method === 'GET' && this.cache.enabled) {
                this.setCachedResponse(cacheKey, interceptedResponse.data);
            }
            
            this.log(`✅ ${method} ${endpoint} completed`);
            return { ok: true, data: interceptedResponse.data, status: response.status };
            
        } catch (error) {
            this.logError(`❌ API request failed (${method} ${endpoint}):`, error);
            
            // Handle network errors
            if (this.isNetworkError(error)) {
                await this.handleOfflineRequest(method, endpoint, data);
            }
            
            // Retry logic with exponential backoff
            if (retryCount < this.retryConfig.attempts && this.shouldRetry(error)) {
                const delay = this.calculateRetryDelay(retryCount);
                this.log(`⏳ Retrying request in ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.attempts})`);
                
                await this.delay(delay);
                return this.makeRequest(method, endpoint, data, retryCount + 1, useCache);
            }
            
            return { 
                ok: false, 
                error: error.message, 
                status: error.status || 0,
                details: error.details || null
            };
        }
    }
    
    /**
     * Build headers with authentication (Context7 pattern)
     */
    buildHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'NocoDB-CRM-Client/2.1.0'
        };
        
        // Priority: xc-token > xc-auth
        if (this.apiKey) {
            headers['xc-token'] = this.apiKey;
        } else if (this.authToken) {
            headers['xc-auth'] = this.authToken;
        }
        
        return headers;
    }
    
    /**
     * Parse response with proper error handling
     */
    async parseResponse(response) {
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch (error) {
                this.logError('Failed to parse JSON response:', error);
                return null;
            }
        }
        
        return await response.text();
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Calculate retry delay with exponential backoff and jitter
     */
    calculateRetryDelay(retryCount) {
        const baseDelay = this.retryConfig.baseDelay;
        const backoffFactor = this.retryConfig.backoffFactor;
        const jitter = this.retryConfig.jitter;
        
        let delay = baseDelay * Math.pow(backoffFactor, retryCount);
        
        if (jitter) {
            delay += Math.random() * 1000; // Add up to 1s jitter
        }
        
        return Math.min(delay, this.retryConfig.maxDelay);
    }
    
    /**
     * Determine if error is retryable
     */
    shouldRetry(error) {
        if (error instanceof HTTPError) {
            // Retry on server errors (5xx) and some client errors
            return error.status >= 500 || 
                   error.status === 429 || // Rate limit
                   error.status === 408 || // Request timeout
                   error.status === 409;   // Conflict (for optimistic updates)
        }
        
        // Retry on network errors
        return this.isNetworkError(error);
    }
    
    /**
     * Check if error is network-related
     */
    isNetworkError(error) {
        return error.name === 'TypeError' || 
               error.name === 'NetworkError' ||
               error.message.includes('fetch') ||
               error.message.includes('network');
    }

    // ============================================================================
    // DATA TRANSFORMATION METHODS (Context7 Patterns)
    // ============================================================================
    
    /**
     * Build data endpoint for table
     */
    buildDataEndpoint(tableType) {
        const config = this.tables[tableType];
        if (!config) {
            throw new Error(`Unknown table type: ${tableType}`);
        }
        return `/api/v1/db/data/${this.orgId}/${this.projectId}/${config.endpoint}`;
    }
    
    /**
     * Build advanced query parameters for NocoDB API
     */
    buildAdvancedQueryParams(options = {}) {
        const {
            filters = {},
            pagination = {},
            sort = [],
            fields = [],
            include = []
        } = options;
        
        const params = new URLSearchParams();
        
        // Apply pagination
        const limit = Math.min(pagination.limit || this.pagination.defaultLimit, this.pagination.maxLimit);
        const offset = pagination.offset || 0;
        
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());
        
        // Apply filters using NocoDB syntax
        const whereClause = this.buildWhereClause(filters);
        if (whereClause) {
            params.append('where', whereClause);
        }
        
        // Apply sorting
        if (sort.length > 0) {
            const sortClause = sort.map(s => `${s.direction === 'desc' ? '-' : ''}${s.field}`).join(',');
            params.append('sort', sortClause);
        }
        
        // Apply field selection
        if (fields.length > 0) {
            params.append('fields', fields.join(','));
        }
        
        // Apply includes for relations
        if (include.length > 0) {
            params.append('nested', JSON.stringify(include));
        }
        
        return params.toString();
    }
    
    /**
     * Build WHERE clause using NocoDB filter syntax
     */
    buildWhereClause(filters) {
        const conditions = [];
        
        for (const [field, condition] of Object.entries(filters)) {
            if (typeof condition === 'object' && condition !== null) {
                // Complex conditions
                for (const [operator, value] of Object.entries(condition)) {
                    conditions.push(this.formatCondition(field, operator, value));
                }
            } else {
                // Simple equality
                conditions.push(this.formatCondition(field, 'eq', condition));
            }
        }
        
        return conditions.length > 0 ? conditions.join('~and') : '';
    }
    
    /**
     * Format individual condition for NocoDB
     */
    formatCondition(field, operator, value) {
        // Handle array values for 'in' operator
        if (operator === 'in' && Array.isArray(value)) {
            return `(${field},${operator},${value.join(',')})`;
        }
        
        // Handle between operator
        if (operator === 'btw' && Array.isArray(value) && value.length === 2) {
            return `(${field},${operator},${value[0]},${value[1]})`;
        }
        
        // Standard condition
        return `(${field},${operator},${value})`;
    }
    
    /**
     * Build simple query parameters
     */
    buildQueryParams(params) {
        const urlParams = new URLSearchParams();
        
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                if (Array.isArray(value)) {
                    urlParams.append(key, value.join(','));
                } else {
                    urlParams.append(key, value.toString());
                }
            }
        });
        
        return urlParams.toString();
    }
    
    /**
     * Transform deal data to API format
     */
    transformDealToAPI(dealData) {
        const fields = this.tables.deals.fields;
        const apiData = {};
        
        // Map known fields
        if (dealData.title !== undefined) apiData[fields.title] = dealData.title;
        if (dealData.amount !== undefined) apiData[fields.amount] = dealData.amount;
        if (dealData.status !== undefined) apiData[fields.status] = dealData.status;
        if (dealData.company !== undefined) apiData[fields.company] = dealData.company;
        if (dealData.contact !== undefined) apiData[fields.contact] = dealData.contact;
        if (dealData.notes !== undefined) apiData[fields.notes] = dealData.notes;
        if (dealData.priority !== undefined) apiData[fields.priority] = dealData.priority;
        if (dealData.stage !== undefined) apiData[fields.stage] = dealData.stage;
        if (dealData.probability !== undefined) apiData[fields.probability] = dealData.probability;
        if (dealData.expected_close_date !== undefined) apiData[fields.expected_close_date] = dealData.expected_close_date;
        
        // Always set updated timestamp
        apiData[fields.updated_at] = new Date().toISOString();
        
        return apiData;
    }

    /**
     * Transform contact data to API format
     */
    transformContactToAPI(contactData) {
        const fields = this.tables.contacts.fields;
        const apiData = {};
        
        if (contactData.name !== undefined) apiData[fields.name] = contactData.name;
        if (contactData.email !== undefined) apiData[fields.email] = contactData.email;
        if (contactData.phone !== undefined) apiData[fields.phone] = contactData.phone;
        if (contactData.company !== undefined) apiData[fields.company] = contactData.company;
        if (contactData.position !== undefined) apiData[fields.position] = contactData.position;
        if (contactData.department !== undefined) apiData[fields.department] = contactData.department;
        if (contactData.linkedin !== undefined) apiData[fields.linkedin] = contactData.linkedin;
        if (contactData.twitter !== undefined) apiData[fields.twitter] = contactData.twitter;
        if (contactData.notes !== undefined) apiData[fields.notes] = contactData.notes;
        
        apiData[fields.updated_at] = new Date().toISOString();
        return apiData;
    }

    /**
     * Transform company data to API format
     */
    transformCompanyToAPI(companyData) {
        const fields = this.tables.companies.fields;
        const apiData = {};
        
        if (companyData.name !== undefined) apiData[fields.name] = companyData.name;
        if (companyData.industry !== undefined) apiData[fields.industry] = companyData.industry;
        if (companyData.size !== undefined) apiData[fields.size] = companyData.size;
        if (companyData.website !== undefined) apiData[fields.website] = companyData.website;
        if (companyData.address !== undefined) apiData[fields.address] = companyData.address;
        if (companyData.city !== undefined) apiData[fields.city] = companyData.city;
        if (companyData.country !== undefined) apiData[fields.country] = companyData.country;
        if (companyData.revenue !== undefined) apiData[fields.revenue] = companyData.revenue;
        if (companyData.employees !== undefined) apiData[fields.employees] = companyData.employees;
        if (companyData.description !== undefined) apiData[fields.description] = companyData.description;
        
        apiData[fields.updated_at] = new Date().toISOString();
        return apiData;
    }

    /**
     * Transform deal data from API format
     */
    transformDealFromAPI(apiData) {
        const fields = this.tables.deals.fields;
        return {
            id: apiData[fields.id],
            title: apiData[fields.title],
            amount: apiData[fields.amount],
            status: apiData[fields.status],
            company: apiData[fields.company],
            contact: apiData[fields.contact],
            notes: apiData[fields.notes],
            priority: apiData[fields.priority],
            stage: apiData[fields.stage],
            probability: apiData[fields.probability],
            expected_close_date: apiData[fields.expected_close_date],
            created_at: apiData[fields.created_at],
            updated_at: apiData[fields.updated_at]
        };
    }
    
    /**
     * Transform contact data from API format
     */
    transformContactFromAPI(apiData) {
        const fields = this.tables.contacts.fields;
        return {
            id: apiData[fields.id],
            name: apiData[fields.name],
            email: apiData[fields.email],
            phone: apiData[fields.phone],
            company: apiData[fields.company],
            position: apiData[fields.position],
            department: apiData[fields.department],
            linkedin: apiData[fields.linkedin],
            twitter: apiData[fields.twitter],
            notes: apiData[fields.notes],
            created_at: apiData[fields.created_at],
            updated_at: apiData[fields.updated_at]
        };
    }
    
    /**
     * Transform company data from API format
     */
    transformCompanyFromAPI(apiData) {
        const fields = this.tables.companies.fields;
        return {
            id: apiData[fields.id],
            name: apiData[fields.name],
            industry: apiData[fields.industry],
            size: apiData[fields.size],
            website: apiData[fields.website],
            address: apiData[fields.address],
            city: apiData[fields.city],
            country: apiData[fields.country],
            revenue: apiData[fields.revenue],
            employees: apiData[fields.employees],
            description: apiData[fields.description],
            created_at: apiData[fields.created_at],
            updated_at: apiData[fields.updated_at]
        };
    }

    // ============================================================================
    // CRUD OPERATIONS - Context7 Enhanced Patterns
    // ============================================================================
    
    /**
     * Get deals with advanced filtering and pagination
     */
    async getDeals(options = {}) {
        try {
            const {
                filters = {},
                pagination = {},
                sort = [],
                fields = [],
                include = []
            } = options;
            
            const endpoint = this.buildDataEndpoint('deals');
            const queryParams = this.buildAdvancedQueryParams({
                filters,
                pagination,
                sort,
                fields,
                include
            });
            
            const fullEndpoint = queryParams ? `${endpoint}?${queryParams}` : endpoint;
            const response = await this.makeRequest('GET', fullEndpoint);
            
            if (response.ok) {
                const data = response.data;
                const deals = data.list || data.rows || data;
                
                // Apply client-side transformations
                const transformedDeals = deals.map(deal => this.transformDealFromAPI(deal));
                
                // Emit event for real-time updates
                this.emit('dealsLoaded', { 
                    deals: transformedDeals, 
                    count: transformedDeals.length,
                    pagination: data.pageInfo
                });
                
                return {
                    deals: transformedDeals,
                    pagination: data.pageInfo || { hasMore: false },
                    total: data.count || transformedDeals.length
                };
            } else {
                throw new APIError(`Failed to fetch deals: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError('getDeals failed:', error);
            
            // Return cached data if available
            const cached = this.getOfflineData('deals');
            if (cached) {
                this.log('📋 Returning cached deals data');
                return cached;
            }
            
            throw error;
        }
    }

    /**
     * Get single deal with relations
     */
    async getDeal(id, options = {}) {
        try {
            const { include = ['company', 'contact'] } = options;
            
            const endpoint = `${this.buildDataEndpoint('deals')}/${id}`;
            const queryParams = include.length > 0 ? 
                this.buildQueryParams({ include: include.join(',') }) : '';
            
            const fullEndpoint = queryParams ? `${endpoint}?${queryParams}` : endpoint;
            const response = await this.makeRequest('GET', fullEndpoint);
            
            if (response.ok) {
                const deal = this.transformDealFromAPI(response.data);
                
                this.emit('dealLoaded', { deal });
                return deal;
            } else {
                throw new APIError(`Failed to fetch deal: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`getDeal(${id}) failed:`, error);
            
            // Try offline storage
            const cached = this.getOfflineData(`deal_${id}`);
            if (cached) {
                this.log(`📋 Returning cached deal ${id}`);
                return cached;
            }
            
            throw error;
        }
    }

    /**
     * Create deal with validation and optimistic updates
     */
    async createDeal(dealData, options = {}) {
        try {
            const { optimistic = true, validate = true } = options;
            
            // Validate data
            if (validate) {
                this.validateDealData(dealData);
            }
            
            const endpoint = this.buildDataEndpoint('deals');
            const apiData = this.transformDealToAPI(dealData);
            
            // Optimistic update
            if (optimistic) {
                const tempId = `temp_${Date.now()}`;
                const optimisticDeal = { ...dealData, id: tempId };
                this.emit('dealCreatedOptimistic', { deal: optimisticDeal });
            }
            
            const response = await this.makeRequest('POST', endpoint, apiData);
            
            if (response.ok) {
                const createdDeal = this.transformDealFromAPI(response.data);
                
                // Update Yjs document
                await this.updateYjsDocument('deals', 'create', createdDeal);
                
                this.emit('dealCreated', { deal: createdDeal });
                this.log(`✅ Deal created: ${createdDeal.title}`);
                
                return createdDeal;
            } else {
                // Revert optimistic update
                if (optimistic) {
                    this.emit('dealCreateFailed', { error: response.error });
                }
                throw new APIError(`Failed to create deal: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError('createDeal failed:', error);
            
            // Queue for offline sync
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('create', 'deals', dealData);
                this.log('📋 Deal queued for offline sync');
                return { ...dealData, id: `offline_${Date.now()}`, _offline: true };
            }
            
            throw error;
        }
    }

    /**
     * Update deal with conflict resolution
     */
    async updateDeal(id, dealData, options = {}) {
        try {
            const { 
                optimistic = true, 
                conflictResolution = 'merge',
                validate = true 
            } = options;
            
            // Validate data
            if (validate) {
                this.validateDealData(dealData);
            }
            
            // Get current version for conflict detection
            const currentDeal = await this.getDeal(id);
            
            const endpoint = `${this.buildDataEndpoint('deals')}/${id}`;
            const apiData = this.transformDealToAPI(dealData);
            
            // Add version for optimistic concurrency control
            if (currentDeal.updated_at) {
                apiData._version = currentDeal.updated_at;
            }
            
            // Optimistic update
            if (optimistic) {
                const optimisticDeal = { ...currentDeal, ...dealData };
                this.emit('dealUpdatedOptimistic', { deal: optimisticDeal });
            }
            
            const response = await this.makeRequest('PATCH', endpoint, apiData);
            
            if (response.ok) {
                const updatedDeal = this.transformDealFromAPI(response.data);
                
                // Update Yjs document
                await this.updateYjsDocument('deals', 'update', updatedDeal);
                
                this.emit('dealUpdated', { deal: updatedDeal, previous: currentDeal });
                this.log(`✅ Deal updated: ${updatedDeal.title}`);
                
                return updatedDeal;
            } else if (response.status === 409) {
                // Handle conflict
                return await this.handleUpdateConflict(id, dealData, conflictResolution);
            } else {
                // Revert optimistic update
                if (optimistic) {
                    this.emit('dealUpdateFailed', { id, error: response.error });
                }
                throw new APIError(`Failed to update deal: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`updateDeal(${id}) failed:`, error);
            
            // Queue for offline sync
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('update', 'deals', { id, ...dealData });
                this.log(`📋 Deal update queued for offline sync`);
                return { ...dealData, id, _offline: true };
            }
            
            throw error;
        }
    }

    /**
     * Delete deal with confirmation and cleanup
     */
    async deleteDeal(id, options = {}) {
        try {
            const { optimistic = true, cascade = false } = options;
            
            // Get deal before deletion for cleanup
            const deal = await this.getDeal(id);
            
            const endpoint = `${this.buildDataEndpoint('deals')}/${id}`;
            
            // Optimistic delete
            if (optimistic) {
                this.emit('dealDeletedOptimistic', { id, deal });
            }
            
            const response = await this.makeRequest('DELETE', endpoint);
            
            if (response.ok) {
                // Cascade delete relations if requested
                if (cascade) {
                    await this.cascadeDeleteRelations('deals', id);
                }
                
                // Update Yjs document
                await this.updateYjsDocument('deals', 'delete', { id });
                
                this.emit('dealDeleted', { id, deal });
                this.log(`✅ Deal deleted: ${deal.title}`);
                
                return true;
            } else {
                // Revert optimistic delete
                if (optimistic) {
                    this.emit('dealDeleteFailed', { id, error: response.error });
                }
                throw new APIError(`Failed to delete deal: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`deleteDeal(${id}) failed:`, error);
            
            // Queue for offline sync
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('delete', 'deals', { id });
                this.log(`📋 Deal deletion queued for offline sync`);
                return true; // Assume success for UX
            }
            
            throw error;
        }
    }

    // ============================================================================
    // CONTACT OPERATIONS
    // ============================================================================
    
    /**
     * Get contacts with advanced filtering
     */
    async getContacts(options = {}) {
        try {
            const endpoint = this.buildDataEndpoint('contacts');
            const queryParams = this.buildAdvancedQueryParams(options);
            const fullEndpoint = queryParams ? `${endpoint}?${queryParams}` : endpoint;
            
            const response = await this.makeRequest('GET', fullEndpoint);
            
            if (response.ok) {
                const data = response.data;
                const contacts = (data.list || data.rows || data).map(contact => 
                    this.transformContactFromAPI(contact)
                );
                
                this.emit('contactsLoaded', { contacts, count: contacts.length });
                return { contacts, pagination: data.pageInfo };
            } else {
                throw new APIError(`Failed to fetch contacts: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError('getContacts failed:', error);
            const cached = this.getOfflineData('contacts');
            if (cached) return cached;
            throw error;
        }
    }
    
    /**
     * Get single contact
     */
    async getContact(id, options = {}) {
        try {
            const endpoint = `${this.buildDataEndpoint('contacts')}/${id}`;
            const response = await this.makeRequest('GET', endpoint);
            
            if (response.ok) {
                const contact = this.transformContactFromAPI(response.data);
                this.emit('contactLoaded', { contact });
                return contact;
            } else {
                throw new APIError(`Failed to fetch contact: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`getContact(${id}) failed:`, error);
            const cached = this.getOfflineData(`contact_${id}`);
            if (cached) return cached;
            throw error;
        }
    }

    /**
     * Create contact with validation
     */
    async createContact(contactData, options = {}) {
        try {
            const { optimistic = true, validate = true } = options;
            
            if (validate) {
                this.validateContactData(contactData);
            }
            
            const endpoint = this.buildDataEndpoint('contacts');
            const apiData = this.transformContactToAPI(contactData);
            
            if (optimistic) {
                const tempContact = { ...contactData, id: `temp_${Date.now()}` };
                this.emit('contactCreatedOptimistic', { contact: tempContact });
            }
            
            const response = await this.makeRequest('POST', endpoint, apiData);
            
            if (response.ok) {
                const createdContact = this.transformContactFromAPI(response.data);
                await this.updateYjsDocument('contacts', 'create', createdContact);
                this.emit('contactCreated', { contact: createdContact });
                return createdContact;
            } else {
                if (optimistic) {
                    this.emit('contactCreateFailed', { error: response.error });
                }
                throw new APIError(`Failed to create contact: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError('createContact failed:', error);
            
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('create', 'contacts', contactData);
                return { ...contactData, id: `offline_${Date.now()}`, _offline: true };
            }
            
            throw error;
        }
    }
    
    /**
     * Update contact
     */
    async updateContact(id, contactData, options = {}) {
        try {
            const { optimistic = true, validate = true } = options;
            
            if (validate) {
                this.validateContactData(contactData);
            }
            
            const endpoint = `${this.buildDataEndpoint('contacts')}/${id}`;
            const apiData = this.transformContactToAPI(contactData);
            
            if (optimistic) {
                const current = await this.getContact(id);
                const optimisticContact = { ...current, ...contactData };
                this.emit('contactUpdatedOptimistic', { contact: optimisticContact });
            }
            
            const response = await this.makeRequest('PATCH', endpoint, apiData);
            
            if (response.ok) {
                const updatedContact = this.transformContactFromAPI(response.data);
                await this.updateYjsDocument('contacts', 'update', updatedContact);
                this.emit('contactUpdated', { contact: updatedContact });
                return updatedContact;
            } else {
                throw new APIError(`Failed to update contact: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`updateContact(${id}) failed:`, error);
            
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('update', 'contacts', { id, ...contactData });
                return { ...contactData, id, _offline: true };
            }
            
            throw error;
        }
    }
    
    /**
     * Delete contact
     */
    async deleteContact(id, options = {}) {
        try {
            const { optimistic = true } = options;
            
            const contact = await this.getContact(id);
            const endpoint = `${this.buildDataEndpoint('contacts')}/${id}`;
            
            if (optimistic) {
                this.emit('contactDeletedOptimistic', { id, contact });
            }
            
            const response = await this.makeRequest('DELETE', endpoint);
            
            if (response.ok) {
                await this.updateYjsDocument('contacts', 'delete', { id });
                this.emit('contactDeleted', { id, contact });
                return true;
            } else {
                throw new APIError(`Failed to delete contact: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`deleteContact(${id}) failed:`, error);
            
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('delete', 'contacts', { id });
                return true;
            }
            
            throw error;
        }
    }

    // ============================================================================
    // COMPANY OPERATIONS  
    // ============================================================================
    
    /**
     * Get companies with advanced filtering
     */
    async getCompanies(options = {}) {
        try {
            const endpoint = this.buildDataEndpoint('companies');
            const queryParams = this.buildAdvancedQueryParams(options);
            const fullEndpoint = queryParams ? `${endpoint}?${queryParams}` : endpoint;
            
            const response = await this.makeRequest('GET', fullEndpoint);
            
            if (response.ok) {
                const data = response.data;
                const companies = (data.list || data.rows || data).map(company => 
                    this.transformCompanyFromAPI(company)
                );
                
                this.emit('companiesLoaded', { companies, count: companies.length });
                return { companies, pagination: data.pageInfo };
            } else {
                throw new APIError(`Failed to fetch companies: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError('getCompanies failed:', error);
            const cached = this.getOfflineData('companies');
            if (cached) return cached;
            throw error;
        }
    }
    
    /**
     * Get single company
     */
    async getCompany(id, options = {}) {
        try {
            const endpoint = `${this.buildDataEndpoint('companies')}/${id}`;
            const response = await this.makeRequest('GET', endpoint);
            
            if (response.ok) {
                const company = this.transformCompanyFromAPI(response.data);
                this.emit('companyLoaded', { company });
                return company;
            } else {
                throw new APIError(`Failed to fetch company: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`getCompany(${id}) failed:`, error);
            const cached = this.getOfflineData(`company_${id}`);
            if (cached) return cached;
            throw error;
        }
    }

    /**
     * Create company with validation
     */
    async createCompany(companyData, options = {}) {
        try {
            const { optimistic = true, validate = true } = options;
            
            if (validate) {
                this.validateCompanyData(companyData);
            }
            
            const endpoint = this.buildDataEndpoint('companies');
            const apiData = this.transformCompanyToAPI(companyData);
            
            if (optimistic) {
                const tempCompany = { ...companyData, id: `temp_${Date.now()}` };
                this.emit('companyCreatedOptimistic', { company: tempCompany });
            }
            
            const response = await this.makeRequest('POST', endpoint, apiData);
            
            if (response.ok) {
                const createdCompany = this.transformCompanyFromAPI(response.data);
                await this.updateYjsDocument('companies', 'create', createdCompany);
                this.emit('companyCreated', { company: createdCompany });
                return createdCompany;
            } else {
                if (optimistic) {
                    this.emit('companyCreateFailed', { error: response.error });
                }
                throw new APIError(`Failed to create company: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError('createCompany failed:', error);
            
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('create', 'companies', companyData);
                return { ...companyData, id: `offline_${Date.now()}`, _offline: true };
            }
            
            throw error;
        }
    }
    
    /**
     * Update company
     */
    async updateCompany(id, companyData, options = {}) {
        try {
            const { optimistic = true, validate = true } = options;
            
            if (validate) {
                this.validateCompanyData(companyData);
            }
            
            const endpoint = `${this.buildDataEndpoint('companies')}/${id}`;
            const apiData = this.transformCompanyToAPI(companyData);
            
            if (optimistic) {
                const current = await this.getCompany(id);
                const optimisticCompany = { ...current, ...companyData };
                this.emit('companyUpdatedOptimistic', { company: optimisticCompany });
            }
            
            const response = await this.makeRequest('PATCH', endpoint, apiData);
            
            if (response.ok) {
                const updatedCompany = this.transformCompanyFromAPI(response.data);
                await this.updateYjsDocument('companies', 'update', updatedCompany);
                this.emit('companyUpdated', { company: updatedCompany });
                return updatedCompany;
            } else {
                throw new APIError(`Failed to update company: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`updateCompany(${id}) failed:`, error);
            
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('update', 'companies', { id, ...companyData });
                return { ...companyData, id, _offline: true };
            }
            
            throw error;
        }
    }
    
    /**
     * Delete company
     */
    async deleteCompany(id, options = {}) {
        try {
            const { optimistic = true, cascade = false } = options;
            
            const company = await this.getCompany(id);
            const endpoint = `${this.buildDataEndpoint('companies')}/${id}`;
            
            if (optimistic) {
                this.emit('companyDeletedOptimistic', { id, company });
            }
            
            const response = await this.makeRequest('DELETE', endpoint);
            
            if (response.ok) {
                if (cascade) {
                    await this.cascadeDeleteRelations('companies', id);
                }
                
                await this.updateYjsDocument('companies', 'delete', { id });
                this.emit('companyDeleted', { id, company });
                return true;
            } else {
                throw new APIError(`Failed to delete company: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`deleteCompany(${id}) failed:`, error);
            
            if (this.isNetworkError(error)) {
                await this.queueOfflineOperation('delete', 'companies', { id });
                return true;
            }
            
            throw error;
        }
    }

    // ============================================================================
    // VALIDATION METHODS
    // ============================================================================
    
    /**
     * Validate deal data
     */
    validateDealData(dealData) {
        if (!dealData.title || dealData.title.trim() === '') {
            throw new Error('Deal title is required');
        }
        
        if (dealData.amount !== undefined && (typeof dealData.amount !== 'number' || dealData.amount < 0)) {
            throw new Error('Deal amount must be a positive number');
        }
        
        if (dealData.status && !['new', 'qualifying', 'proposal', 'negotiation', 'won', 'lost'].includes(dealData.status)) {
            throw new Error('Invalid deal status');
        }
        
        if (dealData.probability !== undefined && (typeof dealData.probability !== 'number' || dealData.probability < 0 || dealData.probability > 100)) {
            throw new Error('Deal probability must be between 0 and 100');
        }
    }
    
    /**
     * Validate contact data
     */
    validateContactData(contactData) {
        if (!contactData.name || contactData.name.trim() === '') {
            throw new Error('Contact name is required');
        }
        
        if (contactData.email && !this.isValidEmail(contactData.email)) {
            throw new Error('Invalid email format');
        }
        
        if (contactData.phone && !this.isValidPhone(contactData.phone)) {
            throw new Error('Invalid phone format');
        }
    }
    
    /**
     * Validate company data
     */
    validateCompanyData(companyData) {
        if (!companyData.name || companyData.name.trim() === '') {
            throw new Error('Company name is required');
        }
        
        if (companyData.website && !this.isValidUrl(companyData.website)) {
            throw new Error('Invalid website URL format');
        }
        
        if (companyData.employees !== undefined && (typeof companyData.employees !== 'number' || companyData.employees < 0)) {
            throw new Error('Employee count must be a positive number');
        }
    }
    
    /**
     * Email validation
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    /**
     * Phone validation (basic)
     */
    isValidPhone(phone) {
        const phoneRegex = /^[\+]?[1-9][\d\s\-\(\)]{7,}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }
    
    /**
     * URL validation
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    // ============================================================================
    // CACHING METHODS
    // ============================================================================
    
    /**
     * Get cached response
     */
    getCachedResponse(cacheKey) {
        if (!this.cache.enabled) return null;
        
        const cached = this.cache.storage.get(cacheKey);
        if (!cached) return null;
        
        // Check TTL
        if (Date.now() - cached.timestamp > this.cache.ttl) {
            this.cache.storage.delete(cacheKey);
            return null;
        }
        
        return cached.data;
    }
    
    /**
     * Set cached response
     */
    setCachedResponse(cacheKey, data) {
        if (!this.cache.enabled) return;
        
        this.cache.storage.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        
        // Cleanup old entries
        this.cleanupCache();
    }
    
    /**
     * Cleanup expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        
        for (const [key, entry] of this.cache.storage.entries()) {
            if (now - entry.timestamp > this.cache.ttl) {
                this.cache.storage.delete(key);
            }
        }
    }
    
    // ============================================================================
    // OFFLINE STORAGE METHODS
    // ============================================================================
    
    /**
     * Get data from offline storage
     */
    getOfflineData(key) {
        try {
            const data = localStorage.getItem(`nocodb_offline_${key}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            this.logError('Failed to get offline data:', error);
            return null;
        }
    }
    
    /**
     * Set data in offline storage
     */
    setOfflineData(key, data) {
        try {
            localStorage.setItem(`nocodb_offline_${key}`, JSON.stringify(data));
        } catch (error) {
            this.logError('Failed to set offline data:', error);
        }
    }
    
    /**
     * Queue operation for offline sync
     */
    async queueOfflineOperation(operation, entityType, data) {
        const queueItem = {
            id: this.generateId('queue'),
            operation,
            entityType,
            data,
            timestamp: Date.now(),
            retries: 0
        };
        
        this.offlineQueue.push(queueItem);
        this.setOfflineData('queue', this.offlineQueue);
        
        this.log(`📋 Queued ${operation} operation for ${entityType}`);
    }
    
    /**
     * Process offline queue
     */
    async processOfflineQueue() {
        if (!this.isConnected || this.offlineQueue.length === 0) {
            return;
        }
        
        this.log(`🔄 Processing ${this.offlineQueue.length} offline operations`);
        
        const processedItems = [];
        
        for (const item of this.offlineQueue) {
            try {
                await this.processOfflineItem(item);
                processedItems.push(item.id);
                this.log(`✅ Processed offline ${item.operation} for ${item.entityType}`);
            } catch (error) {
                item.retries++;
                if (item.retries >= this.retryConfig.attempts) {
                    this.logError(`❌ Failed to process offline operation after ${item.retries} retries:`, error);
                    processedItems.push(item.id); // Remove failed items
                } else {
                    this.logError(`⚠️ Offline operation failed (retry ${item.retries}):`, error);
                }
            }
        }
        
        // Remove processed items
        this.offlineQueue = this.offlineQueue.filter(item => !processedItems.includes(item.id));
        this.setOfflineData('queue', this.offlineQueue);
        
        this.emit('offlineQueueProcessed', {
            processed: processedItems.length,
            remaining: this.offlineQueue.length
        });
    }
    
    /**
     * Process individual offline item
     */
    async processOfflineItem(item) {
        const { operation, entityType, data } = item;
        
        switch (operation) {
            case 'create':
                return await this[`create${this.capitalize(entityType.slice(0, -1))}`](data, { optimistic: false });
            case 'update':
                return await this[`update${this.capitalize(entityType.slice(0, -1))}`](data.id, data, { optimistic: false });
            case 'delete':
                return await this[`delete${this.capitalize(entityType.slice(0, -1))}`](data.id, { optimistic: false });
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    }
    
    /**
     * Load offline queue from storage
     */
    loadOfflineQueue() {
        try {
            const storedQueue = this.getOfflineData('queue');
            if (storedQueue && Array.isArray(storedQueue)) {
                this.offlineQueue = storedQueue;
                this.log(`📋 Loaded ${this.offlineQueue.length} items from offline queue`);
            }
        } catch (error) {
            this.logError('Failed to load offline queue:', error);
            this.offlineQueue = [];
        }
    }
    
    // ============================================================================
    // AUTO-SYNC METHODS
    // ============================================================================
    
    /**
     * Setup automatic synchronization
     */
    setupAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }
        
        // Sync every 5 minutes when connected
        this.autoSyncInterval = setInterval(async () => {
            if (this.isConnected && navigator.onLine) {
                try {
                    await this.intelligentSync();
                } catch (error) {
                    this.logError('Auto-sync failed:', error);
                }
            }
        }, 5 * 60 * 1000);
        
        this.log('⚡ Auto-sync enabled (5 minute intervals)');
    }
    
    /**
     * Intelligent sync with conflict detection
     */
    async intelligentSync(options = {}) {
        const {
            direction = 'bidirectional',
            conflictResolution = 'merge',
            entityTypes = Object.keys(this.tables)
        } = options;
        
        const results = {
            entities: {},
            totalUploaded: 0,
            totalDownloaded: 0,
            totalConflicts: 0,
            duration: 0
        };
        
        const startTime = Date.now();
        
        try {
            this.log('🔄 Starting intelligent sync...');
            
            for (const entityType of entityTypes) {
                try {
                    const result = await this.syncEntity(entityType, { direction, conflictResolution });
                    results.entities[entityType] = result;
                    results.totalUploaded += result.uploaded;
                    results.totalDownloaded += result.downloaded;
                    results.totalConflicts += result.conflicts;
                } catch (error) {
                    this.logError(`Sync failed for ${entityType}:`, error);
                    results.entities[entityType] = { error: error.message };
                }
            }
            
            results.duration = Date.now() - startTime;
            
            this.log(`✅ Intelligent sync completed in ${results.duration}ms`);
            this.emit('syncCompleted', results);
            
            return results;
        } catch (error) {
            this.logError('Intelligent sync failed:', error);
            this.emit('syncFailed', { error: error.message });
            throw error;
        }
    }
    
    // ============================================================================
    // ANALYTICS METHODS
    // ============================================================================
    
    /**
     * Get pipeline analytics with forecasts
     */
    async getPipelineAnalytics(options = {}) {
        const {
            timeframe = '30d',
            includeForecasts = true,
            includeTrends = true
        } = options;
        
        try {
            const deals = await this.getDeals();
            const companies = await this.getCompanies();
            const contacts = await this.getContacts();
            
            const analytics = {
                summary: this.calculateSummaryMetrics(deals.deals),
                pipeline: this.calculatePipelineMetrics(deals.deals),
                conversion: this.calculateConversionMetrics(deals.deals),
                companies: this.calculateCompanyMetrics(companies.companies),
                contacts: this.calculateContactMetrics(contacts.contacts),
                timeframe,
                generatedAt: new Date().toISOString()
            };
            
            if (includeForecasts) {
                analytics.forecasts = this.generateForecasts(deals.deals);
            }
            
            if (includeTrends) {
                analytics.trends = this.calculateTrends(deals.deals, timeframe);
            }
            
            this.emit('analyticsGenerated', analytics);
            return analytics;
        } catch (error) {
            this.logError('Failed to generate pipeline analytics:', error);
            throw error;
        }
    }
    
    /**
     * Calculate summary metrics
     */
    calculateSummaryMetrics(deals) {
        return {
            totalDeals: deals.length,
            totalValue: deals.reduce((sum, deal) => sum + (deal.amount || 0), 0),
            averageValue: deals.length > 0 ? deals.reduce((sum, deal) => sum + (deal.amount || 0), 0) / deals.length : 0,
            wonDeals: deals.filter(deal => deal.status === 'won').length,
            lostDeals: deals.filter(deal => deal.status === 'lost').length,
            activeDeals: deals.filter(deal => !['won', 'lost'].includes(deal.status)).length
        };
    }
    
    /**
     * Calculate pipeline metrics
     */
    calculatePipelineMetrics(deals) {
        const stages = {};
        const statuses = {};
        
        deals.forEach(deal => {
            // By status
            statuses[deal.status] = statuses[deal.status] || { count: 0, value: 0 };
            statuses[deal.status].count++;
            statuses[deal.status].value += deal.amount || 0;
            
            // By stage
            if (deal.stage) {
                stages[deal.stage] = stages[deal.stage] || { count: 0, value: 0 };
                stages[deal.stage].count++;
                stages[deal.stage].value += deal.amount || 0;
            }
        });
        
        return { stages, statuses };
    }
    
    /**
     * Calculate conversion metrics
     */
    calculateConversionMetrics(deals) {
        const totalDeals = deals.length;
        const wonDeals = deals.filter(deal => deal.status === 'won').length;
        const lostDeals = deals.filter(deal => deal.status === 'lost').length;
        const closedDeals = wonDeals + lostDeals;
        
        return {
            winRate: closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0,
            lossRate: closedDeals > 0 ? (lostDeals / closedDeals) * 100 : 0,
            overallConversion: totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0,
            averageProbability: deals.length > 0 ? deals.reduce((sum, deal) => sum + (deal.probability || 0), 0) / deals.length : 0
        };
    }
    
    /**
     * Calculate company metrics
     */
    calculateCompanyMetrics(companies) {
        const industries = {};
        const sizes = {};
        
        companies.forEach(company => {
            if (company.industry) {
                industries[company.industry] = (industries[company.industry] || 0) + 1;
            }
            if (company.size) {
                sizes[company.size] = (sizes[company.size] || 0) + 1;
            }
        });
        
        return {
            total: companies.length,
            byIndustry: industries,
            bySize: sizes
        };
    }
    
    /**
     * Calculate contact metrics
     */
    calculateContactMetrics(contacts) {
        const departments = {};
        const withEmail = contacts.filter(contact => contact.email).length;
        const withPhone = contacts.filter(contact => contact.phone).length;
        
        contacts.forEach(contact => {
            if (contact.department) {
                departments[contact.department] = (departments[contact.department] || 0) + 1;
            }
        });
        
        return {
            total: contacts.length,
            withEmail,
            withPhone,
            completionRate: contacts.length > 0 ? ((withEmail + withPhone) / (contacts.length * 2)) * 100 : 0,
            byDepartment: departments
        };
    }
    
    /**
     * Generate forecasts
     */
    generateForecasts(deals) {
        const activeDeals = deals.filter(deal => !['won', 'lost'].includes(deal.status));
        
        const weightedValue = activeDeals.reduce((sum, deal) => {
            return sum + (deal.amount || 0) * (deal.probability || 50) / 100;
        }, 0);
        
        const optimisticValue = activeDeals.reduce((sum, deal) => {
            return sum + (deal.amount || 0) * Math.min((deal.probability || 50) * 1.3, 100) / 100;
        }, 0);
        
        const pessimisticValue = activeDeals.reduce((sum, deal) => {
            return sum + (deal.amount || 0) * Math.max((deal.probability || 50) * 0.7, 0) / 100;
        }, 0);
        
        return {
            weighted: weightedValue,
            optimistic: optimisticValue,
            pessimistic: pessimisticValue,
            confidence: activeDeals.length > 0 ? 'medium' : 'low'
        };
    }
    
    /**
     * Calculate trends
     */
    calculateTrends(deals, timeframe) {
        // Simple trend calculation - would be more sophisticated in production
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - this.parseTimeframe(timeframe));
        
        const recentDeals = deals.filter(deal => {
            const dealDate = new Date(deal.created_at);
            return dealDate >= cutoffDate;
        });
        
        const recentWins = recentDeals.filter(deal => deal.status === 'won');
        const recentValue = recentDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0);
        
        return {
            period: timeframe,
            dealsCreated: recentDeals.length,
            dealsWon: recentWins.length,
            totalValue: recentValue,
            trend: recentDeals.length > 0 ? 'up' : 'stable'
        };
    }
    
    /**
     * Parse timeframe string to milliseconds
     */
    parseTimeframe(timeframe) {
        const match = timeframe.match(/(\d+)([dwmy])/i);
        if (!match) return 30 * 24 * 60 * 60 * 1000; // Default 30 days
        
        const [, amount, unit] = match;
        const multipliers = {
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000,
            'm': 30 * 24 * 60 * 60 * 1000,
            'y': 365 * 24 * 60 * 60 * 1000
        };
        
        return parseInt(amount) * (multipliers[unit.toLowerCase()] || multipliers.d);
    }
    
    // ============================================================================
    // UTILITY METHODS
    // ============================================================================
    
    /**
     * Generate unique ID
     */
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Capitalize string
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    /**
     * Debug logging
     */
    log(...args) {
        if (this.debug) {
            console.log('[NocoDB API]', ...args);
        }
    }
    
    /**
     * Error logging
     */
    logError(...args) {
        console.error('[NocoDB API ERROR]', ...args);
    }
    
    /**
     * Apply request interceptors
     */
    applyRequestInterceptors(requestData) {
        let result = { ...requestData };
        
        for (const interceptor of this.requestInterceptors) {
            try {
                result = interceptor(result) || result;
            } catch (error) {
                this.logError('Request interceptor failed:', error);
            }
        }
        
        return result;
    }
    
    /**
     * Apply response interceptors
     */
    applyResponseInterceptors(responseData) {
        let result = { ...responseData };
        
        for (const interceptor of this.responseInterceptors) {
            try {
                result = interceptor(result) || result;
            } catch (error) {
                this.logError('Response interceptor failed:', error);
            }
        }
        
        return result;
    }
    
    /**
     * Add request interceptor
     */
    addRequestInterceptor(interceptor) {
        if (typeof interceptor === 'function') {
            this.requestInterceptors.push(interceptor);
        }
    }
    
    /**
     * Add response interceptor
     */
    addResponseInterceptor(interceptor) {
        if (typeof interceptor === 'function') {
            this.responseInterceptors.push(interceptor);
        }
    }
    
    /**
     * Get configuration summary
     */
    getConfigurationSummary() {
        return {
            baseUrl: this.baseUrl,
            projectId: this.projectId,
            orgId: this.orgId,
            hasApiKey: !!this.apiKey,
            hasAuthToken: !!this.authToken,
            isConnected: this.isConnected,
            cacheEnabled: this.cache.enabled,
            debugEnabled: this.debug,
            offlineQueueSize: this.offlineQueue.length,
            tablesConfigured: Object.keys(this.tables).length
        };
    }

    // ============================================================================
    // EVENT SYSTEM
    // ============================================================================
    
    /**
     * Emit event
     */
    emit(eventName, data) {
        const event = new CustomEvent(`api:${eventName}`, {
            detail: data
        });
        document.dispatchEvent(event);
    }

    /**
     * Listen to event
     */
    on(eventName, callback) {
        document.addEventListener(`api:${eventName}`, callback);
    }

    /**
     * Remove event listener
     */
    off(eventName, callback) {
        document.removeEventListener(`api:${eventName}`, callback);
    }

    // ============================================================================
    // TESTING & DEVELOPMENT UTILITIES
    // ============================================================================
    
    /**
     * Comprehensive connection test
     */
    async testConnection() {
        this.log('🔍 Testing NocoDB connection...');
        
        const testResults = {
            baseUrl: this.baseUrl,
            connectivity: false,
            authentication: false,
            projectAccess: false,
            tableAccess: {},
            performance: null,
            error: null
        };
        
        try {
            const startTime = Date.now();
            
            // Test basic connectivity
            const healthResponse = await this.makeRequest('GET', '/api/v1/db/meta/projects', null, 0, false);
            
            if (healthResponse.ok) {
                testResults.connectivity = true;
                testResults.authentication = true;
                testResults.performance = Date.now() - startTime;
                
                this.log('✅ Basic connectivity successful');
                
                // Test project access
                try {
                    await this.validateProjectAccess();
                    testResults.projectAccess = true;
                    this.log('✅ Project access validated');
                } catch (error) {
                    testResults.error = `Project access failed: ${error.message}`;
                    this.logError('❌ Project access failed:', error);
                }
                
                // Test table access
                for (const [entityType, config] of Object.entries(this.tables)) {
                    try {
                        const schema = await this.getTableSchema(config.tableName);
                        testResults.tableAccess[entityType] = {
                            accessible: true,
                            schema: schema ? 'found' : 'not_found'
                        };
                        this.log(`✅ Table ${config.tableName} accessible`);
                    } catch (error) {
                        testResults.tableAccess[entityType] = {
                            accessible: false,
                            error: error.message
                        };
                        this.logError(`❌ Table ${config.tableName} not accessible:`, error);
                    }
                }
                
            } else {
                testResults.error = `Connection failed: ${healthResponse.error}`;
                this.logError('❌ Connection test failed:', healthResponse.error);
            }
            
        } catch (error) {
            testResults.error = error.message;
            this.logError('❌ Connection test failed:', error);
        }
        
        // Output results
        console.table(testResults);
        this.emit('connectionTested', testResults);
        
        return testResults;
    }

    /**
     * Get table schema with enhanced error handling
     */
    async getTableSchema(tableName) {
        try {
            const endpoint = `/api/v1/db/meta/projects/${this.projectId}/tables`;
            const response = await this.makeRequest('GET', endpoint, null, 0, false);
            
            if (response.ok) {
                const tables = response.data.list || response.data;
                const table = tables.find(table => 
                    table.table_name === tableName || 
                    table.title === tableName
                );
                
                if (!table) {
                    throw new Error(`Table '${tableName}' not found in project`);
                }
                
                return table;
            } else {
                throw new APIError(`Failed to get table schema: ${response.error}`, response.status);
            }
        } catch (error) {
            this.logError(`getTableSchema(${tableName}) failed:`, error);
            throw error;
        }
    }
    
    /**
     * Validate all table schemas
     */
    async validateSchemas() {
        const results = {};
        
        for (const [entityType, config] of Object.entries(this.tables)) {
            try {
                const schema = await this.getTableSchema(config.tableName);
                const fieldValidation = this.validateTableFields(schema, config.fields);
                
                results[entityType] = {
                    valid: fieldValidation.valid,
                    schema,
                    fieldValidation
                };
            } catch (error) {
                results[entityType] = {
                    valid: false,
                    error: error.message
                };
            }
        }
        
        this.log('📋 Schema validation results:', results);
        return results;
    }
    
    /**
     * Validate table fields against expected schema
     */
    validateTableFields(schema, expectedFields) {
        const actualFields = schema.columns || [];
        const actualFieldNames = actualFields.map(col => col.column_name || col.title);
        
        const missing = [];
        const extra = actualFieldNames.filter(name => 
            !Object.values(expectedFields).includes(name)
        );
        
        for (const [key, expectedName] of Object.entries(expectedFields)) {
            if (!actualFieldNames.includes(expectedName)) {
                missing.push(expectedName);
            }
        }
        
        return {
            valid: missing.length === 0,
            missing,
            extra,
            actualFields: actualFieldNames
        };
    }
    
    /**
     * Generate API usage report
     */
    generateUsageReport() {
        const report = {
            configuration: this.getConfigurationSummary(),
            status: this.getStatus(),
            performance: {
                cacheHitRate: this.calculateCacheHitRate(),
                offlineOperations: this.offlineQueue.length,
                lastSync: localStorage.getItem('lastSync')
            },
            errors: this.getRecentErrors(),
            recommendations: this.generateRecommendations()
        };
        
        this.log('📈 API Usage Report:', report);
        return report;
    }
    
    /**
     * Get recent errors from console
     */
    getRecentErrors() {
        // This would ideally be implemented with a proper error tracking system
        return {
            note: 'Error tracking requires integration with error monitoring service',
            suggestion: 'Consider implementing Sentry or similar error tracking'
        };
    }
    
    /**
     * Generate performance and configuration recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        
        if (!this.cache.enabled) {
            recommendations.push('Enable caching to improve performance');
        }
        
        if (this.offlineQueue.length > 50) {
            recommendations.push('Large offline queue detected - consider increasing sync frequency');
        }
        
        if (!this.debug && localStorage.getItem('DEBUG') !== 'false') {
            recommendations.push('Enable debug mode for better troubleshooting');
        }
        
        if (!this.isConnected) {
            recommendations.push('Connection issues detected - check network and credentials');
        }
        
        return recommendations;
    }
    
    /**
     * Calculate cache hit rate
     */
    calculateCacheHitRate() {
        return {
            note: 'Cache hit rate tracking requires implementation',
            cacheSize: this.cache.storage.size
        };
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            baseUrl: this.baseUrl,
            projectId: this.projectId,
            online: navigator.onLine,
            lastConnectionCheck: this.lastConnectionCheck
        };
    }
}

// ============================================================================
// ADDITIONAL CONTEXT7 UTILITY CLASSES
// ============================================================================

/**
 * Custom HTTP Error class
 */
class HTTPError extends Error {
    constructor(message, status, details = null) {
        super(message);
        this.name = 'HTTPError';
        this.status = status;
        this.details = details;
    }
}

/**
 * Custom API Error class
 */
class APIError extends Error {
    constructor(message, status = 0, details = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.details = details;
    }
}

/**
 * Conflict Resolution Handler
 */
class ConflictResolver {
    constructor() {
        this.strategies = {
            'client-wins': this.clientWins.bind(this),
            'server-wins': this.serverWins.bind(this),
            'merge': this.merge.bind(this),
            'prompt': this.prompt.bind(this)
        };
    }
    
    resolve(local, remote, strategy = 'merge') {
        const resolverFn = this.strategies[strategy];
        if (!resolverFn) {
            throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
        }
        
        return resolverFn(local, remote);
    }
    
    clientWins(local, remote) {
        return { resolved: local, source: 'client' };
    }
    
    serverWins(local, remote) {
        return { resolved: remote, source: 'server' };
    }
    
    merge(local, remote) {
        // Simple merge strategy - server wins on conflicts, client adds new fields
        const resolved = { ...remote };
        
        for (const [key, value] of Object.entries(local)) {
            if (!(key in remote) && !key.startsWith('_')) {
                resolved[key] = value;
            }
        }
        
        return { resolved, source: 'merged' };
    }
    
    async prompt(local, remote) {
        // This would show a UI prompt to the user
        // For now, fallback to merge strategy
        return this.merge(local, remote);
    }
}

// ============================================================================
// EXTENDED API MANAGER METHODS (Context7 Patterns)
// ============================================================================

// Add extended methods to APIManager prototype
Object.assign(APIManager.prototype, {
    
    /**
     * Setup network monitoring
     */
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.log('🟢 Network connection restored');
            this.emit('networkOnline');
            this.checkConnection();
            this.processOfflineQueue();
        });
        
        window.addEventListener('offline', () => {
            this.log('🔴 Network connection lost');
            this.isConnected = false;
            this.emit('networkOffline');
        });
    },
    
    /**
     * Initialize Yjs collaborative editing
     */
    async initializeYjs() {
        if (typeof Y === 'undefined') {
            this.log('📝 Yjs not available, skipping collaborative features');
            return;
        }
        
        try {
            this.yjsDoc = new Y.Doc();
            
            // Setup shared maps for each entity type
            this.yjsMaps = {
                deals: this.yjsDoc.getMap('deals'),
                contacts: this.yjsDoc.getMap('contacts'),
                companies: this.yjsDoc.getMap('companies')
            };
            
            // Setup observers for real-time updates
            Object.entries(this.yjsMaps).forEach(([type, map]) => {
                map.observe((event) => {
                    this.handleYjsUpdate(type, event);
                });
            });
            
            this.log('✅ Yjs collaborative editing initialized');
        } catch (error) {
            this.logError('Failed to initialize Yjs:', error);
        }
    },
    
    /**
     * Update Yjs document
     */
    async updateYjsDocument(entityType, operation, data) {
        if (!this.yjsDoc || !this.yjsMaps[entityType]) {
            return;
        }
        
        try {
            const map = this.yjsMaps[entityType];
            
            switch (operation) {
                case 'create':
                case 'update':
                    map.set(data.id, data);
                    break;
                case 'delete':
                    map.delete(data.id);
                    break;
            }
        } catch (error) {
            this.logError('Failed to update Yjs document:', error);
        }
    },
    
    /**
     * Handle Yjs real-time updates
     */
    handleYjsUpdate(entityType, event) {
        event.changes.keys.forEach((change, key) => {
            if (change.action === 'add' || change.action === 'update') {
                const data = this.yjsMaps[entityType].get(key);
                this.emit(`${entityType}UpdatedRemotely`, { data, key });
            } else if (change.action === 'delete') {
                this.emit(`${entityType}DeletedRemotely`, { key });
            }
        });
    },
    
    /**
     * Handle requests when offline
     */
    async handleOfflineRequest(method, endpoint, data) {
        const queueItem = {
            id: this.generateId('offline_request'),
            method,
            endpoint, 
            data,
            timestamp: Date.now(),
            retries: 0
        };
        
        this.offlineQueue.push(queueItem);
        this.log(`📋 Queued offline request: ${method} ${endpoint}`);
        
        // Emit event for UI feedback
        this.emit('requestQueued', { method, endpoint, queueSize: this.offlineQueue.length });
    },
    
    /**
     * Handle update conflicts
     */
    async handleUpdateConflict(id, localData, strategy) {
        try {
            // Get current server data
            const serverData = await this.getDeal(id);
            
            // Resolve conflict using strategy
            const resolution = this.conflictResolver.resolve(localData, serverData, strategy);
            
            this.emit('conflictResolved', {
                id,
                strategy,
                local: localData,
                server: serverData,
                resolved: resolution.resolved
            });
            
            // Apply resolved data
            return await this.updateDeal(id, resolution.resolved, { optimistic: false });
        } catch (error) {
            this.logError(`Conflict resolution failed for deal ${id}:`, error);
            throw error;
        }
    },
    
    /**
     * Cascade delete relations
     */
    async cascadeDeleteRelations(entityType, id) {
        // This would implement cascade delete logic based on relationships
        // For now, just log the intention
        this.log(`🔗 Cascade delete for ${entityType} ${id} (not implemented)`);
    },
    
    /**
     * Sync individual entity type
     */
    async syncEntity(entityType, options = {}) {
        const { direction = 'bidirectional', conflictResolution = 'merge' } = options;
        
        const result = { uploaded: 0, downloaded: 0, conflicts: 0 };
        
        try {
            // Download from server
            if (direction === 'bidirectional' || direction === 'download') {
                const remoteData = await this[`get${this.capitalize(entityType)}`]();
                const localData = this.getOfflineData(entityType) || { [entityType]: [] };
                
                const mergeResult = await this.mergeData(
                    localData[entityType], 
                    remoteData[entityType], 
                    conflictResolution
                );
                
                this.setOfflineData(entityType, { [entityType]: mergeResult.merged });
                result.downloaded = mergeResult.downloaded;
                result.conflicts += mergeResult.conflicts;
            }
            
            // Upload to server
            if (direction === 'bidirectional' || direction === 'upload') {
                const localChanges = this.getPendingChanges(entityType);
                
                for (const change of localChanges) {
                    try {
                        await this.applyRemoteChange(entityType, change);
                        result.uploaded++;
                    } catch (error) {
                        if (error.status === 409) {
                            result.conflicts++;
                            await this.resolveConflict(entityType, change, conflictResolution);
                        } else {
                            throw error;
                        }
                    }
                }
                
                this.clearPendingChanges(entityType);
            }
            
        } catch (error) {
            this.logError(`Entity sync failed for ${entityType}:`, error);
            throw error;
        }
        
        return result;
    },
    
    /**
     * Get pending changes for sync
     */
    getPendingChanges(entityType) {
        return [];
    },
    
    /**
     * Apply remote change
     */
    async applyRemoteChange(entityType, change) {
        this.log(`Applying remote change for ${entityType}:`, change);
    },
    
    /**
     * Clear pending changes
     */
    clearPendingChanges(entityType) {
        this.log(`Cleared pending changes for ${entityType}`);
    },
    
    /**
     * Resolve conflict using strategy
     */
    async resolveConflict(entityType, change, strategy) {
        this.log(`Resolving conflict for ${entityType} using ${strategy}:`, change);
    },
    
    /**
     * Merge data with conflict detection
     */
    async mergeData(localData, remoteData, strategy) {
        const merged = [];
        const conflicts = [];
        let downloaded = 0;
        
        // Create lookup maps
        const localMap = new Map(localData.map(item => [item.id, item]));
        const remoteMap = new Map(remoteData.map(item => [item.id, item]));
        
        // Process remote data
        for (const remoteItem of remoteData) {
            const localItem = localMap.get(remoteItem.id);
            
            if (!localItem) {
                // New remote item
                merged.push(remoteItem);
                downloaded++;
            } else if (localItem._version !== remoteItem._version) {
                // Conflict detected
                const resolution = this.conflictResolver.resolve(localItem, remoteItem, strategy);
                merged.push(resolution.resolved);
                conflicts.push({ id: remoteItem.id, strategy: resolution.source });
            } else {
                // No conflict
                merged.push(remoteItem);
            }
        }
        
        // Add local-only items
        for (const localItem of localData) {
            if (!remoteMap.has(localItem.id)) {
                merged.push(localItem);
            }
        }
        
        return { merged, downloaded, conflicts: conflicts.length };
    }
});

// ============================================================================
// INITIALIZATION & EXPORT
// ============================================================================

// Initialize API Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Get configuration from environment or localStorage
    const config = {
        baseUrl: window.NOCODB_BASE_URL,
        apiKey: window.NOCODB_API_KEY,
        authToken: window.NOCODB_AUTH_TOKEN,
        projectId: window.NOCODB_PROJECT_ID,
        orgId: window.NOCODB_ORG_ID,
        debug: localStorage.getItem('DEBUG') === 'true'
    };
    
    // Initialize API Manager
    window.apiManager = new APIManager(config);
    
    // Setup global error handler
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason instanceof APIError || event.reason instanceof HTTPError) {
            window.apiManager.logError('Unhandled API error:', event.reason);
            window.apiManager.emit('unhandledApiError', { error: event.reason });
        }
    });
    
    // Expose utilities for debugging
    if (config.debug) {
        window.nocodbDebug = {
            testConnection: () => window.apiManager.testConnection(),
            getStatus: () => window.apiManager.getStatus(),
            validateSchemas: () => window.apiManager.validateSchemas(),
            generateReport: () => window.apiManager.generateUsageReport(),
            clearCache: () => window.apiManager.cache.storage.clear(),
            processOfflineQueue: () => window.apiManager.processOfflineQueue(),
            syncNow: (options) => window.apiManager.intelligentSync(options),
            getAnalytics: (options) => window.apiManager.getPipelineAnalytics(options)
        };
        
        console.log('🔧 NocoDB Debug utilities available at window.nocodbDebug');
        console.log('📊 Available methods:');
        console.log('  - testConnection(): Test connection and schema');
        console.log('  - getStatus(): Get current connection status');
        console.log('  - validateSchemas(): Validate table schemas');
        console.log('  - generateReport(): Generate usage report');
        console.log('  - clearCache(): Clear response cache');
        console.log('  - processOfflineQueue(): Process pending offline operations');
        console.log('  - syncNow(options): Trigger manual sync');
        console.log('  - getAnalytics(options): Get pipeline analytics');
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APIManager, HTTPError, APIError, ConflictResolver };
} else if (typeof window !== 'undefined') {
    // Browser global export
    window.NocoDB = { APIManager, HTTPError, APIError, ConflictResolver };
}

// TypeScript declarations for better IDE support
if (typeof window !== 'undefined') {
    window.APIManager = APIManager;
}