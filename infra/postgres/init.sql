-- ============================================================
-- AI OS — PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- AI Providers
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_providers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) UNIQUE NOT NULL,
    api_key_enc   TEXT,                          -- encrypted at app level
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    priority      SMALLINT NOT NULL DEFAULT 5,
    model_default VARCHAR(150),
    cost_per_1k   NUMERIC(10, 6) DEFAULT 0,
    rate_limit    INTEGER DEFAULT 1000,          -- requests per minute
    fallback_to   VARCHAR(100) REFERENCES ai_providers(name) ON DELETE SET NULL,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Projects
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    language    VARCHAR(100),
    framework   VARCHAR(100),
    repo_url    TEXT,
    status      VARCHAR(50) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'archived', 'completed')),
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Tasks (Autonomous + User-initiated)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    priority        SMALLINT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    origin          VARCHAR(50) NOT NULL DEFAULT 'user'
                        CHECK (origin IN ('user', 'autonomous', 'learning_engine', 'scheduled')),
    assigned_agent  VARCHAR(100),
    model_used      VARCHAR(100),
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    parent_task_id  UUID REFERENCES tasks(id) ON DELETE SET NULL,
    result          JSONB,
    error           TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_tasks_status   ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX idx_tasks_agent    ON tasks(assigned_agent);
CREATE INDEX idx_tasks_project  ON tasks(project_id);

-- ─────────────────────────────────────────
-- Agent Runs (execution log)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID REFERENCES tasks(id) ON DELETE SET NULL,
    agent_type   VARCHAR(100) NOT NULL,
    model_used   VARCHAR(100) NOT NULL,
    input        JSONB NOT NULL DEFAULT '{}',
    output       JSONB,
    status       VARCHAR(50) NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'success', 'failed', 'timeout')),
    tokens_in    INTEGER DEFAULT 0,
    tokens_out   INTEGER DEFAULT 0,
    cost_usd     NUMERIC(10, 6) DEFAULT 0,
    duration_ms  INTEGER,
    error        TEXT,
    metadata     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_runs_task      ON agent_runs(task_id);
CREATE INDEX idx_agent_runs_agent     ON agent_runs(agent_type);
CREATE INDEX idx_agent_runs_model     ON agent_runs(model_used);
CREATE INDEX idx_agent_runs_created   ON agent_runs(created_at DESC);

-- ─────────────────────────────────────────
-- Knowledge Items (Long-Term Memory)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic         VARCHAR(255) NOT NULL,
    content       TEXT NOT NULL,
    source        VARCHAR(500),
    source_type   VARCHAR(100)   -- 'docs', 'github', 'stackoverflow', 'arxiv', 'manual'
                      CHECK (source_type IN ('docs', 'github', 'stackoverflow', 'arxiv', 'web', 'manual', 'agent')),
    confidence    NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
    vector_id     UUID,          -- Qdrant point ID
    tags          TEXT[] NOT NULL DEFAULT '{}',
    language      VARCHAR(100),
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_topic    ON knowledge_items(topic);
CREATE INDEX idx_knowledge_tags     ON knowledge_items USING GIN(tags);
CREATE INDEX idx_knowledge_language ON knowledge_items(language);

-- ─────────────────────────────────────────
-- Code Patterns Library
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS code_patterns (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255) NOT NULL,
    language     VARCHAR(100) NOT NULL,
    framework    VARCHAR(100),
    category     VARCHAR(100),   -- 'auth', 'caching', 'error_handling', 'testing', etc.
    code         TEXT NOT NULL,
    description  TEXT,
    use_cases    TEXT[] NOT NULL DEFAULT '{}',
    tags         TEXT[] NOT NULL DEFAULT '{}',
    success_rate NUMERIC(4,3) DEFAULT NULL,
    used_count   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_code_patterns_lang     ON code_patterns(language);
CREATE INDEX idx_code_patterns_category ON code_patterns(category);
CREATE INDEX idx_code_patterns_tags     ON code_patterns USING GIN(tags);

-- ─────────────────────────────────────────
-- Skills (Tracked Knowledge Levels)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) UNIQUE NOT NULL,
    category        VARCHAR(100),   -- 'language', 'framework', 'concept', 'tool'
    level           NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 100),
    target_level    NUMERIC(5,2) NOT NULL DEFAULT 80 CHECK (target_level BETWEEN 0 AND 100),
    is_learning     BOOLEAN NOT NULL DEFAULT FALSE,
    priority        SMALLINT NOT NULL DEFAULT 5,
    last_assessed   TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Benchmarks (Model Performance Tracking)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmarks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type   VARCHAR(100) NOT NULL,
    model       VARCHAR(100) NOT NULL,
    score       NUMERIC(5,2),
    latency_ms  INTEGER,
    tokens_used INTEGER,
    cost_usd    NUMERIC(10,6),
    passed      BOOLEAN,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_benchmarks_model     ON benchmarks(model);
CREATE INDEX idx_benchmarks_task_type ON benchmarks(task_type);
CREATE INDEX idx_benchmarks_created   ON benchmarks(created_at DESC);

-- ─────────────────────────────────────────
-- Conversations (Chat History)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title      VARCHAR(500),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT NOT NULL,
    provider        VARCHAR(100),
    model           VARCHAR(100),
    tokens_in       INTEGER DEFAULT 0,
    tokens_out      INTEGER DEFAULT 0,
    cost_usd        NUMERIC(10,6) DEFAULT 0,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);

-- ─────────────────────────────────────────
-- Pending Actions (human-in-the-loop approval gate)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_actions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type  VARCHAR(100) NOT NULL,
    summary      TEXT NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
    result       JSONB,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at   TIMESTAMPTZ
);

CREATE INDEX idx_pending_actions_status ON pending_actions(status);

-- ─────────────────────────────────────────
-- Notifications (in-app)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type       VARCHAR(50) NOT NULL,
    title      VARCHAR(255) NOT NULL,
    message    TEXT,
    task_id    UUID REFERENCES tasks(id) ON DELETE CASCADE,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_read   ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ─────────────────────────────────────────
-- Task Steps (trace log for multi-step autonomous runs)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_steps (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    step_index SMALLINT NOT NULL,
    agent      VARCHAR(100),
    message    TEXT NOT NULL,
    status     VARCHAR(20) NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'success', 'failed')),
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_steps_task ON task_steps(task_id, step_index ASC);

-- ─────────────────────────────────────────
-- Budget Config (singleton row — global spend guardrail)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_config (
    id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    daily_limit_usd   NUMERIC(10, 2),
    monthly_limit_usd NUMERIC(10, 2),
    enabled           BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO budget_config (id, daily_limit_usd, monthly_limit_usd, enabled)
VALUES (1, NULL, NULL, FALSE)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────
-- Notify on task completion/failure (in-app notifications)
-- Fires regardless of which service (gateway TypeORM or ai-brain asyncpg)
-- updated the row — a single choke point for both write paths.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_task_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('completed', 'failed') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO notifications (type, title, message, task_id)
        VALUES (
            'task_' || NEW.status,
            CASE WHEN NEW.status = 'completed' THEN 'Task completed: ' || NEW.title
                 ELSE 'Task failed: ' || NEW.title END,
            NEW.error,
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_notify_completion
    AFTER UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION notify_task_completion();

-- ─────────────────────────────────────────
-- updated_at Auto-Update Trigger
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'ai_providers', 'projects', 'tasks',
        'knowledge_items', 'code_patterns', 'skills', 'conversations', 'budget_config'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
            t, t
        );
    END LOOP;
END;
$$;

-- ─────────────────────────────────────────
-- Seed: Default AI Providers
-- ─────────────────────────────────────────
INSERT INTO ai_providers (name, enabled, priority, model_default, cost_per_1k, rate_limit, fallback_to) VALUES
    ('claude',   TRUE,  1, 'claude-sonnet-4-6',      0.003,  1000, 'gpt'),
    ('gpt',      TRUE,  2, 'gpt-4o',                 0.005,  500,  'gemini'),
    ('gemini',   TRUE,  3, 'gemini-2.0-flash',       0.001,  1500, 'deepseek'),
    ('deepseek', TRUE,  4, 'deepseek-chat',           0.0005, 2000, 'mistral'),
    ('mistral',  TRUE,  5, 'mistral-large-latest',   0.002,  1000, 'llama'),
    ('llama',    FALSE, 6, 'llama3.2',               0.0,    9999, NULL),
    ('grok',     FALSE, 7, 'grok-2-latest',          0.010,  200,  NULL)
ON CONFLICT (name) DO NOTHING;

-- Seed: Core Skills
INSERT INTO skills (name, category, level, target_level, priority) VALUES
    ('Python',     'language',  90, 95, 10),
    ('TypeScript', 'language',  85, 95, 10),
    ('LangGraph',  'framework', 70, 90, 9),
    ('LangChain',  'framework', 75, 90, 9),
    ('NestJS',     'framework', 80, 90, 8),
    ('Next.js',    'framework', 75, 85, 7),
    ('PostgreSQL', 'tool',      80, 90, 8),
    ('Redis',      'tool',      75, 85, 7),
    ('Docker',     'tool',      80, 90, 8),
    ('Qdrant',     'tool',      40, 80, 6)
ON CONFLICT (name) DO NOTHING;
