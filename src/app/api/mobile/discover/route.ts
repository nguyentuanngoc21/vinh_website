import { getReadContext, requestError } from '@/lib/mobile/request-context';
import { publicMobileResponse } from '@/lib/mobile/response';
import { getHomepageData } from '@/lib/home/get-homepage-books';
import { getRecommendedBooks } from '@/lib/recommendations/get-recommended-books';
export { OPTIONS } from '@/lib/mobile/response';

// Home sections of the web (featured, newest, weekly ranking) plus "Gợi ý cho bạn" when signed in.
// Guests allowed; reads go through RLS like the web's createClient().
export function GET(request: Request) {
  return publicMobileResponse(async () => {
    let auth;
    try { auth = await getReadContext(request); } catch (e) { return requestError(e); }
    const [home, recommended] = await Promise.all([
      getHomepageData(auth.client),
      auth.userId ? getRecommendedBooks(auth.client, auth.userId) : Promise.resolve([]),
    ]);
    return Response.json({ ...home, recommended });
  });
}
