import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type PreparedImage = { uri: string; name: string; type: 'image/jpeg'; size: number; width: number; height: number };
// Same limits as the web's src/lib/media/compress-image.ts: keep the long side large enough
// for CCCD OCR, and each file well under the ~4.5 MB request body limit of the backend.
const MAX_DIMENSION = 1800;
const MAX_BYTES = 1.4 * 1024 * 1024;
const QUALITIES = [0.85, 0.7, 0.55];

/** Returns null when the user cancels. */
export async function pickImage(source: 'library' | 'camera') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Vịnh chưa được cấp quyền dùng camera. Hãy bật quyền trong Cài đặt hoặc chọn ảnh có sẵn.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  return prepareImage(result.assets[0]);
}

/** Resize to at most MAX_DIMENSION and re-encode as JPEG, lowering quality until under MAX_BYTES. */
export async function prepareImage(asset: { uri: string; width: number; height: number }): Promise<PreparedImage> {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(asset.width || 1, asset.height || 1));
  const context = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) context.resize(asset.width >= asset.height ? { width: Math.round(asset.width * scale) } : { height: Math.round(asset.height * scale) });
  const image = await context.renderAsync();
  for (const compress of QUALITIES) {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress });
    const size = (await (await fetch(saved.uri)).blob()).size;
    if (size <= MAX_BYTES || compress === QUALITIES[QUALITIES.length - 1]) {
      if (size > MAX_BYTES) throw new Error('Ảnh quá lớn sau khi nén. Hãy chọn ảnh khác hoặc chụp lại.');
      return { uri: saved.uri, name: `image-${Date.now()}.jpg`, type: 'image/jpeg', size, width: saved.width, height: saved.height };
    }
  }
  throw new Error('Không xử lý được ảnh.');
}

/** React Native FormData accepts a local file descriptor in place of a Blob. */
export function formFile(image: PreparedImage) {
  return { uri: image.uri, name: image.name, type: image.type } as unknown as Blob;
}
