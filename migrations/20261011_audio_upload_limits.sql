-- Enforce the same 50 MiB/file limit as the web, including direct signed uploads.
-- Idempotent; does not change existing objects or RLS policies.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
      'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg'
    ]
where id = 'audio-narrations';

-- Notes: apply on dev/staging and verify uploads before production.
-- Storage Settings > Global file size limit must be at least 52428800 bytes.
-- This global setting cannot be changed by this SQL migration.
