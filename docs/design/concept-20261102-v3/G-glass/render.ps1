$ErrorActionPreference = 'Stop'
$conceptDir = $PSScriptRoot
$renderer = 'C:/Users/shsop/mylovecoach-codex-tools/render.mjs'
node (Join-Path $conceptDir 'build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'HTML build failed.' }
$renderArgs = @()
foreach ($name in @('screen-1-home','screen-2-result','screen-3-kkti')) {
    $renderArgs += @((Join-Path $conceptDir "$name.html"), (Join-Path $conceptDir "$name.png"), '1179', '2556')
}
$renderArgs += @((Join-Path $conceptDir 'store-1.html'), (Join-Path $conceptDir 'store-1.png'), '1290', '2796')
node $renderer @renderArgs
if ($LASTEXITCODE -ne 0) { throw 'Screen render failed.' }
node $renderer (Join-Path $conceptDir 'board.html') (Join-Path $conceptDir 'board.png') 2400 1350
if ($LASTEXITCODE -ne 0) { throw 'Board render failed.' }
node (Join-Path $conceptDir 'audit.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Layout audit failed.' }
python (Join-Path $conceptDir 'audit-contrast.py')
if ($LASTEXITCODE -ne 0) { throw 'Contrast audit failed.' }
