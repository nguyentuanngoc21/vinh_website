import { Alert } from 'react-native';
import { router } from 'expo-router';
import { ApiError } from './api';

/**
 * Authoring routes answer 403 { missingAgreementIds } when the exclusivity policy isn't accepted at
 * its current version (like the web RequiredAgreementsModal). Offers to open that agreement in
 * Cam kết; the author retries the save after accepting. Returns true when it handled the error.
 */
export function promptMissingAgreement(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  const ids = error.data.missingAgreementIds;
  if (!Array.isArray(ids) || typeof ids[0] !== 'string') return false;
  Alert.alert('Cần xác nhận thỏa thuận', `${error.message}\n\nSau khi xác nhận, quay lại và bấm lưu lần nữa.`, [
    { text: 'Để sau', style: 'cancel' },
    { text: 'Mở thỏa thuận', onPress: () => router.push({ pathname: '/cam-ket', params: { id: ids[0] } }) },
  ]);
  return true;
}
