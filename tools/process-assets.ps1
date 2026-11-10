param(
  [switch]$SkipKey
)

Add-Type -AssemblyName System.Drawing
$dir = "D:\AI\project\littlegame\prototype\assets\"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"

# name, key?, target width
$items = @(
  @("car_sedan",  $true,  800),
  @("car_van",    $true,  800),
  @("car_coupe",  $true,  800),
  @("car_jeep",   $true,  800),
  @("car_truck",  $true,  800),
  @("car_black",  $true,  800),
  @("dirt_soft",  $true,  448),
  @("dirt_heavy", $true,  448),
  @("grime_hard", $true,  448),
  @("paint_damage", $true, 448),
  @("brick_wall", $true,  640),
  @("vase",       $true,  520),
  @("window",     $true,  520),
  @("hub",        $true,  520),
  @("fx_foam",    $true,  448),
  @("fx_splash",  $true,  448),
  @("bg_outdoor", $false, 720),
  @("bg_dawn",    $false, 720),
  @("bg_dusk",    $false, 720)
)

foreach ($it in $items) {
  $name = $it[0]; $key = $it[1]; $tw = $it[2]
  $raw = $dir + "raw_" + $name + ".png"
  $keyed = $dir + "keyed_" + $name + ".png"
  if (-not (Test-Path $raw)) { Write-Host "SKIP $name (no raw)"; continue }

  $bmp = [System.Drawing.Bitmap]::FromFile($raw)
  $w0 = $bmp.Width; $h0 = $bmp.Height
  $bmp.Dispose()
  $th = [int]([Math]::Round($h0 * ($tw / $w0)))

  if ($key -and -not $SkipKey) {
    Remove-Item $keyed -ErrorAction SilentlyContinue
    $url = "file:///D:/AI/project/littlegame/tools/keyer.html?src=../prototype/assets/raw_" + $name + ".png"
    & $chrome --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files `
      --default-background-color=00000000 --window-size="$w0,$h0" --virtual-time-budget=6000 `
      --screenshot="$keyed" $url 2>&1 | Out-Null
    Start-Sleep -Milliseconds 250
    $src = $keyed
  } else {
    $src = $raw
  }

  $out = $dir + $name + ".bin.png"
  $b = [System.Drawing.Bitmap]::FromFile($src)
  $n = New-Object System.Drawing.Bitmap($tw, $th, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($n)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($b, 0, 0, $tw, $th)
  $g.Dispose(); $b.Dispose()
  $n.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $n.Dispose()

  $sz = (Get-Item $out).Length
  Write-Host ("{0,-14} {1}x{2}  {3} KB" -f $name, $tw, $th, [int]($sz / 1024))
}
