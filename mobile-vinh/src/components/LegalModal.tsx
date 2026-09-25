import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { publicApi } from '../services/api';
import { AgreementDocument } from './AgreementDocument';
import { Button } from './Form';

export type PublicDocId = 'dieu-khoan-su-dung' | 'chinh-sach-bao-mat';
type Doc = { id: string; name: string; version: string; html: string };

/** Terms/privacy shown before sign-in — same source as the web's LegalLink. */
export function LegalModal({ docId, onClose }: { docId: PublicDocId | null; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  return <Modal visible={!!docId} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-cream-card">
      {/* Keyed so each document (or retry) starts from a clean loading state. */}
      {docId && <LegalBody key={`${docId}:${attempt}`} docId={docId} onRetry={() => setAttempt(a => a + 1)} />}
      <View className="px-5 pb-4"><Button label="Đóng" onPress={onClose} /></View>
    </SafeAreaView>
  </Modal>;
}

function LegalBody({ docId, onRetry }: { docId: PublicDocId; onRetry: () => void }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    publicApi<Doc>(`legal/${docId}`).then(result => { if (active) setDoc(result); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được văn bản.'); });
    return () => { active = false; };
  }, [docId]);
  return <>
    <View className="border-b border-cream-border px-5 pb-3">
      <Text accessibilityRole="header" className="text-xl font-bold text-brand-ink">{doc?.name ?? 'Văn bản'}</Text>
      {doc && <Text className="text-sm text-stone">Phiên bản {doc.version}</Text>}
    </View>
    <View className="flex-1">
      {doc && !error ? <AgreementDocument html={doc.html} onReady={() => undefined} onError={() => setError('Không hiển thị được văn bản.')} />
        : error ? <View className="p-5"><Text className="mb-2 text-red-700">{error}</Text><Button label="Thử lại" secondary onPress={onRetry} /></View>
          : <ActivityIndicator color="#143b4d" style={{ marginTop: 40 }} />}
    </View>
  </>;
}
