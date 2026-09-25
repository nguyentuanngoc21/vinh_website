import { POST as toggleFollow } from '@/app/api/authors/[authorId]/follow/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';
// Toggle, exactly like the web: returns { following }.
export function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  return mobileResponse(request, async () => toggleFollow(request, { params: Promise.resolve({ authorId: (await context.params).userId }) }));
}
