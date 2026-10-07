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
/** 사진 선택기(원본 사본)와 이미지 변환(모델용 축소본)이 캐시 폴더에 남기는 파일 */
const CACHE_DIRS = ['ImagePicker', 'ImageManipulator'];

/** 캐시 폴더 안의 파일이면 지운다 (문서 폴더로 옮긴 뒤의 사진 선택기 원본, 보낸 뒤의 축소본) */
function deleteCacheCopy(uri?: string): void {
  if (!uri || Platform.OS === 'web') return;
  try {
    if (!uri.startsWith(Paths.cache.uri)) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // 정리는 실패해도 앱 동작에 영향이 없다
  }
}

/** 사진 선택기·이미지 변환이 캐시 폴더에 남긴 캡처 사본을 모두 지운다 (모든 데이터 삭제·비밀 상담 나가기·앱 시작) */
export function clearImageCaches(): void {
  if (Platform.OS === 'web') return;
  for (const name of CACHE_DIRS) {
    try {
      const dir = new Directory(Paths.cache, name);
      if (!dir.exists) continue;
      for (const entry of dir.list()) if (entry instanceof File) entry.delete();
    } catch {
      // 정리는 실패해도 앱 동작에 영향이 없다
    }
  }
}

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
  // 사진 선택기가 캐시 폴더에 만든 원본 사본은 바로 지운다 (같은 캡처가 두 군데 남지 않게)
  deleteCacheCopy(sourceUri);
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
  // 전송용 축소본 파일은 base64 를 받은 뒤 필요 없다
  deleteCacheCopy(saved.uri);
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

/**
 * 어디에도 연결되지 않은 캡처·사진 파일을 지운다 (앱 시작 때 한 번).
 * 비밀 상담 중 앱이 강제 종료되면 대화는 저장되지 않지만 복사해 둔 캡처 파일이 남을 수 있어서다.
 */
export function cleanupOrphanImages(referenced: Set<string>, now = Date.now(), minAgeMs = 10 * 60 * 1000): number {
  if (Platform.OS === 'web') return 0;
  let removed = 0;
  for (const name of [SCREENSHOT_DIR, PHOTO_DIR]) {
    try {
      const dir = new Directory(Paths.document, name);
      if (!dir.exists) continue;
      for (const entry of dir.list()) {
        // 방금 고르고 아직 보내기 전인 캡처는 지우지 않도록, 만든 지 10분이 지난 파일만
        const created = createdAtOf(entry.uri);
        if (entry instanceof File && !referenced.has(entry.uri) && created != null && now - created > minAgeMs) {
          entry.delete();
          removed++;
        }
      }
    } catch {
      // 정리는 실패해도 앱 동작에 영향이 없다
    }
  }
  return removed;
}

/** createId 로 만든 파일 이름(img_<시각36진수 8자리><난수>.확장자)에서 만든 시각을 읽는다 */
export function createdAtOf(uri: string): number | null {
  const name = uri.split('/').pop() ?? '';
  const m = /^img_([0-9a-z]{8})/.exec(name);
  if (!m) return null;
  const t = parseInt(m[1], 36);
  return Number.isFinite(t) && t > 1_500_000_000_000 ? t : null;
}
