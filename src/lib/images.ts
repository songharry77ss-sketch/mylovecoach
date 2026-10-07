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

/**
 * 모델 전송 최대 가로 폭. 카톡 캡처 글자가 충분히 읽히면서 전송량을 줄이는 값.
 * Gemini 는 해상도 설정(MEDIUM)에 따라 이미지 1장에 정해진 토큰만 쓰므로 폭을 줄여도 토큰은 거의 그대로이고, 전송량·지연만 준다
 */
export const MODEL_IMAGE_MAX_WIDTH = 800;

/** 보낼 때 줄일 폭. 800px 보다 넓을 때만 줄이고, 좁은 캡처는 키우지 않는다 (키워도 글자는 또렷해지지 않고 전송량만 는다) */
export function modelResizeWidth(width: number): number | null {
  return width > MODEL_IMAGE_MAX_WIDTH ? MODEL_IMAGE_MAX_WIDTH : null;
}

/**
 * 모델 전송용으로 리사이즈 + JPEG 압축 + base64 인코딩.
 * 원본 폭을 모르면(0 — 다시 시도·다른 답장처럼 저장된 캡처를 다시 보낼 때) 이미지를 읽어 잰다.
 */
export async function encodeForModel(uri: string, width?: number): Promise<EncodedImage> {
  const context = ImageManipulator.manipulate(uri);
  const measured = width && width > 0 ? null : await context.renderAsync();
  const target = modelResizeWidth(measured?.width ?? width ?? 0);
  const image = target ? await context.resize({ width: target }).renderAsync() : (measured ?? (await context.renderAsync()));
  if (measured && measured !== image) measured.release();
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
    if (!saved.base64) throw new Error('이미지를 준비하지 못했어요.');
    return { base64: saved.base64, mediaType: 'image/jpeg' };
  } finally {
    image.release();
  }
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
