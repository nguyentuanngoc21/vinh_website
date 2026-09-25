import { getReadContext, requestError } from '@/lib/mobile/request-context';
import { publicMobileResponse } from '@/lib/mobile/response';
import { getBookRankings } from '@/lib/rankings/get-book-rankings';
export { OPTIONS } from '@/lib/mobile/response';

const TOP = 50; // the web ranks every published book and shows 7 at a time; the app needs far fewer
// Real "Truyện chữ" rankings of the web (tuần / tháng / quý / toàn thời gian). Audio/Blog tabs are still mock on the web.
export function GET(request: Request) {
  return publicMobileResponse(async () => {
    let auth;
    try { auth = await getReadContext(request); } catch (e) { return requestError(e); }
    const data = await getBookRankings(auth.client);
    return Response.json(Object.fromEntries(Object.entries(data).map(([period, value]) => [period, { ...value, list: value.list.slice(0, TOP) }])));
  });
}
