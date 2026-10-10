# Bridge to Windows' system media sessions (YouTube Music in the browser, Spotify, etc).
# Reads commands on stdin, one per line, and writes one JSON line per command:
#   status                -> {"sessions":[...]}
#   art <appId>           -> {"art":"data:image/...;base64,..."}
#   cmd <appId> <action>  -> {"ok":true}   action = toggle|play|pause|next|prev|seek:<seconds>|vol:<0-1>
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
Add-Type -Path (Join-Path $PSScriptRoot 'appvol.cs')

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $t.Wait(5000)
  $t.Result
}

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]

# "opera.exe" -> "opera"; "SpotifyAB.SpotifyMusic_x!Spotify" -> "Spotify"
function Proc-Name($id) { if ($id -match '([^\\!]+?)\.exe$') { $Matches[1] } elseif ($id -match '!(.+)$') { $Matches[1] } else { $id } }
function Find-Session($id) { $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -eq $id } | Select-Object -First 1 }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Split(' ', 3)
  try {
    switch ($parts[0]) {
      'status' {
        $out = @()
        foreach ($s in $mgr.GetSessions()) {
          $p = Await ($s.TryGetMediaPropertiesAsync()) $propsType
          $info = $s.GetPlaybackInfo()
          $tl = $s.GetTimelineProperties()
          $out += [ordered]@{
            app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle
            status = "$($info.PlaybackStatus)"; pos = $tl.Position.TotalSeconds; end = $tl.EndTime.TotalSeconds
            updated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds(); vol = [AppVol]::Volume((Proc-Name $s.SourceAppUserModelId), -1)
            canNext = $info.Controls.IsNextEnabled; canPrev = $info.Controls.IsPreviousEnabled
          }
        }
        [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 4 @{ sessions = @($out) }))
      }
      'art' {
        $s = Find-Session $parts[1]; $data = $null
        if ($s) {
          $p = Await ($s.TryGetMediaPropertiesAsync()) $propsType
          if ($p.Thumbnail) {
            $ras = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            # PS 5.1 can't bind the WinRT COM object to IInputStream directly; reflection does the QueryInterface for us.
            $toStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
            $stream = $toStream.Invoke($null, @($ras))
            $ms = New-Object System.IO.MemoryStream; $stream.CopyTo($ms); $stream.Dispose()
            $bytes = $ms.ToArray()
            $data = "data:image/png;base64," + [Convert]::ToBase64String($bytes)
          }
        }
        [Console]::Out.WriteLine((ConvertTo-Json -Compress @{ art = $data }))
      }
      'cmd' {
        $s = Find-Session $parts[1]
        $action = $parts[2]
        if ($action -like 'vol:*') {
          $null = [AppVol]::Volume((Proc-Name $parts[1]), [float]$action.Substring(4))
        } elseif ($s -and $action -like 'seek:*') {
          $ticks = [long]([double]$action.Substring(5) * 10000000)
          $null = Await ($s.TryChangePlaybackPositionAsync($ticks)) ([bool])
        } elseif ($s) {
          $op = switch ($action) {
            'toggle' { $s.TryTogglePlayPauseAsync() } 'play' { $s.TryPlayAsync() } 'pause' { $s.TryPauseAsync() }
            'next' { $s.TrySkipNextAsync() } 'prev' { $s.TrySkipPreviousAsync() }
          }
          $null = Await $op ([bool])
        }
        [Console]::Out.WriteLine('{"ok":true}')
      }
      default { [Console]::Out.WriteLine('{"error":"unknown"}') }
    }
  } catch {
    [Console]::Out.WriteLine((ConvertTo-Json -Compress @{ error = "$_" }))
  }
}
