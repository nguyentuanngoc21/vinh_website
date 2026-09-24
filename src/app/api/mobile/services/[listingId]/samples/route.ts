import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { POST as upload } from '@/app/api/profile/services/[listingId]/samples/route';
export { OPTIONS } from '@/lib/mobile/response';
type Context = { params: Promise<{ listingId: string }> };
export function POST(request: Request, context: Context) {
  return mobileResponse(request, () => upload(request, context));
}
export function GET(request: Request, context: Context) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (error) { return requestError(error); }
    const { client, userId } = auth;
    const { listingId } = await context.params;
    const { data: listing, error: listingError } = await client.from('service_listings').select('id,service_type')
      .eq('id', listingId).eq('seller_id', userId!).maybeSingle();
    if (listingError) return Response.json({ error: 'Không tải được dịch vụ.' }, { status: 503 });
    if (!listing) return Response.json({ error: 'Không tìm thấy dịch vụ.' }, { status: 404 });
    const { data, error } = await client.from('service_samples').select('id,file_url,source,unverified_external')
      .eq('listing_id', listingId).order('created_at', { ascending: false });
    if (error) return Response.json({ error: 'Không tải được mẫu sản phẩm.' }, { status: 503 });
    const bucket = listing.service_type === 'voice' ? 'audio-narrations' : 'design-images';
    const samples = await Promise.all((data ?? []).map(async sample => {
      let url: string | null = null;
      if (sample.file_url && sample.source === 'upload' && !/^https?:/i.test(sample.file_url)) {
        const result = await client.storage.from(bucket).createSignedUrl(sample.file_url, 900);
        if (!result.error) url = result.data?.signedUrl ?? null;
      } else if (sample.file_url?.startsWith('https://')) url = sample.file_url;
      return { id: sample.id, source: sample.source, unverified_external: sample.unverified_external, url };
    }));
    return Response.json({ samples });
  });
}
