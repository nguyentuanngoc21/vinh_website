import { publicMobileResponse } from '@/lib/mobile/response';
import { getAgreement } from '@/lib/legal/registry';
import { AGREEMENT_PARTY_INFO } from '@/lib/legal/contract-parties';
export { OPTIONS } from '@/lib/mobile/response';

// Only the documents a guest must accept at sign-up (same as the web's LegalLink "terms"/"privacy").
// Documents with party blanks stay behind /api/mobile/agreements, which requires sign-in.
const PUBLIC_DOCS = new Set(['dieu-khoan-su-dung', 'chinh-sach-bao-mat']);
export function GET(_request: Request, context: { params: Promise<{ docId: string }> }) {
  return publicMobileResponse(async () => {
    const { docId } = await context.params;
    const agreement = PUBLIC_DOCS.has(docId) ? getAgreement(docId) : undefined;
    if (!agreement || AGREEMENT_PARTY_INFO[agreement.id]) return Response.json({ error: 'Không tìm thấy văn bản.' }, { status: 404 });
    return Response.json({ id: agreement.id, name: agreement.name, version: agreement.updatedAt, html: agreement.html });
  });
}
