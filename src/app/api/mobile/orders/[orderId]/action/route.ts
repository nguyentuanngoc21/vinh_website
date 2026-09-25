import { POST as setScope } from '@/app/api/orders/[orderId]/scope/route';
import { PATCH as saveBrief, POST as confirmBrief } from '@/app/api/orders/[orderId]/brief/route';
import { POST as submitDraft } from '@/app/api/orders/[orderId]/draft/route';
import { POST as approveDraft } from '@/app/api/orders/[orderId]/draft/approve/route';
import { POST as requestRevision } from '@/app/api/orders/[orderId]/draft/revise/route';
import { POST as deliver } from '@/app/api/orders/[orderId]/deliver/route';
import { POST as deliverUploadUrl } from '@/app/api/orders/[orderId]/deliver/upload-url/route';
import { POST as confirmReceived } from '@/app/api/orders/[orderId]/confirm/route';
import { POST as attachBook } from '@/app/api/orders/[orderId]/attach-book/route';
import { POST as requestOriginal } from '@/app/api/orders/[orderId]/original-file/route';
import { PATCH as resolveOriginal } from '@/app/api/orders/[orderId]/original-file/[requestId]/route';
import { POST as requestCancel } from '@/app/api/orders/[orderId]/cancel/route';
import { PATCH as resolveCancel } from '@/app/api/orders/[orderId]/cancel/[requestId]/route';
import { POST as sendReminder } from '@/app/api/orders/[orderId]/lost-contact/reminder/route';
import { POST as reportLostContact } from '@/app/api/orders/[orderId]/lost-contact/report/route';
import { POST as openDispute } from '@/app/api/orders/[orderId]/dispute/route';
import { POST as startAuthorAgreement } from '@/app/api/orders/[orderId]/author-name-agreement/route';
import { PATCH as confirmAuthorAgreement } from '@/app/api/orders/[orderId]/author-name-agreement/[agreementId]/route';
import { mobileResponse } from '@/lib/mobile/response';
export { OPTIONS } from '@/lib/mobile/response';

type Params = { orderId: string };
// Superset of every handler's params; handlers that only need orderId ignore the rest.
type AllParams = { orderId: string; requestId: string; agreementId: string };
type Handler = (request: Request, context: { params: Promise<AllParams> }) => Promise<Response>;
const idParam = (key: 'requestId' | 'agreementId') => (b: Body) => ({ [key]: typeof b[key] === 'string' ? b[key] as string : '' });
type Body = Record<string, unknown>;
// action → web handler, HTTP method and the only fields forwarded. Every rule stays in the web
// route and its RPC. Payments (deposit) are deliberately absent: paying happens on the web for now.
const ACTIONS: Record<string, { handler: Handler; method: string; body?: (b: Body) => Body; extraParams?: (b: Body) => Record<string, string> }> = {
  'set-scope': { handler: setScope, method: 'POST', body: b => ({ usageScope: b.usageScope, scopeNote: b.scopeNote }) },
  'save-brief': { handler: saveBrief, method: 'PATCH', body: b => ({ brief: b.brief }) },
  'confirm-brief': { handler: confirmBrief, method: 'POST' },
  'submit-draft': { handler: submitDraft, method: 'POST', body: () => ({ asset: {} }) },
  'approve-draft': { handler: approveDraft, method: 'POST' },
  'request-revision': { handler: requestRevision, method: 'POST', body: b => ({ note: b.note }) },
  'deliver-upload-url': { handler: deliverUploadUrl, method: 'POST', body: b => ({ contentType: b.contentType }) },
  deliver: { handler: deliver, method: 'POST', body: b => (typeof b.uploadPath === 'string' ? { uploadPath: b.uploadPath } : {}) },
  'confirm-received': { handler: confirmReceived, method: 'POST' },
  'attach-book': { handler: attachBook, method: 'POST', body: b => ({ bookId: b.bookId }) },
  'request-original': { handler: requestOriginal, method: 'POST' },
  'resolve-original': { handler: resolveOriginal, method: 'PATCH', body: b => ({ agree: b.agree === true }), extraParams: idParam('requestId') },
  // Cancelling refunds escrowed xu per calculate_refund() — no new payment is made from the app.
  'request-cancel': { handler: requestCancel, method: 'POST' },
  'resolve-cancel': { handler: resolveCancel, method: 'PATCH', body: b => ({ agree: b.agree === true }), extraParams: idParam('requestId') },
  'send-reminder': { handler: sendReminder, method: 'POST' },
  'report-lost-contact': { handler: reportLostContact, method: 'POST' },
  'open-dispute': { handler: openDispute, method: 'POST', body: b => ({ reasonCategory: b.reasonCategory, description: b.description }) },
  'start-author-agreement': { handler: startAuthorAgreement, method: 'POST', body: b => ({
    choice: b.choice, ghostwriterSampleVisible: b.ghostwriterSampleVisible === true, customerProfileVisible: b.customerProfileVisible === true }) },
  'confirm-author-agreement': { handler: confirmAuthorAgreement, method: 'PATCH', extraParams: idParam('agreementId') },
};

export function POST(request: Request, context: { params: Promise<Params> }) {
  return mobileResponse(request, async () => {
    const body = (await request.json().catch(() => null)) as Body | null;
    // Own keys only: a name like "__proto__" must not resolve to Object.prototype.
    const action = typeof body?.action === 'string' && Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : undefined;
    if (!body || !action) return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
    const headers = new Headers({ Authorization: request.headers.get('authorization') ?? '', 'Content-Type': 'application/json' });
    const forwarded = new Request(request.url, { method: action.method, headers, body: JSON.stringify(action.body?.(body) ?? {}) });
    const params: AllParams = { requestId: '', agreementId: '', ...(await context.params), ...(action.extraParams?.(body) ?? {}) };
    return action.handler(forwarded, { params: Promise.resolve(params) });
  });
}
