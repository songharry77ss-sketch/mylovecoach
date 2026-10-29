/**
 * 캡처 저장·전송 — 갤럭시에서 「Loading bitmap failed」가 나던 문제 (expo-file-system 57 의 copy 가 비동기인데 기다리지 않고 원본을 지움)
 */
const mockLog: string[] = [];
const mockFiles = new Map<string, { size: number; data?: string }>();
let mockCopyDelay = 0;

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri.replace(/\/$/, ''))).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.size ?? 0;
    }
    async copy(to: MockFile) {
      mockLog.push(`copy-start ${this.uri}`);
      await new Promise((r) => setTimeout(r, mockCopyDelay));
      const src = mockFiles.get(this.uri);
      // 원본이 이미 지워졌으면 빈 파일이 남는다 (실제 기기에서 본 증상)
      mockFiles.set(to.uri, src ? { ...src } : { size: 0 });
      mockLog.push(`copy-end ${to.uri}`);
    }
    delete() {
      mockLog.push(`delete ${this.uri}`);
      mockFiles.delete(this.uri);
    }
    async base64() {
      return mockFiles.get(this.uri)?.data ?? '';
    }
  }
  class MockDirectory {
    uri: string;
    constructor(base: { uri: string }, name: string) {
      this.uri = `${base.uri}${name}/`;
    }
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [];
    }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///doc/' } } };
});

let mockManipulateFails = false;
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => {
      const ref = {
        width: 1080,
        release: () => {},
        saveAsync: async () => ({ uri: 'file:///cache/ImageManipulator/out.jpg', base64: 'RESIZED' }),
      };
      const ctx = {
        resize: () => ctx,
        renderAsync: async () => {
          if (mockManipulateFails) throw new Error("Call to function 'Context.renderAsync' has been rejected. Loading bitmap failed");
          return ref;
        },
      };
      return ctx;
    },
  },
}));
jest.mock('expo-image-picker', () => ({}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const images = require('@/lib/images') as typeof import('@/lib/images');

beforeEach(() => {
  mockLog.length = 0;
  mockFiles.clear();
  mockCopyDelay = 5;
  mockManipulateFails = false;
});

describe('persistImage', () => {
  it('복사가 끝난 뒤에 사진 선택기 원본을 지운다', async () => {
    mockFiles.set('file:///cache/ImagePicker/a.jpeg', { size: 1234 });
    const saved = await images.persistImage('file:///cache/ImagePicker/a.jpeg', 'screenshots', 1080, 2340);
    expect(mockFiles.get(saved.uri)?.size).toBe(1234);
    const copyEnd = mockLog.findIndex((l) => l.startsWith('copy-end'));
    const del = mockLog.findIndex((l) => l === 'delete file:///cache/ImagePicker/a.jpeg');
    expect(copyEnd).toBeGreaterThanOrEqual(0);
    expect(del).toBeGreaterThan(copyEnd);
    expect(saved.uri.startsWith('file:///doc/screenshots/img_')).toBe(true);
  });

  it('복사된 파일이 비어 있으면 지우고 안내 문장으로 실패한다', async () => {
    mockFiles.set('file:///cache/ImagePicker/b.jpeg', { size: 0 });
    await expect(images.persistImage('file:///cache/ImagePicker/b.jpeg', 'screenshots', 1, 1)).rejects.toThrow(images.IMAGE_UNREADABLE_MESSAGE);
    expect([...mockFiles.keys()].some((k) => k.startsWith('file:///doc/'))).toBe(false);
  });
});

describe('encodeForModel', () => {
  it('파일이 없으면 「캡처 다시 올리기」 안내 오류', async () => {
    const err = await images.encodeForModel('file:///doc/screenshots/img_gone.jpeg', 1080).catch((e) => e);
    expect(err).toBeInstanceOf(images.ImageReadError);
    expect(err.message).toBe(images.IMAGE_MISSING_MESSAGE);
  });

  it('보통은 줄인 JPEG 를 보낸다', async () => {
    mockFiles.set('file:///doc/screenshots/img_ok.jpeg', { size: 500_000, data: 'ORIGINAL' });
    await expect(images.encodeForModel('file:///doc/screenshots/img_ok.jpeg', 1080)).resolves.toEqual({ base64: 'RESIZED', mediaType: 'image/jpeg' });
  });

  it('이미지 변환이 실패하면 받을 수 있는 형식·크기의 원본을 그대로 보낸다', async () => {
    mockManipulateFails = true;
    mockFiles.set('file:///doc/screenshots/img_long.png', { size: 2_000_000, data: 'ORIGINAL' });
    await expect(images.encodeForModel('file:///doc/screenshots/img_long.png', 1080)).resolves.toEqual({ base64: 'ORIGINAL', mediaType: 'image/png' });
  });

  it('원본도 보낼 수 없으면(형식·크기) 읽지 못했다는 안내 오류', async () => {
    mockManipulateFails = true;
    mockFiles.set('file:///doc/screenshots/img_x.heic', { size: 800_000, data: 'HEIC' });
    mockFiles.set('file:///doc/screenshots/img_big.jpeg', { size: 5_000_000, data: 'BIG' });
    for (const uri of ['file:///doc/screenshots/img_x.heic', 'file:///doc/screenshots/img_big.jpeg']) {
      const err = await images.encodeForModel(uri, 1080).catch((e) => e);
      expect(err).toBeInstanceOf(images.ImageReadError);
      expect(err.message).toBe(images.IMAGE_UNREADABLE_MESSAGE);
    }
  });
});
