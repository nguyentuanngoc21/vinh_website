import { POST as extractManuscript } from '@/app/api/authoring/manuscripts/extract/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';

// Multipart { file: .docx ≤ 4 MB } → { text, headingChapters }. The web route verifies the Bearer
// token itself (getUserContext); the request is passed through unchanged (only a file field is read).
export function POST(request: Request) {
  return mobileResponse(request, () => extractManuscript(request));
}
