import { getReadContext, requestError } from '@/lib/mobile/request-context';
import { publicMobileResponse } from '@/lib/mobile/response';
import { searchBooks } from '@/lib/search/search-books';
import { searchAudio } from '@/lib/search/search-audio';
import { searchDesign } from '@/lib/search/search-design';
export { OPTIONS } from '@/lib/mobile/response';

// Same three searches as the web /tim-kiem page (title or creator nickname). Audio results get a
// playable URL, which the web links to /audio instead of returning.
export function GET(request: Request) {
  return publicMobileResponse(async () => {
    let auth;
    try { auth = await getReadContext(request); } catch (e) { return requestError(e); }
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
    if (!q) return Response.json({ books: [], audio: [], designs: [] });
    const [books, audio, designs] = await Promise.all([searchBooks(auth.client, q), searchAudio(auth.client, q), searchDesign(auth.client, q)]);
    const ids = audio.map(a => a.id);
    const { data: files } = ids.length
      ? await auth.client.from('public_audio_narrations').select('id,audio_url').in('id', ids)
      : { data: [] as { id: string; audio_url: string }[] };
    const urlById = new Map((files ?? []).map(f => [f.id, auth.client.storage.from('audio-narrations').getPublicUrl(f.audio_url).data.publicUrl]));
    return Response.json({ books, designs, audio: audio.map(a => ({ ...a, audioUrl: urlById.get(a.id) ?? null })) });
  });
}
