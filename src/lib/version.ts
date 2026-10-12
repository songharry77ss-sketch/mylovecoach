/** 점으로 나눈 숫자끼리 비교한다 (1.0.10 > 1.0.9, 1.0 = 1.0.0). a 가 크면 양수. 앱과 서버(api/version.ts)가 같이 쓴다 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
