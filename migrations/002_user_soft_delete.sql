-- ============================================================
-- USER SOFT DELETE MIGRATION
-- ============================================================
-- Bu migration users-permissions.user tablosuna soft delete
-- ve JWT invalidation alanları ekler.
-- ============================================================

-- Strapi users-permissions.user tablosu: up_users
-- NOT: Strapi tablolarına direkt ALTER yapmak riskli olabilir.
-- Bu migration SADECE yeni alanlar ekler, mevcut yapıya dokunmaz.

-- 1) Soft Delete Fields
ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'deleted', 'deleted_pending_purge', 'purged'));

ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS deleted_by BIGINT;

-- 2) Erasure Request Fields (GDPR compliance)
ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS erasure_requested_at TIMESTAMPTZ;

ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS erasure_due_at TIMESTAMPTZ;

ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- 3) JWT Invalidation Field
-- tokenVersion: Her increment, eski JWT'leri geçersiz kılar
ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

-- 4) Recent Auth Timestamp (re-auth kontrolü için)
ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS last_auth_at TIMESTAMPTZ;

-- 5) Delete Confirmation Token Fields
-- Token hash'lenerek saklanır (güvenlik için)
ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS delete_confirm_token_hash TEXT;

ALTER TABLE public.up_users
ADD COLUMN IF NOT EXISTS delete_confirm_token_expires_at TIMESTAMPTZ;

-- 6) INDEXES
CREATE INDEX IF NOT EXISTS up_users_status_idx
  ON public.up_users (status)
  WHERE status != 'active';

CREATE INDEX IF NOT EXISTS up_users_erasure_due_idx
  ON public.up_users (erasure_due_at)
  WHERE erasure_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS up_users_anonymized_idx
  ON public.up_users (anonymized_at)
  WHERE anonymized_at IS NOT NULL AND status = 'deleted_pending_purge';

-- 7) VIEW: Active users only
-- Uygulamanın normal sorgularında kullanılabilir
CREATE OR REPLACE VIEW public.up_users_active AS
SELECT *
FROM public.up_users
WHERE status = 'active';

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON COLUMN public.up_users.status IS 'User status: active, deleted, deleted_pending_purge';
COMMENT ON COLUMN public.up_users.deleted_at IS 'Timestamp when user confirmed deletion';
COMMENT ON COLUMN public.up_users.deleted_by IS 'ID of admin/user who initiated deletion';
COMMENT ON COLUMN public.up_users.erasure_requested_at IS 'GDPR: When erasure was requested';
COMMENT ON COLUMN public.up_users.erasure_due_at IS 'GDPR: Deadline for data erasure (usually +30 days)';
COMMENT ON COLUMN public.up_users.anonymized_at IS 'When PII was scrubbed from user record';
COMMENT ON COLUMN public.up_users.token_version IS 'JWT invalidation counter - increment to invalidate all tokens';
COMMENT ON COLUMN public.up_users.last_auth_at IS 'Last successful authentication timestamp';

