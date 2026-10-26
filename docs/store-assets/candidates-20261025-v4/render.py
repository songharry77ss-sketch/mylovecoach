"""Use the user-specified renderer unchanged. Render main, contacts, or all."""
from pathlib import Path
import json, subprocess, sys
base=Path(__file__).resolve().parent
jobs=json.loads((base/'manifest.json').read_text(encoding='utf-8'))['jobs']
mode=sys.argv[1] if len(sys.argv)>1 else 'all'
if mode=='main': jobs=jobs[:12]
elif mode=='contacts': jobs=jobs[12:]
args=['node','C:/Users/shsop/mylovecoach-codex-tools/render.mjs']
args += [str(value) for job in jobs for value in job]
subprocess.run(args,check=True)
