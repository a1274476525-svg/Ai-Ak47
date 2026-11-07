-- ============================================================
-- AI OS — Phase 5 additions: approvals, notifications, task steps, budget
-- Idempotent: safe to run against a fresh DB (also folded into init.sql)
-- or an already-running container via:
--   docker exec -i aios_postgres psql -U aios -d aios < infra/postgres/migrations/002_phase5_features.sql
-- ============================================================

-- ─────────────────────────────────────────
-- Pending Actions (human-in-the-loop approval gate)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_actions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type  VARCHAR(100) NOT NULL,   -- 'terminal_run', 'terminal_write', 'docker_restart', 'vscode_write', 'vscode_delete'
    summary      TEXT NOT NULL,           -- human-readable description shown to the approver
    payload      JSONB NOT NULL DEFAULT '{}',
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
    result       JSONB,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);

-- ─────────────────────────────────────────
-- Notifications (in-app)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type       VARCHAR(50) NOT NULL,      -- 'task_completed', 'task_failed', 'approval_requested'
    title      VARCHAR(255) NOT NULL,
    message    TEXT,
    task_id    UUID REFERENCES tasks(id) ON DELETE CASCADE,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_read    ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications(created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(task_id, step_index ASC);

-- ─────────────────────────────────────────
-- Budget Config (singleton row — global spend guardrail)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_config (
    id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    daily_limit_usd   NUMERIC(10, 2),     -- NULL = unlimited
    monthly_limit_usd NUMERIC(10, 2),     -- NULL = unlimited
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

DROP TRIGGER IF EXISTS trg_tasks_notify_completion ON tasks;
CREATE TRIGGER trg_tasks_notify_completion
    AFTER UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION notify_task_completion();
