# 정지 그림 → 움직이는 토막 (무료 Wan 2.2 · 허깅페이스 ZeroGPU 무료 할당) — ai-reel 의 person.motion / other.motion 에 넣을 mp4 를 만든다.
#
#   python tools/social-make/wan-motion.py tools/social-make/samples/late-reply/motion/jobs.json
#
# - jobs.json: { "space": "...", "seconds": 3.5, "style": "(모든 글 뒤에 붙일 말)", "jobs": [{ "name", "image", "prompt", "seconds"? }] }
#   image 는 저장소 기준 경로, 결과는 jobs.json 옆 <name>.mp4 · <name>.json(만든 글). 이미 있는 토막은 건너뛴다.
# - 돈 안 듦: 로그인 없이 하루 약 3~4토막(3.5초 기준), 무료 허깅페이스 계정 토큰(HF_TOKEN)이 있으면 더 많이. 할당이 다 되면 멈추고
#   몇 시간 뒤 다시 되는지 알려 준다 — 다음 날 같은 명령을 다시 돌리면 남은 것만 만든다. (IP 를 바꿔 할당을 늘리지 않는다)
# - Wan 2.2 는 Apache-2.0(상업 사용 가능·워터마크 없음). 그림은 AI 가상 인물만 — 실제 인물 사진은 넣지 않는다. 영상엔 「AI로 만든 장면」이 붙는다.
# - 필요: pip install gradio_client
import json, os, shutil, sys, time

from gradio_client import Client, handle_file

jobs_file = sys.argv[1]
out_dir = os.path.dirname(os.path.abspath(jobs_file))
cfg = json.load(open(jobs_file, encoding="utf-8"))
space = cfg.get("space", "linoyts/wan2-2-i2v-rCM")
client = Client(space, token=os.environ.get("HF_TOKEN") or None, verbose=False)
made = 0
for job in cfg["jobs"]:
    out = os.path.join(out_dir, job["name"] + ".mp4")
    if os.path.exists(out):
        continue
    prompt = job["prompt"] + (", " + cfg["style"] if cfg.get("style") else "")
    seconds = job.get("seconds", cfg.get("seconds", 3.5))
    t = time.time()
    try:
        r = client.predict(input_image=handle_file(job["image"]), prompt=prompt, duration_seconds=seconds, randomize_seed=True, api_name="/generate_video")
    except Exception as e:  # 할당 초과·서버 오류
        msg = str(e)
        print(f"멈춤 {job['name']}: {msg[:300]}", flush=True)
        if "quota" in msg.lower():
            break
        continue
    video = r[0]
    if isinstance(video, dict):
        video = video.get("video") or video.get("path")
    shutil.copy(video, out)
    with open(out[:-4] + ".json", "w", encoding="utf-8") as f:
        json.dump({"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "space": space, "model": "Wan 2.2 I2V (Apache-2.0)", "image": job["image"], "seconds": seconds, "prompt": prompt}, f, ensure_ascii=False, indent=2)
    made += 1
    print(f"만듦 {job['name']} ({time.time() - t:.0f}초)", flush=True)
left = [j["name"] for j in cfg["jobs"] if not os.path.exists(os.path.join(out_dir, j["name"] + ".mp4"))]
print(f"이번에 {made}개 · 남은 것 {len(left)}개 {left}", flush=True)
