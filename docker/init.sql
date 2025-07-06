-- =========================================
-- CRM Database Schema for NocoDB
-- =========================================

-- Enable UUID extension for unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable timestamp functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =========================================
-- COMPANIES TABLE
-- =========================================

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    industry VARCHAR(100),
    size VARCHAR(50) CHECK (size IN ('1-10', '11-50', '51-200', '201-1000', '1000+')),
    annual_revenue DECIMAL(15,2),
    description TEXT,
    logo_url VARCHAR(500),
    
    -- Address information
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    
    -- Status and tracking
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect', 'archived')),
    source VARCHAR(100), -- How we found this company
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    
    -- Additional fields for NocoDB
    tags TEXT[], -- Array of tags
    custom_fields JSONB DEFAULT '{}'::jsonb -- Flexible custom fields
);

-- Companies indexes
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_created_at ON companies(created_at);
CREATE INDEX IF NOT EXISTS idx_companies_tags ON companies USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_companies_custom_fields ON companies USING GIN(custom_fields);

-- Companies updated_at trigger
CREATE OR REPLACE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- CONTACTS TABLE
-- =========================================

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    
    -- Personal information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    mobile VARCHAR(50),
    title VARCHAR(100), -- Job title
    department VARCHAR(100),
    
    -- Social and professional
    linkedin_url VARCHAR(255),
    twitter_handle VARCHAR(100),
    
    -- Contact preferences
    preferred_contact_method VARCHAR(50) DEFAULT 'email' CHECK (preferred_contact_method IN ('email', 'phone', 'mobile', 'linkedin')),
    timezone VARCHAR(50),
    
    -- Status and classification
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'unqualified', 'do_not_contact')),
    lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
    source VARCHAR(100), -- How we found this contact
    
    -- Important dates
    birthday DATE,
    last_contacted_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    
    -- Additional fields for NocoDB
    tags TEXT[], -- Array of tags
    notes TEXT,
    custom_fields JSONB DEFAULT '{}'::jsonb -- Flexible custom fields
);

-- Contacts indexes
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score ON contacts(lead_score);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_custom_fields ON contacts USING GIN(custom_fields);

-- Contacts updated_at trigger
CREATE OR REPLACE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- DEALS TABLE
-- =========================================

CREATE TABLE IF NOT EXISTS deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    primary_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    -- Deal information
    title VARCHAR(255) NOT NULL,
    description TEXT,
    value DECIMAL(15,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Sales process
    stage VARCHAR(100) NOT NULL DEFAULT 'prospecting' CHECK (stage IN (
        'prospecting', 'qualification', 'needs_analysis', 'proposal', 
        'negotiation', 'closed_won', 'closed_lost', 'on_hold'
    )),
    pipeline VARCHAR(100) DEFAULT 'default',
    probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
    
    -- Important dates
    expected_close_date DATE,
    actual_close_date DATE,
    
    -- Deal classification
    deal_type VARCHAR(100) DEFAULT 'new_business' CHECK (deal_type IN ('new_business', 'existing_business', 'renewal', 'upsell')),
    priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    source VARCHAR(100), -- How this deal originated
    
    -- Ownership and assignment
    owner_id VARCHAR(100), -- User ID of deal owner
    team VARCHAR(100),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'on_hold', 'archived')),
    loss_reason TEXT, -- Why the deal was lost
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    
    -- Additional fields for NocoDB
    tags TEXT[], -- Array of tags
    custom_fields JSONB DEFAULT '{}'::jsonb -- Flexible custom fields
);

-- Deals indexes
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals(primary_contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_owner_id ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_value ON deals(value);
CREATE INDEX IF NOT EXISTS idx_deals_expected_close_date ON deals(expected_close_date);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at);
CREATE INDEX IF NOT EXISTS idx_deals_tags ON deals USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_deals_custom_fields ON deals USING GIN(custom_fields);

-- Deals updated_at trigger
CREATE OR REPLACE TRIGGER update_deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- ACTIVITIES TABLE (for tracking interactions)
-- =========================================

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Activity details
    type VARCHAR(100) NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'task', 'note', 'demo', 'proposal_sent', 'contract_sent')),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Status and completion
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    outcome VARCHAR(100), -- Result of the activity
    
    -- Timing
    scheduled_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    
    -- Ownership
    created_by VARCHAR(100),
    assigned_to VARCHAR(100),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional fields
    custom_fields JSONB DEFAULT '{}'::jsonb
);

-- Activities indexes
CREATE INDEX IF NOT EXISTS idx_activities_deal_id ON activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_company_id ON activities(company_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_scheduled_at ON activities(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

-- Activities updated_at trigger
CREATE OR REPLACE TRIGGER update_activities_updated_at BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- SAMPLE DATA
-- =========================================

-- Insert sample companies
INSERT INTO companies (name, website, industry, size, annual_revenue, description, status, source, tags) VALUES
('TechCorp Solutions', 'https://techcorp.com', 'Technology', '51-200', 5000000.00, 'Leading provider of cloud-based software solutions for SMBs', 'active', 'website', ARRAY['technology', 'cloud', 'saas']),
('Green Energy Partners', 'https://greenenergy.com', 'Energy', '201-1000', 25000000.00, 'Renewable energy consulting and installation services', 'active', 'referral', ARRAY['energy', 'renewable', 'consulting']),
('Metro Healthcare Group', 'https://metrohealthcare.com', 'Healthcare', '1000+', 150000000.00, 'Multi-location healthcare provider specializing in primary care', 'prospect', 'cold_outreach', ARRAY['healthcare', 'primary_care', 'multi_location']),
('Artisan Coffee Co.', 'https://artisancoffee.com', 'Food & Beverage', '11-50', 2000000.00, 'Premium coffee roaster and distributor', 'active', 'trade_show', ARRAY['coffee', 'food_beverage', 'premium']);

-- Insert sample contacts
INSERT INTO contacts (company_id, first_name, last_name, email, phone, title, department, linkedin_url, status, lead_score, source, tags) VALUES
((SELECT id FROM companies WHERE name = 'TechCorp Solutions'), 'Sarah', 'Johnson', 'sarah.johnson@techcorp.com', '+1-555-0123', 'VP of Operations', 'Operations', 'https://linkedin.com/in/sarahjohnson', 'active', 85, 'website', ARRAY['decision_maker', 'operations']),
((SELECT id FROM companies WHERE name = 'TechCorp Solutions'), 'Mike', 'Chen', 'mike.chen@techcorp.com', '+1-555-0124', 'CTO', 'Technology', 'https://linkedin.com/in/mikechen', 'active', 90, 'website', ARRAY['technical_lead', 'decision_maker']),
((SELECT id FROM companies WHERE name = 'Green Energy Partners'), 'Emma', 'Williams', 'emma.williams@greenenergy.com', '+1-555-0125', 'Director of Business Development', 'Sales', 'https://linkedin.com/in/emmawilliams', 'active', 78, 'referral', ARRAY['sales', 'business_development']),
((SELECT id FROM companies WHERE name = 'Metro Healthcare Group'), 'Dr. James', 'Smith', 'james.smith@metrohealthcare.com', '+1-555-0126', 'Chief Medical Officer', 'Medical', 'https://linkedin.com/in/drjamessmith', 'active', 92, 'cold_outreach', ARRAY['medical', 'c_level']),
((SELECT id FROM companies WHERE name = 'Artisan Coffee Co.'), 'Lisa', 'Rodriguez', 'lisa.rodriguez@artisancoffee.com', '+1-555-0127', 'Operations Manager', 'Operations', 'https://linkedin.com/in/lisarodriguez', 'active', 70, 'trade_show', ARRAY['operations', 'coffee']);

-- Insert sample deals
INSERT INTO deals (company_id, primary_contact_id, title, description, value, stage, probability, expected_close_date, deal_type, priority, source, owner_id, tags) VALUES
(
    (SELECT id FROM companies WHERE name = 'TechCorp Solutions'), 
    (SELECT id FROM contacts WHERE email = 'sarah.johnson@techcorp.com'), 
    'Enterprise Software License', 
    'Annual license for our enterprise software suite including implementation and training', 
    45000.00, 
    'proposal', 
    75, 
    '2024-03-15', 
    'new_business', 
    'high', 
    'website', 
    'sales_rep_1', 
    ARRAY['enterprise', 'software', 'annual_license']
),
(
    (SELECT id FROM companies WHERE name = 'Green Energy Partners'), 
    (SELECT id FROM contacts WHERE email = 'emma.williams@greenenergy.com'), 
    'CRM System Implementation', 
    'Complete CRM system setup and customization for their sales team', 
    28000.00, 
    'negotiation', 
    80, 
    '2024-02-28', 
    'new_business', 
    'medium', 
    'referral', 
    'sales_rep_2', 
    ARRAY['crm', 'implementation', 'sales_team']
),
(
    (SELECT id FROM companies WHERE name = 'Metro Healthcare Group'), 
    (SELECT id FROM contacts WHERE email = 'james.smith@metrohealthcare.com'), 
    'Healthcare Data Analytics Platform', 
    'Multi-location patient data analytics and reporting solution', 
    125000.00, 
    'qualification', 
    60, 
    '2024-04-30', 
    'new_business', 
    'urgent', 
    'cold_outreach', 
    'sales_rep_1', 
    ARRAY['healthcare', 'analytics', 'multi_location']
),
(
    (SELECT id FROM companies WHERE name = 'Artisan Coffee Co.'), 
    (SELECT id FROM contacts WHERE email = 'lisa.rodriguez@artisancoffee.com'), 
    'Inventory Management System', 
    'Custom inventory management solution for coffee roasting operations', 
    15000.00, 
    'needs_analysis', 
    45, 
    '2024-03-30', 
    'new_business', 
    'medium', 
    'trade_show', 
    'sales_rep_3', 
    ARRAY['inventory', 'coffee', 'operations']
);

-- Insert sample activities
INSERT INTO activities (deal_id, contact_id, company_id, type, subject, description, status, outcome, scheduled_at, completed_at, duration_minutes, created_by, assigned_to) VALUES
(
    (SELECT id FROM deals WHERE title = 'Enterprise Software License'),
    (SELECT id FROM contacts WHERE email = 'sarah.johnson@techcorp.com'),
    (SELECT id FROM companies WHERE name = 'TechCorp Solutions'),
    'call',
    'Initial Discovery Call',
    'Discussed current software challenges and requirements',
    'completed',
    'positive_interested',
    '2024-01-15 10:00:00+00',
    '2024-01-15 10:45:00+00',
    45,
    'sales_rep_1',
    'sales_rep_1'
),
(
    (SELECT id FROM deals WHERE title = 'CRM System Implementation'),
    (SELECT id FROM contacts WHERE email = 'emma.williams@greenenergy.com'),
    (SELECT id FROM companies WHERE name = 'Green Energy Partners'),
    'demo',
    'CRM System Demo',
    'Demonstrated CRM capabilities and customization options',
    'completed',
    'very_positive',
    '2024-01-20 14:00:00+00',
    '2024-01-20 15:30:00+00',
    90,
    'sales_rep_2',
    'sales_rep_2'
),
(
    (SELECT id FROM deals WHERE title = 'Healthcare Data Analytics Platform'),
    (SELECT id FROM contacts WHERE email = 'james.smith@metrohealthcare.com'),
    (SELECT id FROM companies WHERE name = 'Metro Healthcare Group'),
    'meeting',
    'Requirements Gathering Session',
    'Scheduled meeting to discuss technical requirements and compliance needs',
    'planned',
    NULL,
    '2024-02-10 09:00:00+00',
    NULL,
    60,
    'sales_rep_1',
    'sales_rep_1'
);

-- =========================================
-- VIEWS FOR COMMON QUERIES
-- =========================================

-- Sales Pipeline View
CREATE OR REPLACE VIEW sales_pipeline AS
SELECT 
    d.id as deal_id,
    d.title as deal_title,
    d.value as deal_value,
    d.stage,
    d.probability,
    d.expected_close_date,
    c.name as company_name,
    c.industry,
    con.first_name || ' ' || con.last_name as primary_contact,
    con.email as contact_email,
    d.owner_id,
    d.created_at,
    d.tags as deal_tags
FROM deals d
LEFT JOIN companies c ON d.company_id = c.id
LEFT JOIN contacts con ON d.primary_contact_id = con.id
WHERE d.status = 'open'
ORDER BY d.value DESC, d.expected_close_date ASC;

-- Company Contact Summary View
CREATE OR REPLACE VIEW company_contacts AS
SELECT 
    c.id as company_id,
    c.name as company_name,
    c.industry,
    c.status as company_status,
    COUNT(con.id) as contact_count,
    COUNT(d.id) as deal_count,
    COALESCE(SUM(d.value), 0) as total_deal_value,
    MAX(d.expected_close_date) as next_close_date
FROM companies c
LEFT JOIN contacts con ON c.id = con.company_id
LEFT JOIN deals d ON c.id = d.company_id AND d.status = 'open'
GROUP BY c.id, c.name, c.industry, c.status
ORDER BY total_deal_value DESC;

-- =========================================
-- PERMISSIONS AND SECURITY
-- =========================================

-- Create CRM user if not exists (will be handled by environment variables)
-- This section is commented as PostgreSQL container will create the user via ENV vars
-- The POSTGRES_USER environment variable creates the user automatically

-- Grant necessary permissions to the CRM user (executed after user creation)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_user') THEN
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO crm_user;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO crm_user;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO crm_user;
        GRANT USAGE ON SCHEMA public TO crm_user;
        RAISE NOTICE 'Permissions granted to crm_user successfully';
    ELSE
        RAISE NOTICE 'User crm_user not found, permissions will be set by PostgreSQL container';
    END IF;
END
$$;

-- =========================================
-- COMPLETION MESSAGE
-- =========================================

SELECT 'CRM Database schema initialized successfully!' as message,
       'Tables created: companies, contacts, deals, activities' as tables,
       'Sample data loaded for testing' as sample_data,
       'Views created: sales_pipeline, company_contacts' as views;