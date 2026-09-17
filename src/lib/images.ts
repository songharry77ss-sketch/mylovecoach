import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { createId } from '@/lib/id';

export interface PickedImage {
  /** 앱 문서 폴더에 복사된 영구 URI */
  uri: string;
  width: number;
  height: number;
}

const SCREENSHOT_DIR = 'screenshots';
const PHOTO_DIR = 'photos';

function ensureDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** 갤러리에서 이미지를 고르고 앱 저장소로 복사합니다. 취소하면 null. */
export async function pickImage(kind: 'screenshot' | 'photo'): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted && permission.canAskAgain === false) {
    throw new Error('사진 접근 권한이 필요해요. 설정에서 권한을 허용해주세요.');
  }
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
    allowsEditing: kind === 'photo',
    aspect: kind === 'photo' ? [1, 1] : undefined,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return persistImage(asset.uri, kind === 'screenshot' ? SCREENSHOT_DIR : PHOTO_DIR, asset.width, asset.height);
}

export async function persistImage(sourceUri: string, dirName: string, width: number, height: number): Promise<PickedImage> {
  if (Platform.OS === 'web') {
    // 웹에서는 blob/data URI를 그대로 사용
    return { uri: sourceUri, width, height };
  }
  const dir = ensureDir(dirName);
  const ext = sourceUri.split('?')[0].split('.').pop()?.toLowerCase();
  const safeExt = ext && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(ext) ? ext : 'jpg';
  const target = new File(dir, `${createId('img_')}.${safeExt}`);
  const source = new File(sourceUri);
  source.copy(target);
  return { uri: target.uri, width, height };
}

export interface EncodedImage {
  base64: string;
  mediaType: 'image/jpeg';
}

/** 모델 전송 최대 가로 폭. 카톡 캡처 글자가 충분히 읽히면서 토큰(Claude: 픽셀 비례)을 줄이는 값 */
export const MODEL_IMAGE_MAX_WIDTH = 800;

/**
 * 모델 전송용으로 리사이즈 + JPEG 압축 + base64 인코딩.
 * 원본 폭을 모르면(0) 일단 리사이즈를 시도합니다.
 */
export async function encodeForModel(uri: string, width?: number): Promise<EncodedImage> {
  const context = ImageManipulator.manipulate(uri);
  const shouldResize = !width || width > MODEL_IMAGE_MAX_WIDTH;
  if (shouldResize) context.resize({ width: MODEL_IMAGE_MAX_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
  image.release();
  if (!saved.base64) throw new Error('이미지를 준비하지 못했어요.');
  return { base64: saved.base64, mediaType: 'image/jpeg' };
}

export function deleteImageQuietly(uri?: string) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}
