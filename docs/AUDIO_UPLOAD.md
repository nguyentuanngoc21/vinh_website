# Audio upload deployment

The web accepts up to 50 MiB (52,428,800 bytes) for MP3, M4A, WAV and OGG.
Both `/audio/new` and chapter recording request a signed upload token, send
the file directly to Supabase Storage, then submit JSON metadata to Vercel.
Confirmation reads Storage metadata to check existence, size and MIME type.
No audio bytes pass through the Vercel function.

## Release steps

1. Apply `migrations/20261011_audio_upload_limits.sql` to dev/staging.
2. Check Supabase Storage Settings: Global file size limit must be at least
   52,428,800 bytes. The migration sets the bucket limit and MIME restrictions;
   it cannot change this global setting.
3. Test both web forms with small audio, 5–10 MiB audio, and a valid file near
   50 MiB. Confirm the audio plays after publishing. Files above 50 MiB must
   be rejected. Test a disconnected network: the submit button must recover.
4. In browser Network, the upload request must target Supabase, while
   `/api/audio/upload-url`, `/api/audio`, and chapter `/audio/record` receive
   only small JSON bodies. A Vercel 413 indicates an old client/deployment
   or another upload flow still sending the binary file through Vercel.
5. After staging passes, apply the same bucket migration and verify the global
   setting on production. Deploy all changed routes, forms and shared helpers
   together. Reload the browser and repeat a 5–10 MiB upload on production.

TUS resumable upload is a separate reliability improvement. This release
uses `uploadToSignedUrl`; interrupted uploads require a retry.
MIME validation checks Storage metadata, not the contents of the audio file.
