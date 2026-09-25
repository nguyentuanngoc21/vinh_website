import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { getAgreement } from '@/lib/legal/registry';
import { AGREEMENT_PARTY_INFO } from '@/lib/legal/contract-parties';
import { fillPartyBlanksIntoHtml } from '@/lib/legal/fill-party-blanks';
import { GET as contractInfo } from '@/app/api/profile/contract-info/route';
export { OPTIONS } from '@/lib/mobile/response';
export function GET(request: Request, context: { params: Promise<{ agreementId: string }> }) {
  return mobileResponse(request, async () => {
    try { await getRequestContext(request); } catch (e) { return requestError(e); }
    const { agreementId } = await context.params;
    const agreement = getAgreement(agreementId);
    if (!agreement) return Response.json({ error: 'Không tìm thấy văn bản.' }, { status: 404 });
    let html = agreement.html;
    const missingFields: string[] = [];
    const spec = AGREEMENT_PARTY_INFO[agreement.id];
    if (spec) {
      const response = await contractInfo(request);
      if (!response.ok) return response;
      const info = await response.json();
      for (const field of spec.author ?? []) {
        if (!info[field.key]) missingFields.push(field.label);
        if (field.mergedWith && !info[field.mergedWith.key]) missingFields.push(field.mergedWith.label);
      }
      html = fillPartyBlanksIntoHtml(html, spec, { author: info, platform: info.platformParty });
    }
    return Response.json({ id: agreement.id, name: agreement.name, version: agreement.updatedAt, html, missingFields });
  });
}
