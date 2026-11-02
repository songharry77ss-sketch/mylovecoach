$ErrorActionPreference = 'Stop'
$tcRoot = $PSScriptRoot
$tcRenderer = 'C:/Users/shsop/mylovecoach-codex-tools/render.mjs'
node (Join-Path $tcRoot 'build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'HTML 생성 실패' }
$tcBatch = @()
foreach ($tcSpec in @(@('icon',1024,1024),@('store-1',1290,2796),@('screen-1-home',1179,2556),@('screen-2-result',1179,2556),@('screen-3-kkti',1179,2556))) {
    $tcBatch += (Join-Path $tcRoot ($tcSpec[0]+'.html')), (Join-Path $tcRoot ($tcSpec[0]+'.png')), $tcSpec[1], $tcSpec[2]
}
node $tcRenderer @tcBatch
if ($LASTEXITCODE -ne 0) { throw '앱 화면 렌더 실패' }
node $tcRenderer (Join-Path $tcRoot 'board.html') (Join-Path $tcRoot 'board.png') 2400 1350
if ($LASTEXITCODE -ne 0) { throw '보드 렌더 실패' }
node (Join-Path $tcRoot 'audit.mjs')
if ($LASTEXITCODE -ne 0) { throw '규격 확인 실패' }
