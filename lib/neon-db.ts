import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "@/lib/env";
import { makeId, nowIso } from "@/lib/security";

declare global {
  // eslint-disable-next-line no-var
  var __simpleClawPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __simpleClawPgInitPromise: Promise<void> | undefined;
}

function getDatabaseUrl() {
  const neon = env.NEON_DATABASE_URL?.trim();
  if (neon) return neon;
  return env.DATABASE_URL?.trim() ?? "";
}

function getPool() {
  if (!globalThis.__simpleClawPgPool) {
    const connectionString = getDatabaseUrl();
    if (!connectionString) {
      throw new Error("NEON_DATABASE_URL or DATABASE_URL must be configured");
    }
    globalThis.__simpleClawPgPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: { rejectUnauthorized: false }
    });
  }
  return globalThis.__simpleClawPgPool;
}

async function ensureSchema() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      photo_url TEXT,
      current_deployment_id TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      model_provider TEXT,
      selected_model TEXT NOT NULL,
      channel TEXT NOT NULL,
      encrypted_channel_primary_token TEXT NOT NULL,
      encrypted_channel_secondary_token TEXT,
      encrypted_model_api_key TEXT,
      billing_interval TEXT,
      payment_provider TEXT,
      checkout_session_id TEXT,
      subscription_id TEXT,
      subscription_status TEXT,
      status TEXT NOT NULL,
      runtime_slot_id TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployment_events (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deployment_events_deployment_created ON deployment_events(deployment_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS deployment_jobs (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deployment_jobs_created ON deployment_jobs(created_at ASC);

    CREATE TABLE IF NOT EXISTS warm_slots (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      assigned_deployment_id TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_warm_slots_state ON warm_slots(state);

    CREATE TABLE IF NOT EXISTS usage (
      deployment_id TEXT PRIMARY KEY,
      limit_total DOUBLE PRECISION NOT NULL,
      limit_remaining DOUBLE PRECISION NOT NULL,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkout_sessions (
      session_id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      checkout_type TEXT NOT NULL,
      amount DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS openrouter_keys (
      deployment_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      key_id TEXT,
      key_hash TEXT,
      limit_usd DOUBLE PRECISION,
      limit_remaining DOUBLE PRECISION,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS x_connections (
      deployment_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      x_user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      name TEXT,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT,
      token_type TEXT NOT NULL,
      scope TEXT[] NOT NULL DEFAULT '{}',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS x_user_connections (
      user_id TEXT PRIMARY KEY,
      x_user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      name TEXT,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT,
      token_type TEXT NOT NULL,
      scope TEXT[] NOT NULL DEFAULT '{}',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS x_oauth_states (
      state TEXT PRIMARY KEY,
      deployment_id TEXT,
      user_id TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS x_action_logs (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      target_tweet_id TEXT,
      target_author_id TEXT,
      conversation_id TEXT,
      content_hash TEXT NOT NULL,
      content TEXT NOT NULL,
      reason TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_x_action_logs_deployment_created
      ON x_action_logs(deployment_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_x_action_logs_deployment_action_created
      ON x_action_logs(deployment_id, action_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_x_action_logs_reply_target
      ON x_action_logs(deployment_id, target_tweet_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_x_action_logs_reply_thread_author
      ON x_action_logs(deployment_id, conversation_id, target_author_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_x_action_logs_content_hash
      ON x_action_logs(deployment_id, action_type, content_hash, created_at DESC);

    CREATE TABLE IF NOT EXISTS brand_research_runs (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence_overall DOUBLE PRECISION,
      error TEXT,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_brand_research_runs_deployment_created
      ON brand_research_runs(deployment_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS brand_research_sources (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      url TEXT NOT NULL,
      domain TEXT,
      source_type TEXT NOT NULL,
      fetched_at TIMESTAMPTZ,
      title TEXT,
      excerpt TEXT,
      reliability_score DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_brand_research_sources_run_created
      ON brand_research_sources(run_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS brand_research_facts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      confidence_label TEXT NOT NULL,
      evidence_source_ids TEXT[] NOT NULL DEFAULT '{}',
      fact_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_brand_research_facts_run_created
      ON brand_research_facts(run_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS deployment_artifacts (
      deployment_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (deployment_id, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_deployment_artifacts_deployment ON deployment_artifacts(deployment_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_deployment_created ON chat_messages(deployment_id, created_at ASC);
  `);

  const warmSlotCountResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM warm_slots`
  );
  const warmSlotCount = warmSlotCountResult.rows[0]?.count ?? 0;
  if (warmSlotCount === 0) {
    for (let i = 0; i < env.WARM_POOL_SIZE; i += 1) {
      const id = makeId("slot");
      const current = nowIso();
      await pool.query(
        `INSERT INTO warm_slots (id, state, assigned_deployment_id, created_at, updated_at)
         VALUES ($1, 'warm_available', NULL, $2::timestamptz, $2::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [id, current]
      );
    }
  }
}

async function ensureReady() {
  if (!globalThis.__simpleClawPgInitPromise) {
    globalThis.__simpleClawPgInitPromise = ensureSchema();
  }
  return globalThis.__simpleClawPgInitPromise;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  await ensureReady();
  return getPool().query<T>(text, values);
}

export async function withDbClient<T>(fn: (client: PoolClient) => Promise<T>) {
  await ensureReady();
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
