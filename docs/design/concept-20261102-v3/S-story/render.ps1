$ErrorActionPreference = 'Stop'
$storyDir = $PSScriptRoot
node (Join-Path $storyDir 'build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'HTML build failed.' }
$storyArgs = @()
foreach ($item in @(@('screen-1-home',1179,2556),@('screen-2-result',1179,2556),@('screen-3-kkti',1179,2556),@('store-1',1290,2796),@('share-kkti',1080,1920))) {
  $storyArgs += (Join-Path $storyDir ($item[0] + '.html'))
  $storyArgs += (Join-Path $storyDir ($item[0] + '.png'))
  $storyArgs += [string]$item[1]
  $storyArgs += [string]$item[2]
}
node C:/Users/shsop/mylovecoach-codex-tools/render.mjs @storyArgs
if ($LASTEXITCODE -ne 0) { throw 'Screen rendering failed.' }
node C:/Users/shsop/mylovecoach-codex-tools/render.mjs (Join-Path $storyDir 'board.html') (Join-Path $storyDir 'board.png') 2400 1350
if ($LASTEXITCODE -ne 0) { throw 'Board rendering failed.' }
node (Join-Path $storyDir 'audit.mjs')
if ($LASTEXITCODE -ne 0) { throw 'QA failed.' }
