export function AgreementDocument({ html, onReady, onError }: { html: string; onReady: () => void; onError: () => void }) {
  return <iframe title="Nội dung thỏa thuận" sandbox="" onLoad={onReady} onError={onError}
    srcDoc={`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:17px/1.7 sans-serif;padding:16px;color:#143b4d;overflow-wrap:anywhere}</style></head><body>${html}</body></html>`}
    style={{ flex: 1, width: '100%', border: 0 }} />;
}
