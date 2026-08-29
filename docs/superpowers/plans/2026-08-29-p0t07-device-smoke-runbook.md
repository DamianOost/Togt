# Togt P0T-07 — Remaining physical-device and paired-smoke runbook

**Candidate source commit:** `31c41eb2fbcbb52762bf3d01b22259dcf4de3f94`

**Candidate configuration:** `development-lan`

**Embedded API origin:** `http://192.168.10.126:3003`

This runbook finishes the physical-only gates left after the local Android 15
x86_64 emulator acceptance. It is for synthetic internal testing only. It does
not authorize a merge, deployment, public beta, provider activation, real
identity data or money movement.

The local virtual-device gate ran exact source `31c41eb` against an isolated API
on `127.0.0.1:3003` and PostgreSQL on `127.0.0.1:55432`. It proved registration
and database persistence; Map, Discover and Bookings navigation; truthful KYC
unavailability; online session restore; bounded offline locked-shell behavior
and retry recovery; logout/login; and zero fatal or missing-map-key failures.
The supporting mobile runner passed 64/64 tests and Metro exported 951 modules.

That gate caught and closed two release-blocking defects: `a935506` binds
runtime traffic to packaged app configuration and rejects stale bundled origins;
`31c41eb` keeps all native map mounts behind a fail-closed provider wrapper.

## Locked artifacts

```text
%LOCALAPPDATA%\TOGT-Android-Build\artifacts\TOGT-LAN-Test-1.0.0-2026-08-23-arm64.apk
%LOCALAPPDATA%\TOGT-Android-Build\artifacts\TOGT-development-lan-1.0.1-vc2-31c41eb2fbcb-arm64-v8a.apk
%LOCALAPPDATA%\TOGT-Android-Build\artifacts\TOGT-development-lan-1.0.1-vc2-31c41eb2fbcb-arm64-v8a.manifest.json
```

```text
v1 SHA-256: 604E6F1F7E6518F5F430745E2ED63260FD70E2716EA0D8FFB70CB4E28B8228E2
corrected ARM64 v2 SHA-256: E58DF96691D5558E80C9B60A5F16F23C8C9A304D1F570381A39BADBA5CEED1C2
signer SHA-256: FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C
```

The corrected ARM64 candidate completed the clean local Gradle pipeline. Its
package, version, ABI, packaged configuration, alignment, signature, expected
signer and SHA-256 were verified before the APK and manifest were copied into
the Development artifact store without overwrite.

The emulator evidence artifact is retained separately and is not a phone APK:

```text
APK:     %LOCALAPPDATA%\TOGT-Android-Build\artifacts\TOGT-development-local-1.0.1-vc2-31c41eb2fbcb-x86_64.apk
SHA-256: 44198B8A39DC3273C712DC52D3B54724F1208A7997E77D80B27B089525F204D2
```

The older
`TOGT-development-lan-1.0.1-vc2-c90742361216-arm64-v8a.apk` is **superseded
and non-distributable**. Maps-disabled navigation in that build can mount the
native Google Maps view and crash because no key is packaged. Do not install,
share or use it for any gate.

Use those exact published bytes so the device evidence matches the manifest. If
the reviewed Windows Wi-Fi address is no longer `192.168.10.126`, the candidate
cannot reach its API; produce a new labelled candidate and manifest rather than
silently redirecting it.

The retained v1 embeds the legacy origin `http://192.168.10.69:3002`, which is
currently degraded. The exact-v1 path below proves Android package/signer
upgrade semantics and offline launch only; it cannot prove migration of an
authenticated v1 session. Do not claim that evidence without separately
restoring a controlled healthy legacy-origin backend.

## 1. Preconditions

- Use a trusted private Wi-Fi network and synthetic data only.
- Confirm Windows still owns `192.168.10.126` on the active Wi-Fi adapter.
- Connect at least one ARM64 Android device for clean-install and upgrade
  evidence. Accept the USB-debugging RSA prompt and require ADB state `device`.
- Use two simultaneous clients for the paired customer/worker lifecycle. Two
  phones are the default. A bridged ARM64 emulator is acceptable for internal
  smoke only when it has its own reviewed `192.168.10.x` address that the
  phone-scoped firewall can distinguish from the host and physical phone.
- Record device model, Android version and ABI without retaining the ADB serial
  in shared evidence.

Use one non-elevated operator PowerShell for the ADB, database and backend
commands below, and keep it open through cleanup so its fresh environment and
validated target variables are retained.

```powershell
$buildRoot = "$env:LOCALAPPDATA\TOGT-Android-Build"
$adb = "$buildRoot\android-sdk\platform-tools\adb.exe"
$v1 = "$buildRoot\artifacts\TOGT-LAN-Test-1.0.0-2026-08-23-arm64.apk"
$v2 = "$buildRoot\artifacts\TOGT-development-lan-1.0.1-vc2-31c41eb2fbcb-arm64-v8a.apk"
$manifestPath = "$buildRoot\artifacts\TOGT-development-lan-1.0.1-vc2-31c41eb2fbcb-arm64-v8a.manifest.json"
$expectedV1Hash = '604E6F1F7E6518F5F430745E2ED63260FD70E2716EA0D8FFB70CB4E28B8228E2'
$expectedV2Hash = 'E58DF96691D5558E80C9B60A5F16F23C8C9A304D1F570381A39BADBA5CEED1C2'
$expectedSigner = 'FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C'

foreach ($artifact in $v1,$v2,$manifestPath) {
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
    throw "Required artifact is missing: $artifact"
  }
}

$v1Hash = (Get-FileHash -LiteralPath $v1 -Algorithm SHA256).Hash
$v2Hash = (Get-FileHash -LiteralPath $v2 -Algorithm SHA256).Hash
if ($v1Hash -ne $expectedV1Hash) { throw "v1 hash mismatch: $v1Hash" }
if ($v2Hash -ne $expectedV2Hash) { throw "v2 hash mismatch: $v2Hash" }

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifestChecks = [ordered]@{
  artifactFile = $manifest.artifactFile -eq (Split-Path -Leaf $v2)
  artifactSha256 = $manifest.artifactSha256 -eq $v2Hash
  artifactSizeBytes = $manifest.artifactSizeBytes -eq (Get-Item -LiteralPath $v2).Length
  packageName = $manifest.packageName -eq 'za.togt.app'
  versionName = $manifest.versionName -eq '1.0.1'
  versionCode = $manifest.versionCode -eq 2
  sourceCommit = $manifest.sourceCommit -eq '31c41eb2fbcbb52762bf3d01b22259dcf4de3f94'
  configClass = $manifest.configClass -eq 'development-lan'
  signerSha256 = $manifest.signerSha256 -eq $expectedSigner
  expectedSignerSha256 = $manifest.expectedSignerSha256 -eq $expectedSigner
  arm64Only = @($manifest.abis).Count -eq 1 -and $manifest.abis[0] -eq 'arm64-v8a'
  aligned = $manifest.aligned -eq $true
  signatureVerified = $manifest.signatureVerified -eq $true
}
$failedManifestChecks = @($manifestChecks.GetEnumerator() | Where-Object Value -ne $true | Select-Object -ExpandProperty Key)
if ($failedManifestChecks.Count -ne 0) {
  throw "Manifest checks failed: $($failedManifestChecks -join ', ')"
}

$adbServerPids = @(
  Get-NetTCPConnection -State Listen -LocalPort 5037 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
)
if ($adbServerPids.Count -gt 1) { throw 'Multiple processes are listening on the ADB server port.' }
$adbServerStartedBySession = $adbServerPids.Count -eq 0
if ($adbServerStartedBySession) {
  & $adb start-server
  if ($LASTEXITCODE -ne 0) { throw 'ADB server failed to start.' }
} else {
  $adbOwner = Get-CimInstance Win32_Process -Filter "ProcessId=$($adbServerPids[0])"
  if ($adbOwner.ExecutablePath -notmatch '(?i)\\adb\.exe$') {
    throw 'Port 5037 is owned by a non-ADB process.'
  }
}
$deviceRows = @(& $adb devices)
if ($LASTEXITCODE -ne 0) { throw 'ADB device discovery failed.' }
$authorizedSerials = @(
  $deviceRows | ForEach-Object {
    if ($_ -match '^(\S+)\s+device\s*$') { $Matches[1] }
  }
)
if ($authorizedSerials.Count -eq 0) {
  throw 'No authorized Android device is in ADB state device.'
}
$selectedSerial = if ($authorizedSerials.Count -eq 1) {
  $authorizedSerials[0]
} else {
  '<select-one-authorized-serial>'
}
if ($authorizedSerials -notcontains $selectedSerial) {
  throw 'Set $selectedSerial to one exact authorized target before continuing.'
}

function Invoke-SelectedAdb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $CommandArguments)
  $commandOutput = & $adb -s $selectedSerial @CommandArguments 2>&1
  $commandExit = $LASTEXITCODE
  if ($commandExit -ne 0) {
    throw "ADB command failed ($commandExit): $($CommandArguments -join ' ')`n$($commandOutput -join "`n")"
  }
  $commandOutput
}

Invoke-SelectedAdb shell getprop ro.product.manufacturer
Invoke-SelectedAdb shell getprop ro.product.model
Invoke-SelectedAdb shell getprop ro.build.version.release
$selectedAbis = (Invoke-SelectedAdb shell getprop ro.product.cpu.abilist) -join ''
if ($selectedAbis -notmatch '(^|,)arm64-v8a(,|$)') {
  throw "Selected device does not support arm64-v8a: $selectedAbis"
}
```

Stop if no device is present, any target is `offline`/`unauthorized`, or the
selected device does not support `arm64-v8a`. With multiple devices, pass the
explicit `-s <serial>` selector to every ADB command and redact the serial from
stored evidence.

## 2. Start an isolated current-branch synthetic backend

The APK requires port 3003 on the exact embedded LAN address. PostgreSQL must
remain loopback-only. Do not run the backend with `NODE_ENV=test`: that mode
skips normal worker freshness, audit and rate-limit behavior.

Use the portable PostgreSQL cluster only after confirming ports 3003 and 55432
are unused. Create a new uniquely named database; do not reuse a production,
staging or prior evidence database.

```powershell
$repo = 'C:\Users\PadelZone\Documents\GitHub\_worktrees\Togt-grounded-momentum-p0-2026-08-29'
$backend = Join-Path $repo 'backend'
$expectedSourceCommit = '31c41eb2fbcbb52762bf3d01b22259dcf4de3f94'
$pgBin = 'C:\Users\PadelZone\Documents\GitHub\_tooling\Togt-postgres-17.11\pgsql\bin'
$pgData = 'C:\Users\PadelZone\Documents\GitHub\_runtime\Togt-postgres-test-17.11\data'
$pgPort = 55432
$apiPort = 3003
$lanIp = '192.168.10.126'
$databaseName = 'togt_p0_lan_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
if (Get-Variable -Name createdDatabaseName,createdDatabaseOid -ErrorAction SilentlyContinue) {
  throw 'This shell contains prior database identity state; use a fresh operator shell.'
}

& git -C $repo cat-file -e "$expectedSourceCommit`^{commit}"
if ($LASTEXITCODE -ne 0) { throw 'Reviewed backend source commit is unavailable.' }
$backendDelta = @(& git -C $repo diff --name-only $expectedSourceCommit -- backend)
if ($LASTEXITCODE -ne 0 -or $backendDelta.Count -ne 0) {
  throw "Backend no longer matches $expectedSourceCommit`: $($backendDelta -join ', ')"
}
$backendStatus = @(& git -C $repo status --porcelain --untracked-files=all -- backend)
if ($LASTEXITCODE -ne 0 -or $backendStatus.Count -ne 0) {
  throw "Backend worktree is dirty: $($backendStatus -join ', ')"
}
if (Test-Path -LiteralPath (Join-Path $backend '.env')) {
  throw 'backend/.env must be absent so dotenv cannot repopulate provider credentials.'
}
foreach ($preloadName in 'NODE_OPTIONS','NODE_PATH','DOTENV_CONFIG_PATH','DOTENV_CONFIG_OVERRIDE') {
  if (Test-Path -LiteralPath "Env:$preloadName") {
    throw "Inherited Node/dotenv preload is not allowed: $preloadName"
  }
}

if (Get-NetTCPConnection -State Listen -LocalPort $pgPort,$apiPort -ErrorAction SilentlyContinue) {
  throw 'Ports 3003 or 55432 are already in use.'
}

function New-RandomHex([int] $bytes) {
  [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes)).ToLowerInvariant()
}

$taskEnvironmentNames = @(
  'NODE_ENV','PORT','TOGT_BIND_HOST','DATABASE_URL','JWT_SECRET','JWT_REFRESH_SECRET',
  'WEBHOOK_SECRET_ENCRYPTION_KEY','PII_BLIND_INDEX_KEY','PEACH_WEBHOOK_SECRET',
  'CORS_ORIGINS','API_PUBLIC_BASE_URL','API_PUBLIC_HOST','WEBHOOK_SSRF_FORCE',
  'PEACH_BASE_URL','VERIFYNOW_BASE_URL','PEACH_ENTITY_ID','PEACH_ACCESS_TOKEN',
  'VERIFYNOW_API_KEY','RESEND_API_KEY','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET','CLOUDINARY_URL','CLOUDINARY_ACCOUNT_URL',
  'CLOUDINARY_API_PROXY'
)
$previousTaskEnvironment = @{}
foreach ($environmentName in $taskEnvironmentNames) {
  $environmentPath = "Env:$environmentName"
  $previousTaskEnvironment[$environmentName] = [pscustomobject]@{
    existed = Test-Path -LiteralPath $environmentPath
    value = if (Test-Path -LiteralPath $environmentPath) { (Get-Item -LiteralPath $environmentPath).Value } else { $null }
  }
}
function Restore-TaskEnvironment {
  foreach ($environmentName in $taskEnvironmentNames) {
    $previous = $previousTaskEnvironment[$environmentName]
    if ($previous.existed) {
      Set-Item -LiteralPath "Env:$environmentName" -Value $previous.value
    } else {
      Remove-Item -LiteralPath "Env:$environmentName" -ErrorAction SilentlyContinue
    }
  }
}

$env:NODE_ENV = 'development'
$env:PORT = "$apiPort"
$env:TOGT_BIND_HOST = $lanIp
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$pgPort/$databaseName"
$env:JWT_SECRET = New-RandomHex 48
$env:JWT_REFRESH_SECRET = New-RandomHex 48
$env:WEBHOOK_SECRET_ENCRYPTION_KEY = New-RandomHex 32
$env:PII_BLIND_INDEX_KEY = New-RandomHex 32
$env:PEACH_WEBHOOK_SECRET = New-RandomHex 48
$env:CORS_ORIGINS = "http://${lanIp}:$apiPort"
$env:API_PUBLIC_BASE_URL = "http://${lanIp}:$apiPort"
$env:API_PUBLIC_HOST = "http://${lanIp}:$apiPort"
$env:WEBHOOK_SSRF_FORCE = '1'
$env:PEACH_BASE_URL = 'http://127.0.0.1:9'
$env:VERIFYNOW_BASE_URL = 'http://127.0.0.1:9'
Remove-Item Env:PEACH_ENTITY_ID,Env:PEACH_ACCESS_TOKEN,Env:VERIFYNOW_API_KEY,Env:RESEND_API_KEY,Env:CLOUDINARY_CLOUD_NAME,Env:CLOUDINARY_API_KEY,Env:CLOUDINARY_API_SECRET,Env:CLOUDINARY_URL,Env:CLOUDINARY_ACCOUNT_URL,Env:CLOUDINARY_API_PROXY -ErrorAction SilentlyContinue
$providerEnvironmentNames = @('PEACH_ENTITY_ID','PEACH_ACCESS_TOKEN','VERIFYNOW_API_KEY','RESEND_API_KEY','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','CLOUDINARY_URL','CLOUDINARY_ACCOUNT_URL','CLOUDINARY_API_PROXY')
foreach ($providerName in $providerEnvironmentNames) {
  if (Test-Path -LiteralPath "Env:$providerName") {
    throw "Provider environment variable remained set: $providerName"
  }
}

$pgStarted = $false
$databaseCreated = $false
try {
  & "$pgBin\pg_ctl.exe" start -D $pgData -l "$env:TEMP\togt-p0t07-postgres.log" -o "-h 127.0.0.1 -p $pgPort" -w
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL failed to start.' }
  $pgStarted = $true
  & "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL is not ready.' }
  & "$pgBin\createdb.exe" -h 127.0.0.1 -p $pgPort -U postgres -T template0 -E UTF8 $databaseName
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic database creation failed.' }
  $databaseCreated = $true
  $databaseOid = ((& "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d postgres -Atc "SELECT oid FROM pg_database WHERE datname = '$databaseName';") -join '').Trim()
  if ($LASTEXITCODE -ne 0 -or $databaseOid -notmatch '^\d+$') {
    throw 'Could not bind cleanup to the created synthetic database OID.'
  }
  Set-Variable -Name createdDatabaseName -Value $databaseName -Option ReadOnly
  Set-Variable -Name createdDatabaseOid -Value $databaseOid -Option ReadOnly

  Set-Location -LiteralPath $backend
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Backend dependency install failed.' }
  npm run migrate
  if ($LASTEXITCODE -ne 0) { throw 'Backend migration failed.' }
} catch {
  $setupError = $_
  $setupRollbackErrors = @()
  if ($databaseCreated) {
    $recordedName = Get-Variable -Name createdDatabaseName -ValueOnly -ErrorAction SilentlyContinue
    $recordedOid = Get-Variable -Name createdDatabaseOid -ValueOnly -ErrorAction SilentlyContinue
    $currentOid = if ($recordedName -match '^togt_p0_lan_\d{8}_\d{6}$') {
      ((& "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d postgres -Atc "SELECT oid FROM pg_database WHERE datname = '$recordedName';") -join '').Trim()
    } else { '' }
    if ($LASTEXITCODE -ne 0 -or -not $recordedOid -or $currentOid -ne $recordedOid) {
      $setupRollbackErrors += 'Synthetic database identity could not be proven for rollback.'
    } else {
      & "$pgBin\dropdb.exe" -h 127.0.0.1 -p $pgPort -U postgres --if-exists $recordedName
      if ($LASTEXITCODE -ne 0) { $setupRollbackErrors += 'Synthetic database rollback failed.' }
    }
  }
  if ($pgStarted) {
    & "$pgBin\pg_ctl.exe" stop -D $pgData -m fast -w -t 30
    if ($LASTEXITCODE -ne 0) { $setupRollbackErrors += 'PostgreSQL rollback stop failed.' }
  }
  $rollbackListeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in 3003,55432)
  if ($rollbackListeners.Count -ne 0) { $setupRollbackErrors += 'Temporary listeners remain after setup rollback.' }
  Restore-TaskEnvironment
  if ($setupRollbackErrors.Count -ne 0) {
    throw "Setup failed: $($setupError.Exception.Message). Rollback also failed: $($setupRollbackErrors -join '; ')"
  }
  throw $setupError
}
```

Keep provider credentials unset. Payment, KYC, push and maps must remain
capability-off.

The host currently has broad Public-profile Node firewall rules. Before exposing
the API, use an elevated PowerShell to record their current enabled state,
temporarily disable them, and allow only TCP/3003 on `192.168.10.126` from the
reviewed test phone IP addresses. Keep this same shell open for restoration.
Replace the phone placeholders only after checking each device's current Wi-Fi
address:

```powershell
$nodePath = 'C:\Program Files\nodejs\node.exe'
$lanIp = '192.168.10.126'
$apiPort = 3003
$phoneIps = @('<reviewed-phone-1-ip>','<reviewed-phone-2-ip>')
$temporaryRuleName = 'TOGT-P0T07-API-20260829'
$firewallStatePath = Join-Path $env:TEMP 'togt-p0t07-firewall-state.json'

if (Get-NetFirewallRule -Name $temporaryRuleName -ErrorAction SilentlyContinue) {
  throw "Temporary firewall rule already exists: $temporaryRuleName"
}
if (Test-Path -LiteralPath $firewallStatePath) {
  throw "A prior firewall state file requires review: $firewallStatePath"
}
$wifiProfiles = @(Get-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -ErrorAction Stop)
if ($wifiProfiles.Count -ne 1 -or $wifiProfiles[0].NetworkCategory -ne 'Public') {
  throw 'This reviewed firewall sequence requires exactly one active Wi-Fi profile in category Public.'
}
$activeWifiIps = @(Get-NetIPAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 -AddressState Preferred | Select-Object -ExpandProperty IPAddress)
if ($activeWifiIps -notcontains $lanIp) {
  throw "Wi-Fi no longer owns the embedded APK address $lanIp."
}
if (($phoneIps | Sort-Object -Unique).Count -ne $phoneIps.Count) {
  throw 'Each test phone must have a distinct reviewed IP address.'
}
foreach ($phoneIp in $phoneIps) {
  $parsedPhoneIp = $null
  if (-not [Net.IPAddress]::TryParse($phoneIp, [ref] $parsedPhoneIp)) {
    throw "Invalid phone IP address: $phoneIp"
  }
  $octets = $parsedPhoneIp.GetAddressBytes()
  if ($octets.Length -ne 4 -or $octets[0] -ne 192 -or $octets[1] -ne 168 -or $octets[2] -ne 10 -or $octets[3] -in 0,126,255) {
    throw "Phone IP is outside the reviewed 192.168.10.0/24 client range: $phoneIp"
  }
}

$nodeFilters = @(Get-NetFirewallApplicationFilter -Program $nodePath -ErrorAction Stop)
$previouslyEnabledNodeRules = @(
  $nodeFilters |
    ForEach-Object { Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $_ } |
    Sort-Object Name -Unique |
    Where-Object {
      $_.Direction -eq 'Inbound' -and
      $_.Action -eq 'Allow' -and
      $_.Enabled -eq 'True' -and
      $_.Profile -eq 'Public'
    }
)
$previouslyEnabledNodeRuleNames = @($previouslyEnabledNodeRules.Name)
if ($previouslyEnabledNodeRules.Count -ne 2) {
  throw "Expected exactly two enabled broad Public Node rules; found $($previouslyEnabledNodeRules.Count). Review before continuing."
}

[pscustomobject]@{
  temporary_rule_name = $temporaryRuleName
  previously_enabled_rule_names = $previouslyEnabledNodeRuleNames
} | ConvertTo-Json | Set-Content -LiteralPath $firewallStatePath -Encoding utf8 -NoNewline

try {
  New-NetFirewallRule -Name $temporaryRuleName -DisplayName 'TOGT P0T-07 synthetic API' -Direction Inbound -Action Allow -Enabled True -Profile Public -Protocol TCP -Program $nodePath -LocalAddress $lanIp -LocalPort $apiPort -RemoteAddress $phoneIps -ErrorAction Stop | Out-Null
  $previouslyEnabledNodeRules | Disable-NetFirewallRule -ErrorAction Stop
  $stillEnabled = @(Get-NetFirewallRule -Name $previouslyEnabledNodeRuleNames | Where-Object Enabled -eq 'True')
  if ($stillEnabled.Count -ne 0) {
    throw 'One or more broad Public Node rules remained enabled.'
  }
} catch {
  $firewallSetupError = $_
  $firewallRollbackErrors = @()
  try {
    if (Get-NetFirewallRule -Name $temporaryRuleName -ErrorAction SilentlyContinue) {
      Remove-NetFirewallRule -Name $temporaryRuleName -ErrorAction Stop
    }
  } catch {
    $firewallRollbackErrors += $_.Exception.Message
  }
  foreach ($ruleName in $previouslyEnabledNodeRuleNames) {
    try {
      Enable-NetFirewallRule -Name $ruleName -ErrorAction Stop
    } catch {
      $firewallRollbackErrors += $_.Exception.Message
    }
  }
  if ($firewallRollbackErrors.Count -ne 0) {
    throw "Firewall setup failed and rollback requires manual recovery from $firewallStatePath`: $($firewallRollbackErrors -join '; ')"
  }
  Remove-Item -LiteralPath $firewallStatePath
  throw $firewallSetupError
}
```

CORS is not a substitute for the firewall boundary.

Return to the same non-elevated operator PowerShell that holds the generated
environment and is already in the backend directory. Start this foreground
bootstrap; it binds only the reviewed address, immediately ticks the real
workers and refuses to listen unless their freshness checks pass:

```powershell
$backendDelta = @(& git -C $repo diff --name-only $expectedSourceCommit -- backend)
$backendDiffExit = $LASTEXITCODE
$backendStatus = @(& git -C $repo status --porcelain --untracked-files=all -- backend)
$backendStatusExit = $LASTEXITCODE
if ($backendDiffExit -ne 0 -or $backendStatusExit -ne 0 -or $backendDelta.Count -ne 0 -or $backendStatus.Count -ne 0) {
  throw 'Backend changed after dependency install/migration; refusing to start.'
}
foreach ($preloadName in 'NODE_OPTIONS','NODE_PATH','DOTENV_CONFIG_PATH','DOTENV_CONFIG_OVERRIDE') {
  if (Test-Path -LiteralPath "Env:$preloadName") {
    throw "Inherited Node/dotenv preload is not allowed: $preloadName"
  }
}
```

```powershell
@'
'use strict';
const { app, server } = require('./src/app');
const db = require('./src/config/db');
const matcher = require('./src/services/matcher');
const dispatcher = require('./src/services/webhookDispatcher');
const maintenance = require('./src/services/maintenanceSweepers');
const io = app.get('io');

const port = Number(process.env.PORT);
const host = process.env.TOGT_BIND_HOST;
const databaseUrl = process.env.DATABASE_URL;
let closing = false;

async function close(code, signal) {
  if (closing) return;
  closing = true;
  console.log(`[shutdown] ${signal}`);
  const forceExit = setTimeout(() => {
    console.error('[shutdown] forced exit after 10s');
    process.exit(1);
  }, 10_000);
  let exitCode = code;
  try {
    dispatcher.stop();
    maintenance.stop();
    if (io) {
      await new Promise((resolve) => io.close(resolve));
    }
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  } catch (error) {
    exitCode = 1;
    console.error('[shutdown] transport close failed:', error.message);
  }
  try {
    await db.end();
  } catch (error) {
    exitCode = 1;
    console.error('[shutdown] database close failed:', error.message);
  }
  clearTimeout(forceExit);
  process.exit(exitCode);
}

process.on('SIGINT', () => { void close(0, 'SIGINT'); });
process.on('SIGTERM', () => { void close(0, 'SIGTERM'); });

(async () => {
  if (process.env.NODE_ENV !== 'development' || host !== '192.168.10.126' || port !== 3003) {
    throw new Error('The artifact-specific development host/port contract changed');
  }
  if (!/^postgresql:\/\/postgres@127\.0\.0\.1:55432\/togt_p0_lan_\d{8}_\d{6}$/.test(databaseUrl || '')) {
    throw new Error('The isolated loopback database contract changed');
  }
  await matcher.sweepStalePending();
  dispatcher.start();
  maintenance.start();
  await dispatcher.tick();
  await maintenance.tick();
  if (!dispatcher.isFresh() || !maintenance.isFresh()) {
    throw new Error('background workers did not become ready');
  }
  server.once('error', (error) => {
    console.error('[server] fatal:', error.message);
    void close(1, 'server-error');
  });
  server.listen(port, host, () => {
    console.log(`Togt synthetic API listening on http://${host}:${port}`);
  });
})().catch((error) => {
  console.error('[startup] fatal:', error.message);
  void close(1, 'startup-error');
});
'@ | node -
```

From a second shell and from each phone, require both URLs to load before APK
testing:

```text
http://192.168.10.126:3003/health/deep
http://192.168.10.126:3003/api/capabilities
```

The deep result must report process/database `ok` and dispatcher/sweepers
`fresh`. Capabilities must return HTTP 200, `schema_version=1`,
`ttl_seconds=300`, and the expected fail-closed provider flags.

```powershell
$apiOrigin = 'http://192.168.10.126:3003'
$deep = Invoke-RestMethod -Uri "$apiOrigin/health/deep" -TimeoutSec 10
if ($deep.status -ne 'ok' -or $deep.checks.process -ne 'ok' -or $deep.checks.db -ne 'ok' -or $deep.checks.dispatcher -ne 'fresh' -or $deep.checks.sweepers -ne 'fresh') {
  throw "Backend readiness is not green: $($deep | ConvertTo-Json -Depth 5 -Compress)"
}
$capabilities = Invoke-RestMethod -Uri "$apiOrigin/api/capabilities" -TimeoutSec 10
$generatedAt = [DateTimeOffset]::MinValue
$generatedAtParsed = [DateTimeOffset]::TryParse([string] $capabilities.generated_at, [ref] $generatedAt)
$generatedAge = [DateTimeOffset]::UtcNow - $generatedAt.ToUniversalTime()
if ($capabilities.schema_version -ne 1 -or $capabilities.ttl_seconds -ne 300 -or $capabilities.minimum_app_version -ne '1.0.0' -or -not $generatedAtParsed -or $generatedAge.TotalSeconds -lt -5 -or $generatedAge.TotalSeconds -gt 30) {
  throw 'Capability schema, minimum version or freshness is unexpected.'
}
$expectedOff = @('peach_checkout','cash_settlement','identity_verification','selfie_identity_verification','remote_push','background_tracking','public_live_share','operated_sos')
foreach ($featureName in $expectedOff) {
  $feature = $capabilities.features.PSObject.Properties[$featureName].Value
  if ($null -eq $feature -or $feature.available -ne $false -or [string]::IsNullOrWhiteSpace([string] $feature.reason_code)) {
    throw "Capability must remain off: $featureName"
  }
}
$expectedOn = [ordered]@{
  foreground_location_updates = 'active_app_only'
  booking_details_share = 'non_live_no_address'
  emergency_call = 'device_dialer'
}
foreach ($featureName in $expectedOn.Keys) {
  $feature = $capabilities.features.PSObject.Properties[$featureName].Value
  if ($null -eq $feature -or $feature.available -ne $true -or $feature.mode -ne $expectedOn[$featureName]) {
    throw "Capability must be available in the expected mode: $featureName"
  }
}
```

## 3. Prove same-signer upgrade over v1

First perform a v1 clean install. Because its legacy API origin is degraded,
do not try to create an authenticated session. Require a stable cold launch and
truthful bounded offline/retry behavior, then record the package metadata.

```powershell
$installedPackage = (Invoke-SelectedAdb shell pm list packages za.togt.app) -join "`n"
if ($installedPackage -match 'package:za\.togt\.app') {
  Invoke-SelectedAdb uninstall za.togt.app
}
Invoke-SelectedAdb install $v1
$v1PackageDump = (Invoke-SelectedAdb shell dumpsys package za.togt.app) -join "`n"
if ($v1PackageDump -notmatch 'versionCode=1\b' -or $v1PackageDump -notmatch 'versionName=1\.0\.0\b') {
  throw 'The installed v1 package identity is wrong.'
}
$v1UserId = [regex]::Match($v1PackageDump, '(?m)^\s*userId=(\d+)').Groups[1].Value
$v1FirstInstall = [regex]::Match($v1PackageDump, '(?m)^\s*firstInstallTime=(.+)$').Groups[1].Value.Trim()
$v1LastUpdate = [regex]::Match($v1PackageDump, '(?m)^\s*lastUpdateTime=(.+)$').Groups[1].Value.Trim()
if (-not $v1UserId -or -not $v1FirstInstall -or -not $v1LastUpdate) {
  throw 'Could not capture v1 package upgrade evidence.'
}
Invoke-SelectedAdb shell monkey -p za.togt.app -c android.intent.category.LAUNCHER 1
Start-Sleep -Seconds 2
Invoke-SelectedAdb shell pidof za.togt.app
```

Then install v2 without uninstalling and without clearing app data:

```powershell
Invoke-SelectedAdb shell am force-stop za.togt.app
Invoke-SelectedAdb install -r $v2
$v2UpgradeDump = (Invoke-SelectedAdb shell dumpsys package za.togt.app) -join "`n"
if ($v2UpgradeDump -notmatch 'versionCode=2\b' -or $v2UpgradeDump -notmatch 'versionName=1\.0\.1\b') {
  throw 'The upgraded v2 package identity is wrong.'
}
$v2UserId = [regex]::Match($v2UpgradeDump, '(?m)^\s*userId=(\d+)').Groups[1].Value
$v2FirstInstall = [regex]::Match($v2UpgradeDump, '(?m)^\s*firstInstallTime=(.+)$').Groups[1].Value.Trim()
$v2LastUpdate = [regex]::Match($v2UpgradeDump, '(?m)^\s*lastUpdateTime=(.+)$').Groups[1].Value.Trim()
$v1LastUpdateTime = [datetime]::Parse($v1LastUpdate, [Globalization.CultureInfo]::InvariantCulture)
$v2LastUpdateTime = [datetime]::Parse($v2LastUpdate, [Globalization.CultureInfo]::InvariantCulture)
if ($v2UserId -ne $v1UserId -or $v2FirstInstall -ne $v1FirstInstall -or $v2LastUpdateTime -le $v1LastUpdateTime) {
  throw 'Android package metadata does not prove an in-place v1-to-v2 upgrade.'
}
Invoke-SelectedAdb shell monkey -p za.togt.app -c android.intent.category.LAUNCHER 1
Start-Sleep -Seconds 2
Invoke-SelectedAdb shell pidof za.togt.app
```

Require version code 2/name 1.0.1, the same Android user ID and first-install
time, a newer last-update time and successful cold launch. Then prove v2 can
reach the current synthetic backend and sign in normally. Any
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` result is a hard rejection. This proves
same-package/same-signer replacement; it does not prove authenticated v1 session
migration.

After upgrade evidence, uninstall and clean-install v2 once to prove the fresh
path independently:

```powershell
Invoke-SelectedAdb uninstall za.togt.app
Invoke-SelectedAdb install $v2
$v2CleanDump = (Invoke-SelectedAdb shell dumpsys package za.togt.app) -join "`n"
if ($v2CleanDump -notmatch 'versionCode=2\b' -or $v2CleanDump -notmatch 'versionName=1\.0\.1\b') {
  throw 'The clean-installed v2 package identity is wrong.'
}
Invoke-SelectedAdb shell monkey -p za.togt.app -c android.intent.category.LAUNCHER 1
Start-Sleep -Seconds 2
Invoke-SelectedAdb shell pidof za.togt.app
```

## 4. Run the paired synthetic smoke

Use one synthetic customer and one synthetic worker concurrently. Capture only
sanitized result evidence.

Do not repeat the single-client x86_64 cases merely for exploratory coverage.
This physical pass is specifically for exact corrected ARM64 execution, OEM
permission/background behavior, exact v1 ARM64-to-v2 replacement, the paired
customer/worker lifecycle, deliberately enabled provider paths when approved,
and representative-device performance.

Before the lifecycle cases, select and retain one explicit authorized serial
for each client, verify both ABI lists include `arm64-v8a`, and use `-s` on every
ADB command. Never issue a bare multi-device ADB command. On the fresh database,
prepare the minimum fixture through the normal app/API contracts in this order:

1. Register one synthetic customer and one synthetic worker.
2. Complete the worker's minimum profile with synthetic data.
3. Create and activate at least one service offered by that worker.
4. Set worker availability and publish a fresh foreground location.
5. Give the customer a fresh foreground location and prove discovery.
6. Run direct booking first, then reset terminal state and run scheduled
   request/auto-match.

- Clean and upgrade cold launch; sign-in, authoritative restore, retry/offline
  and logout.
- Customer discovery and worker-profile stable-ID routes.
- Direct booking and scheduled-request lifecycle.
- Worker offer receipt and accept, scope confirmation, six-digit customer start
  PIN, active job and completion.
- Correct nested/back navigation and no duplicate screens/listeners after
  restart or reconnect.
- Foreground-only tracking and freshness qualifications.
- No unsolicited audio, notification, overlay, camera or location permission
  prompt on cold launch; each in-context denial path remains usable and truthful.
- Payment, KYC, push, SOS, public sharing and background tracking remain
  truthfully unavailable/qualified.
- Consequential offline mutations fail closed and do not replay unexpectedly.
- No native crash, fatal JavaScript exception or unhandled rejection.
- After every offline/reconnect case, recheck both device Wi-Fi IPs. If either
  changed, stop the smoke and use the in-place scoped-rule update below before
  continuing. Do not rerun firewall setup or temporarily restore the broad Node
  rules.

Run this only in the still-open elevated firewall shell, replacing both values
with the newly reviewed device addresses:

```powershell
$newPhoneIps = @('<new-reviewed-phone-1-ip>','<new-reviewed-phone-2-ip>')
if (($newPhoneIps | Sort-Object -Unique).Count -ne 2) {
  throw 'Two distinct reviewed phone IPs are required.'
}
foreach ($phoneIp in $newPhoneIps) {
  $parsedPhoneIp = $null
  if (-not [Net.IPAddress]::TryParse($phoneIp, [ref] $parsedPhoneIp)) {
    throw "Invalid phone IP address: $phoneIp"
  }
  $octets = $parsedPhoneIp.GetAddressBytes()
  if ($octets.Length -ne 4 -or $octets[0] -ne 192 -or $octets[1] -ne 168 -or $octets[2] -ne 10 -or $octets[3] -in 0,126,255) {
    throw "Phone IP is outside the reviewed client range: $phoneIp"
  }
}
$temporaryRule = Get-NetFirewallRule -Name $temporaryRuleName -ErrorAction Stop
$addressFilters = @(Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $temporaryRule)
if ($addressFilters.Count -ne 1) { throw 'Temporary rule address-filter topology changed.' }
$previousRemoteAddresses = @($addressFilters[0].RemoteAddress)
try {
  Set-NetFirewallAddressFilter -InputObject $addressFilters[0] -RemoteAddress $newPhoneIps -ErrorAction Stop | Out-Null
  $updatedFilter = Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $temporaryRule
  $actualRemoteKey = @($updatedFilter.RemoteAddress | Sort-Object) -join ','
  $expectedRemoteKey = @($newPhoneIps | Sort-Object) -join ','
  if ($actualRemoteKey -ne $expectedRemoteKey) {
    throw 'Temporary rule remote-address verification failed.'
  }
  $phoneIps = $newPhoneIps
} catch {
  Set-NetFirewallAddressFilter -InputObject $addressFilters[0] -RemoteAddress $previousRemoteAddresses -ErrorAction SilentlyContinue | Out-Null
  throw
}
```

Clear logcat before each bounded case. Retain only sanitized app-relevant errors;
remove ADB serials, tokens, PII, chat contents and exact coordinates.

```powershell
$casePid = ((Invoke-SelectedAdb shell pidof za.togt.app) -join '').Trim()
if ($casePid -notmatch '^\d+$') { throw 'The app process is not alive before the case.' }
Invoke-SelectedAdb logcat -c
# Run one bounded case.
$afterCasePid = ((Invoke-SelectedAdb shell pidof za.togt.app) -join '').Trim()
if ($afterCasePid -ne $casePid) { throw 'The app process died or restarted during the bounded case.' }
Invoke-SelectedAdb logcat -d '*:S' 'AndroidRuntime:E' 'ReactNativeJS:W' 'ReactNative:E' 'libc:F' 'DEBUG:F' 'crash_dump64:F' 'crash_dump32:F'
```

## 5. Evidence and cleanup

Record:

- APK filename and SHA-256;
- manifest filename, source commit and configuration class;
- API origin and capability-contract result;
- redacted device model/Android version/ABI;
- clean-install, upgrade and paired-smoke result;
- any sanitized issue IDs and explicit rejected gates.

Then Ctrl+C the foreground Node bootstrap. In the still-open elevated firewall
shell, load the recorded state, remove only the named temporary rule and restore
only the Node rules recorded as previously enabled. If any cleanup action fails,
leave the state file in place and stop for manual recovery:

```powershell
$recordedFirewallState = Get-Content -LiteralPath $firewallStatePath -Raw | ConvertFrom-Json
if ($recordedFirewallState.temporary_rule_name -ne $temporaryRuleName) {
  throw 'Recorded firewall state does not match this session.'
}

$firewallCleanupErrors = @()
try {
  Remove-NetFirewallRule -Name $temporaryRuleName -ErrorAction Stop
} catch {
  $firewallCleanupErrors += $_.Exception.Message
}
foreach ($ruleName in $recordedFirewallState.previously_enabled_rule_names) {
  try {
    Enable-NetFirewallRule -Name $ruleName -ErrorAction Stop
  } catch {
    $firewallCleanupErrors += $_.Exception.Message
  }
}
if ($firewallCleanupErrors.Count -ne 0) {
  throw ($firewallCleanupErrors -join '; ')
}
Remove-Item -LiteralPath $firewallStatePath
```

Regardless of the firewall-shell outcome, return to the non-elevated operator
shell. Drop only the validated `togt_p0_lan_*` database created in this session,
then stop the exact cluster even if the database drop reports an error:

```powershell
$runtimeCleanupErrors = @()
if ($databaseCreated -ne $true) {
  $runtimeCleanupErrors += 'This shell did not record creation of the synthetic database.'
} else {
  $recordedName = Get-Variable -Name createdDatabaseName -ValueOnly -ErrorAction SilentlyContinue
  $recordedOid = Get-Variable -Name createdDatabaseOid -ValueOnly -ErrorAction SilentlyContinue
  $currentOid = if ($recordedName -match '^togt_p0_lan_\d{8}_\d{6}$') {
    ((& "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d postgres -Atc "SELECT oid FROM pg_database WHERE datname = '$recordedName';") -join '').Trim()
  } else { '' }
  if ($LASTEXITCODE -ne 0 -or -not $recordedOid -or $currentOid -ne $recordedOid) {
    $runtimeCleanupErrors += 'Synthetic database identity no longer matches the recorded name/OID; refusing to drop it.'
  } else {
    & "$pgBin\dropdb.exe" -h 127.0.0.1 -p $pgPort -U postgres --if-exists $recordedName
    if ($LASTEXITCODE -ne 0) { $runtimeCleanupErrors += 'Synthetic database cleanup failed.' }
  }
}
& "$pgBin\pg_ctl.exe" stop -D $pgData -m fast -w -t 30
if ($LASTEXITCODE -ne 0) { $runtimeCleanupErrors += 'PostgreSQL cleanup failed.' }
if ($adbServerStartedBySession) {
  & $adb kill-server
  if ($LASTEXITCODE -ne 0) { $runtimeCleanupErrors += 'ADB server cleanup failed.' }
}
$remainingListeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in 3003,55432)
if ($remainingListeners.Count -ne 0) { $runtimeCleanupErrors += 'Temporary listeners remain on ports 3003 or 55432.' }
Restore-TaskEnvironment
if ($runtimeCleanupErrors.Count -ne 0) { throw ($runtimeCleanupErrors -join '; ') }
```

After successful cleanup, close both task PowerShell windows. Do not delete the
retained v1 rollback APK, the tested v2 APK or its manifest. Decide explicitly
whether each test device should retain the synthetic v2 session; otherwise log
out and uninstall `za.togt.app` from each selected device before disconnecting.
