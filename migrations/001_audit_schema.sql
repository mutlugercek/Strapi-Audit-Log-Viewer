-- ============================================================
-- AUDIT SCHEMA MIGRATION
-- ============================================================
-- Bu migration audit sistemi için gerekli tabloları oluşturur:
-- 1. audit schema
-- 2. Partitioned audit_log table (aylık partition)
-- 3. Bucket table (bruteforce/spam koruması)
-- 4. Hot view (son 90 gün)
-- 5. Index'ler
-- ============================================================

-- 1) AUDIT SCHEMA
CREATE SCHEMA IF NOT EXISTS audit;

-- 2) PARENT TABLE (Partitioned by ts - RANGE)
CREATE TABLE IF NOT EXISTS audit.audit_log (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type    TEXT NOT NULL,                 -- 'user' | 'admin' | 'system' | 'anonymous'
  actor_id      BIGINT,                        -- user/admin id (PII değil)
  action        TEXT NOT NULL,                 -- enum gibi kullanın
  result        TEXT NOT NULL,                 -- 'success' | 'fail'
  reason_code   TEXT,                          -- 'WRONG_PASSWORD', 'POLICY', ...
  target_type   TEXT,                          -- 'user','coachProfile',...
  target_id     BIGINT,
  request_id    UUID,                          -- Next.js'ten gelir
  ip_hash       BYTEA,                         -- sha256 (IP gizliliği için)
  ua            TEXT,                          -- User-Agent (truncated 300 char)
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  sig           BYTEA,                         -- HMAC/sha256 imza (tamper detection)
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

-- Meta size limit (2KB max)
ALTER TABLE audit.audit_log
  ADD CONSTRAINT audit_meta_size CHECK (pg_column_size(meta) <= 2048);

-- 3) INITIAL PARTITIONS (Mevcut ay + sonraki 2 ay)
-- NOT: Production'da partition management cron job ile yapılacak
DO $$
DECLARE
  current_month DATE := date_trunc('month', CURRENT_DATE);
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  FOR i IN 0..2 LOOP
    start_date := current_month + (i || ' months')::interval;
    end_date := start_date + '1 month'::interval;
    partition_name := 'audit_log_' || to_char(start_date, 'YYYY_MM');
    
    -- Partition zaten varsa skip
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'audit' AND tablename = partition_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE audit.%I PARTITION OF audit.audit_log FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_date,
        end_date
      );
      RAISE NOTICE 'Created partition: audit.%', partition_name;
    END IF;
  END LOOP;
END $$;

-- 4) INDEXES (Partitioned)
-- BRIN index for time-series queries (efficient for large tables)
CREATE INDEX IF NOT EXISTS audit_log_ts_brin
  ON audit.audit_log USING BRIN (ts);

-- B-tree indexes for selective queries
CREATE INDEX IF NOT EXISTS audit_log_action_ts
  ON audit.audit_log (action, ts DESC);

CREATE INDEX IF NOT EXISTS audit_log_actor_ts
  ON audit.audit_log (actor_id, ts DESC)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_target_ts
  ON audit.audit_log (target_type, target_id, ts DESC)
  WHERE target_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_request_id
  ON audit.audit_log (request_id)
  WHERE request_id IS NOT NULL;

-- 5) HOT VIEW (Son 90 gün - hızlı sorgu için)
CREATE OR REPLACE VIEW audit.audit_log_hot AS
SELECT *
FROM audit.audit_log
WHERE ts >= now() - interval '90 days';

-- 6) BUCKET TABLE (Bruteforce/spam koruması)
-- Login fail gibi yoğun olayları bucket'layarak audit şişmesini önler
CREATE TABLE IF NOT EXISTS audit.audit_bucket (
  window_start    TIMESTAMPTZ NOT NULL,
  action          TEXT NOT NULL,                 -- 'LOGIN_FAIL_BUCKETED'
  ip_hash         BYTEA,
  identifier_hash BYTEA,                         -- sha256(email+SALT)
  count           INT NOT NULL DEFAULT 1,
  first_ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (window_start, action, ip_hash, identifier_hash)
);

-- Bucket cleanup index
CREATE INDEX IF NOT EXISTS audit_bucket_window_idx
  ON audit.audit_bucket (window_start);

-- 7) PARTITION MANAGEMENT LOG
-- Partition oluşturma/silme işlemlerini takip eder
CREATE TABLE IF NOT EXISTS audit.partition_log (
  id            SERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  operation     TEXT NOT NULL,                 -- 'CREATE' | 'DROP'
  partition_name TEXT NOT NULL,
  details       JSONB DEFAULT '{}'::jsonb
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Partition adı üretme fonksiyonu
CREATE OR REPLACE FUNCTION audit.get_partition_name(target_date DATE)
RETURNS TEXT AS $$
BEGIN
  RETURN 'audit_log_' || to_char(target_date, 'YYYY_MM');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Partition oluşturma fonksiyonu
CREATE OR REPLACE FUNCTION audit.ensure_partition(target_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  start_date := date_trunc('month', target_date);
  end_date := start_date + '1 month'::interval;
  partition_name := audit.get_partition_name(target_date);
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'audit' AND tablename = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE audit.%I PARTITION OF audit.audit_log FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      start_date,
      end_date
    );
    
    INSERT INTO audit.partition_log (operation, partition_name, details)
    VALUES ('CREATE', partition_name, jsonb_build_object('start_date', start_date, 'end_date', end_date));
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Eski partition silme fonksiyonu (retention policy)
CREATE OR REPLACE FUNCTION audit.drop_old_partitions(retention_months INT DEFAULT 24)
RETURNS INT AS $$
DECLARE
  partition_rec RECORD;
  dropped_count INT := 0;
  cutoff_date DATE;
BEGIN
  cutoff_date := date_trunc('month', CURRENT_DATE) - (retention_months || ' months')::interval;
  
  FOR partition_rec IN
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'audit' 
      AND tablename LIKE 'audit_log_%'
      AND tablename != 'audit_log'
    ORDER BY tablename
  LOOP
    -- Partition adından tarih çıkar: audit_log_YYYY_MM
    DECLARE
      partition_date DATE;
    BEGIN
      partition_date := to_date(
        substring(partition_rec.tablename from 'audit_log_(\d{4}_\d{2})'),
        'YYYY_MM'
      );
      
      IF partition_date < cutoff_date THEN
        EXECUTE format('DROP TABLE audit.%I', partition_rec.tablename);
        
        INSERT INTO audit.partition_log (operation, partition_name, details)
        VALUES ('DROP', partition_rec.tablename, jsonb_build_object('cutoff_date', cutoff_date));
        
        dropped_count := dropped_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Geçersiz partition adı, skip
      NULL;
    END;
  END LOOP;
  
  RETURN dropped_count;
END;
$$ LANGUAGE plpgsql;

-- Bucket flush fonksiyonu (bucket → audit_log)
CREATE OR REPLACE FUNCTION audit.flush_buckets(older_than_minutes INT DEFAULT 10)
RETURNS INT AS $$
DECLARE
  flushed_count INT := 0;
  bucket_rec RECORD;
BEGIN
  FOR bucket_rec IN
    SELECT * FROM audit.audit_bucket
    WHERE window_start < now() - (older_than_minutes || ' minutes')::interval
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO audit.audit_log (
      ts, actor_type, action, result, ip_hash, meta
    ) VALUES (
      bucket_rec.last_ts,
      'anonymous',
      bucket_rec.action,
      'fail',
      bucket_rec.ip_hash,
      jsonb_build_object(
        'count', bucket_rec.count,
        'first_ts', bucket_rec.first_ts,
        'window_start', bucket_rec.window_start,
        'identifier_hash', encode(bucket_rec.identifier_hash, 'hex')
      )
    );
    
    DELETE FROM audit.audit_bucket
    WHERE window_start = bucket_rec.window_start
      AND action = bucket_rec.action
      AND ip_hash = bucket_rec.ip_hash
      AND identifier_hash = bucket_rec.identifier_hash;
    
    flushed_count := flushed_count + 1;
  END LOOP;
  
  RETURN flushed_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON SCHEMA audit IS 'Audit logging schema - isolated from main app data';
COMMENT ON TABLE audit.audit_log IS 'Partitioned audit log for critical events only';
COMMENT ON TABLE audit.audit_bucket IS 'Bucket table for high-frequency events (login fails, etc)';
COMMENT ON VIEW audit.audit_log_hot IS 'Last 90 days view for fast queries';
COMMENT ON FUNCTION audit.ensure_partition IS 'Creates partition for given month if not exists';
COMMENT ON FUNCTION audit.drop_old_partitions IS 'Drops partitions older than retention period';
COMMENT ON FUNCTION audit.flush_buckets IS 'Flushes bucket aggregates to audit_log';

