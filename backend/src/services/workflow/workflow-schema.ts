/**
 * @fileoverview The workflow engine's tables, as additive and idempotent DDL.
 *
 * One list, used by the startup schema upgrade and by the tests, so the two
 * cannot drift. init.sql carries the same statements for fresh installs.
 *
 * @module services/workflow/workflow-schema
 */

interface Queryable {
  query: (sql: string) => Promise<unknown>;
}

export const WORKFLOW_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS workflow_definitions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL,
     name varchar(255) NOT NULL,
     description text,
     subject_type varchar(20) NOT NULL DEFAULT 'client'
       CHECK (subject_type IN ('client', 'project', 'invoice', 'none')),
     status varchar(20) NOT NULL DEFAULT 'draft'
       CHECK (status IN ('draft', 'active', 'paused', 'archived')),
     draft_graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
     published_version integer,
     created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_definitions_user ON workflow_definitions(user_id)`,

  // A published version never changes: runs keep executing the graph they started with.
  `CREATE TABLE IF NOT EXISTS workflow_versions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
     version integer NOT NULL,
     graph jsonb NOT NULL,
     permissions jsonb NOT NULL,
     created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     UNIQUE (definition_id, version)
   )`,

  `CREATE TABLE IF NOT EXISTS workflow_runs (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL,
     definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
     version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
     subject_type varchar(20) NOT NULL,
     subject_id uuid,
     subject_label varchar(255),
     period_start date,
     period_end date,
     status varchar(20) NOT NULL DEFAULT 'running'
       CHECK (status IN ('running', 'waiting', 'incident', 'completed', 'cancelled')),
     test_mode boolean NOT NULL DEFAULT false,
     started_by varchar(20) NOT NULL DEFAULT 'manual' CHECK (started_by IN ('manual', 'schedule')),
     context jsonb NOT NULL DEFAULT '{}'::jsonb,
     business_key varchar(255),
     result text,
     started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     ended_at timestamp with time zone,
     updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_runs_user ON workflow_runs(user_id, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_runs_definition ON workflow_runs(definition_id, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_runs_subject ON workflow_runs(subject_type, subject_id)
     WHERE subject_id IS NOT NULL`,
  // One run per flow, subject and period. Enforced here because a check-then-insert
  // lets a double click (or the scheduler racing a manual start) create two.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_runs_business_key
     ON workflow_runs(definition_id, business_key)
     WHERE business_key IS NOT NULL AND status <> 'cancelled'`,

  `CREATE TABLE IF NOT EXISTS workflow_steps (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
     node_id varchar(64) NOT NULL,
     node_type varchar(20) NOT NULL,
     status varchar(20) NOT NULL DEFAULT 'pending'
       CHECK (status IN ('pending', 'running', 'waiting', 'completed', 'failed', 'skipped', 'cancelled')),
     seq integer NOT NULL,
     attempt integer NOT NULL DEFAULT 1,
     input jsonb,
     output jsonb,
     outcome varchar(255),
     error text,
     error_code varchar(40),
     error_params jsonb,
     created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     started_at timestamp with time zone,
     finished_at timestamp with time zone
   )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps(run_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_steps_open ON workflow_steps(status)
     WHERE status IN ('pending', 'running')`,

  `CREATE TABLE IF NOT EXISTS workflow_tasks (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL,
     run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
     step_id uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
     node_id varchar(64) NOT NULL,
     kind varchar(20) NOT NULL CHECK (kind IN ('confirm', 'upload', 'form', 'approval', 'notice')),
     title varchar(500) NOT NULL,
     description text,
     payload jsonb NOT NULL DEFAULT '{}'::jsonb,
     status varchar(20) NOT NULL DEFAULT 'open'
       CHECK (status IN ('open', 'done', 'rejected', 'expired', 'cancelled')),
     due_at timestamp with time zone,
     result jsonb,
     created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
     completed_at timestamp with time zone
   )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_tasks_user_open ON workflow_tasks(user_id, due_at)
     WHERE status = 'open'`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_tasks_run ON workflow_tasks(run_id)`,

  `CREATE TABLE IF NOT EXISTS workflow_timers (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     kind varchar(20) NOT NULL CHECK (kind IN ('task_timeout', 'wait', 'schedule')),
     run_id uuid REFERENCES workflow_runs(id) ON DELETE CASCADE,
     step_id uuid REFERENCES workflow_steps(id) ON DELETE CASCADE,
     definition_id uuid REFERENCES workflow_definitions(id) ON DELETE CASCADE,
     due_at timestamp with time zone NOT NULL,
     fired_at timestamp with time zone,
     created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_timers_due ON workflow_timers(due_at) WHERE fired_at IS NULL`,
  // A flow has at most one pending scheduled start.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_timers_schedule ON workflow_timers(definition_id)
     WHERE kind = 'schedule' AND fired_at IS NULL`,

  // Client documents: timesheets as their own types, tied to a period and an invoice.
  `ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL`,
  `ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS period_start date`,
  `ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS period_end date`,
  `CREATE INDEX IF NOT EXISTS idx_client_documents_invoice ON client_documents(invoice_id) WHERE invoice_id IS NOT NULL`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'client_documents_document_type_check'
         AND pg_get_constraintdef(oid) LIKE '%timesheet_signed%'
     ) THEN
       ALTER TABLE client_documents DROP CONSTRAINT IF EXISTS client_documents_document_type_check;
       ALTER TABLE client_documents ADD CONSTRAINT client_documents_document_type_check
         CHECK (document_type IN ('contract', 'amendment', 'nda', 'offer', 'order', 'invoice_terms',
                                  'timesheet', 'timesheet_signed', 'other'));
     END IF;
   END $$`,
];

/** Creates the workflow tables and the client-document additions if they are missing. */
export async function ensureWorkflowSchema(db: Queryable): Promise<void> {
  for (const statement of WORKFLOW_SCHEMA_STATEMENTS) {
    await db.query(statement);
  }
}
