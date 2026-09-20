-- =============================================================================
-- Migration: Create notification_logs table for SMS and system notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_id TEXT,
  recipient_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_phone TEXT NOT NULL,
  recipient_role TEXT,
  message TEXT NOT NULL,
  provider TEXT DEFAULT 'msg91',
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Index for querying recent logs and recipient history
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_notification_logs_event ON notification_logs(event_type, event_id);

-- Duplicate prevention index (idempotency key for event_type, event_id, recipient_phone)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_logs_idempotency 
ON notification_logs(event_type, event_id, recipient_phone) 
WHERE status IN ('queued', 'sent');

-- Enable Row Level Security
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_notification_logs') THEN
    CREATE POLICY service_role_all_notification_logs ON notification_logs FOR ALL USING (true);
  END IF;
END $$;
