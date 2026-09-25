import { WebView } from 'react-native-webview';
export function AgreementDocument({ html, onReady, onError }: { html: string; onReady: () => void; onError: () => void }) {
  const document = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:17px/1.7 sans-serif;color:#143b4d;padding:16px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}img{max-width:100%}</style></head><body>${html}</body></html>`;
  return <WebView source={{ html: document }} originWhitelist={['*']} javaScriptEnabled={false} domStorageEnabled={false}
    incognito onShouldStartLoadWithRequest={request => request.url === 'about:blank'} onLoad={onReady} onError={onError} style={{ flex: 1 }} />;
}
