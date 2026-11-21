# NRV Error Codes and Recovery Reference

## Purpose and scope

This is the developer-facing source reference for every coded error found in
the NRV App runtime audit. It documents the current implementation; it does not
approve or introduce new user-facing wording or recovery behavior. The audit
found **23 defined codes**: `NRV-V01` through `NRV-V20`, `NRV-S01`,
`NRV-S02`, and `NRV-A01`.

The inventory is based on the startup verification gate and its test fixtures,
the independent startup watchdog, the setup walkthrough, and the English
localization catalog. A matching bilingual recovery-help fallback is embedded
in the app shell so it remains available when the application scripts or
localization files fail to load. A repository-wide search found no other
defined `NRV-[VSA]nn` runtime codes. `NRV-V99` occurs only as an unknown-code
test fixture; it is not defined or shown as a supported code.

The NRV public Site is a separate project. This reference covers App behavior
only; the Site was inspected read-only and was not changed.

For the App's storage boundaries, backup mechanisms, recovery hierarchy, and
current reminder behavior, see
[Storage, Backup, and Recovery Architecture](STORAGE_BACKUP_RECOVERY.md).

## Recovery design principles

### Least-destructive recovery

An error screen must not send users to uninstall/reinstall NRV, clear browser
or site data, erase/reset storage, or change browser/device copies as routine
troubleshooting. Those actions can make a particular local copy inaccessible
or permanently remove it. None of the 23 coded errors technically requires
uninstalling or reinstalling the app.

The coded startup gate stops before launching the application scripts that
open the app database. Its retry action updates/checks the service worker and
reloads application files; it does not delete or reset the IndexedDB database,
browser storage, or backups. `NRV-S02` is different: the watchdog knows startup
has begun opening saved information, but does not know how far initialization
or a migration progressed. Preserve that copy and do not clear, reinstall, or
restore over it as an initial response.

### Backup before risky recovery

Before any step that replaces, erases, clears, or moves saved information,
protect a current copy where technically possible. A full restore replaces the
contacts and settings at its destination. Erase/Start Fresh removes the
working copy's local database and browser state. Neither restoring nor
reinstalling should be assumed to reproduce the current local data.

The coded startup screens do not offer direct backup or restore controls.
NRV-S02 does link to Backup and recovery help, while the build-verification
screens do not. Do not tell a user to restore in response to a
build-verification code: these codes indicate that NRV could not safely verify
its application files, not that it found the user's saved data corrupt. If the
app can be opened in its original copy, a backup can be made from Settings. If
it cannot, keep that copy intact and seek help before attempting destructive
recovery.

Restore from a backup is appropriate when a suitable, compatible backup is
known to contain the information needed to recover an unreadable or missing
copy, or when deliberately moving information to another copy. First protect
any destination information that must be kept, select the intended backup,
confirm the replacement warning, and have the backup's passphrase/recovery
code if it is encrypted. A version/schema incompatibility should first be
addressed by checking for a compatible app update, not by erasing the source
copy.

## Shared coded-screen behavior

The startup verification screen displays the title **“NRV is keeping your
information safe”**, the code-specific message below, and a code button. For
`NRV-V02` through `NRV-V20`, it also offers **Check for Updates**. That action
re-runs verification, checks update metadata and the service-worker update,
and reloads only when the app can be safely verified. For `NRV-V01`, the
screen's retry and continue controls are hidden.

Selecting a code opens the offline-capable help dialog. Its title repeats the
code-specific message, its body contains **“Error code: NRV-...”**, and it
offers the same retry action as the screen, where applicable, plus **Close**.
Closing the help dialog only dismisses help; it does not retry, bypass
verification, or change saved data. The code button itself is a help control,
not a recovery action.

`NRV-S01` and `NRV-S02` are shown by the independent startup watchdog instead
of the verification screen. They have a **Try Again** screen button; their
code-help dialogs have **Try Again** and **Close**. Try Again attempts to
register/update the service worker when online, then reloads the document. It
does not clear or restore data.

The code-specific message is reproduced exactly as shown in the English
interface. The associated popup repeats that message as its heading and shows
the code label identified in each entry. The Spanish catalog and fallback
translations are intentionally not duplicated here; maintain them alongside
the same runtime behavior.

## Primary error-code inventory

### NRV-V01

- **Trigger / technical condition:** The installed-app check detects that the
  browser does not expose Service Worker support. This code is raised only
  for an installed/standalone app; a browser-mode copy does not take this
  specific failure path.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “This installed copy can’t run
  the check it needs, so NRV can’t safely continue here.” Popup code label:
  “Error code: NRV-V01”.
- **Available controls:** Startup screen: the error-code help button only.
  Popup: **Close**. The screen's **Check for Updates** and **Continue Offline**
  controls are hidden; the popup recovery-action button is also hidden.
- **What each control does:** The code button opens help; Close returns to the
  blocked screen. Neither control retries nor changes data.
- **Recovery logic:** NRV requires its installed copy's service worker to
  verify the app before it opens saved information. Without that API, it
  blocks startup rather than bypassing verification. The current screen does
  not provide a next-step recovery action.
- **Data risk:** **No expected local-data risk** from this blocked check; the
  app data-loading scripts have not been launched.
- **Backup requirement:** No backup is required before this check. The screen
  cannot create one. Before moving to another browser/copy, first back up from
  the original copy if it can be opened; browser and installed copies may use
  separate storage.
- **Reinstall / removal status:** **Reinstall not required.** A different
  supported way to open NRV may be a workaround, but the code does not show
  that reinstalling is necessary. Switching copies without a backup can make
  the original data appear missing.
- **Source location:** `../index.html`: `verificationCodes.serviceWorkerUnavailable`,
  `showFailure`, and the embedded `meanings` entry; `../locales/en.json`:
  `startup.verify.NRV-V01`; `../tests/startup-verification.js`.

### NRV-V02

- **Trigger / technical condition:** Service-worker registration rejects or
  otherwise fails for a reason other than the explicit registration timeout.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t set up its update
  check, so it can’t confirm this copy is ready.” Popup code label:
  “Error code: NRV-V02”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates retries registration and
  verification; Close only closes help.
- **Recovery logic:** Registration is needed for NRV to inspect and coordinate
  the cached application build. A transient failure may resolve on retry; if
  it does not, verification remains blocked rather than opening unverified
  code.
- **Data risk:** **No expected local-data risk** from the check or retry; the
  application data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. The error screen
  offers no backup control; keep regular backups for recovery from separate
  device/browser failures.
- **Reinstall / removal status:** **Reinstall not required.** This is an
  update-service registration failure, not evidence that local data or the
  installed app must be removed.
- **Source location:** `../index.html`: `updateRegistration`,
  `verificationCodes.registrationFailed`, `showFailure`, and `meanings`;
  `../locales/en.json`: `startup.verify.NRV-V02`;
  `../tests/startup-verification.js`.

### NRV-V03

- **Trigger / technical condition:** Registration succeeded, but the
  registration has no usable `update()` method or its update check fails for
  a non-timeout reason.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t complete its
  update check, so it can’t confirm this copy is ready.” Popup code label:
  “Error code: NRV-V03”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates retries the update check and
  build verification; Close only closes help.
- **Recovery logic:** A registered worker is not sufficient if NRV cannot
  ask it to check for a newer build. NRV blocks until it can verify a
  consistent app build.
- **Data risk:** **No expected local-data risk** from retry; app data scripts
  have not been launched.
- **Backup requirement:** No backup is required before retry. No backup or
  restore action is available on this screen.
- **Reinstall / removal status:** **Reinstall not required.** The failure is
  confined to the update check; removal or storage clearing is not a justified
  response.
- **Source location:** `../index.html`: `updateRegistration`,
  `verificationCodes.updateFailed`, `showFailure`, and `meanings`;
  `../locales/en.json`: `startup.verify.NRV-V03`;
  `../tests/startup-verification.js`.

### NRV-V04

- **Trigger / technical condition:** A service-worker installation/activation
  transition does not reach an activated worker in the allowed transition
  period (60 seconds), or no active worker is activated when worker state is
  checked.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV’s update check didn’t
  become ready in time, so NRV can’t confirm this copy is ready.” Popup code
  label: “Error code: NRV-V04”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates starts a new verification and
  update attempt; Close only closes help.
- **Recovery logic:** NRV waits for a new worker to activate and become the
  controller before trusting its application files. The timeout prevents an
  indefinitely stalled transition from opening an unverified build.
- **Data risk:** **No expected local-data risk** from the gate or retry; the
  application data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. The current
  screen cannot make one.
- **Reinstall / removal status:** **Reinstall not required.** The worker
  transition may complete on a later check; removing NRV does not repair
  saved-data access and can lead users to a different local copy.
- **Source location:** `../index.html`: `WORKER_TRANSITION_TIMEOUT_MS`,
  `waitForWorkerTransition`, `getWorkerState`, and
  `verificationCodes.activationTimeout`; `../locales/en.json`:
  `startup.verify.NRV-V04`; `../tests/startup-verification.js`.

### NRV-V05

- **Trigger / technical condition:** An active worker exists but the current
  page has no controlling service worker when NRV requires one, including
  after a worker transition fails to produce a controller.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t connect its check
  to this copy, so it can’t confirm this copy is ready.” Popup code label:
  “Error code: NRV-V05”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates repeats registration/update
  and controller/build verification; Close only closes help.
- **Recovery logic:** The page must be controlled by the verified worker so
  its cached files and release identity can be checked. NRV does not bypass
  the controller requirement.
- **Data risk:** **No expected local-data risk** from the check or retry; app
  data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. No backup
  control is present on the failure screen.
- **Reinstall / removal status:** **Reinstall not required.** This is a
  service-worker/page relationship failure, not a local database failure.
- **Source location:** `../index.html`: `getWorkerState`,
  `waitForWorkerTransition`, `verificationCodes.controllerUnavailable`, and
  `showFailure`; `../locales/en.json`: `startup.verify.NRV-V05`;
  `../tests/startup-verification.js`.

### NRV-V06

- **Trigger / technical condition:** A worker-revision query receives no
  response within the 1.5-second worker-reply timeout.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV didn’t receive an answer to
  its app check, so it can’t confirm this copy is ready.” Popup code label:
  “Error code: NRV-V06”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates repeats the worker query and
  build check; Close only closes help.
- **Recovery logic:** NRV asks the active and controlling workers to report
  their build revisions. A missing reply means the build relationship cannot
  be verified, so startup stays blocked.
- **Data risk:** **No expected local-data risk** from retry; app data scripts
  have not been launched.
- **Backup requirement:** No backup is required before retry. The failure
  screen cannot make a backup.
- **Reinstall / removal status:** **Reinstall not required.** No local data
  corruption is implied.
- **Source location:** `../index.html`: `WORKER_REPLY_TIMEOUT_MS`,
  `workerRevision`, `codeForWorkerResult`, and `verificationCodes.workerUnresponsive`;
  `../locales/en.json`: `startup.verify.NRV-V06`;
  `../tests/startup-verification.js`.

### NRV-V07

- **Trigger / technical condition:** A worker replies to the revision query,
  but its `revision` field is missing or is not the expected SHA-256 revision
  string.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV received an incomplete
  answer to its app check, so it can’t confirm this copy is ready.” Popup code
  label: “Error code: NRV-V07”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates repeats worker communication
  and verification; Close only closes help.
- **Recovery logic:** A reply without a valid revision cannot prove which app
  build the worker controls. NRV treats it as unverified instead of
  continuing.
- **Data risk:** **No expected local-data risk** from retry; app data scripts
  have not been launched.
- **Backup requirement:** No backup is required before retry. No backup
  control is offered.
- **Reinstall / removal status:** **Reinstall not required.** The failure is
  a malformed worker response, not evidence that local records must be
  removed.
- **Source location:** `../index.html`: `isRevision`, `workerRevision`,
  `codeForWorkerResult`, and `verificationCodes.workerResponseInvalid`;
  `../locales/en.json`: `startup.verify.NRV-V07`;
  `../tests/startup-verification.js`.

### NRV-V08

- **Trigger / technical condition:** A required app asset cannot be fetched
  and no usable cached response is available; this includes a failed request,
  a non-success HTTP response, or no valid offline copy. Response-body
  read/timeout failures use the separate `NRV-V19`/`NRV-V20` paths.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t get a file it
  needs to check this copy, so it can’t safely continue.” Popup code label:
  “Error code: NRV-V08”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates retries network/update
  retrieval and verification; Close only closes help.
- **Recovery logic:** The gate checks `app.js`, `dropbox.js`, `merge.js`, and,
  when supported, `service-worker.js`. A missing required source prevents
  build identity checks, so NRV will not launch the app.
- **Data risk:** **No expected local-data risk** from the failed read or
  retry; the app's data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. The error
  screen has no backup control.
- **Reinstall / removal status:** **Reinstall not required.** The issue is
  access to an app asset; clearing storage can remove useful cached assets
  and local data without fixing the source.
- **Source location:** `../index.html`: `fetchText`, its cache/network
  fallback rules, `readBuild`, and `verificationCodes.assetFetchFailed`;
  `../locales/en.json`: `startup.verify.NRV-V08`;
  `../tests/startup-verification.js`.

### NRV-V09

- **Trigger / technical condition:** Required release/build metadata cannot
  be parsed or lacks valid fields: the page, fetched app source, service-worker
  source, or deployed `version.json` has a missing/invalid version or
  revision.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t read the
  information it needs to check this copy, so it can’t safely continue.”
  Popup code label: “Error code: NRV-V09”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates re-fetches release metadata,
  checks the worker, and retries build verification; Close only closes help.
- **Recovery logic:** NRV validates version and SHA-256 revision fields
  before comparing page, app asset, worker, and deployment metadata. Invalid
  identity data makes the build unverifiable.
- **Data risk:** **No expected local-data risk** from verification or retry;
  app data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. No backup
  control is available on this screen.
- **Reinstall / removal status:** **Reinstall not required.** This indicates
  invalid or incomplete app-build metadata, not damaged user records.
- **Source location:** `../index.html`: `isRevision`, `readMetadata`,
  `readBuild`, `verificationCodes.verificationDataInvalid`, and `showFailure`;
  `../locales/en.json`: `startup.verify.NRV-V09`;
  `../tests/startup-verification.js`.

### NRV-V10

- **Trigger / technical condition:** The page's build revision differs from
  the revision in the deployed `version.json` metadata.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “This NRV page doesn’t match
  the release information NRV checked, so it can’t safely continue.” Popup
  code label: “Error code: NRV-V10”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates re-fetches metadata, checks
  the worker, and retries verification; Close only closes help.
- **Recovery logic:** This comparison detects a page from a different release
  than the deployment metadata. The gate blocks instead of mixing release
  parts or opening data under an unverified build.
- **Data risk:** **No expected local-data risk** from the check or retry; the
  app's data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. The screen
  cannot create one.
- **Reinstall / removal status:** **Reinstall not required.** The evidence
  points to inconsistent deployed app files; removal of local data is
  unrelated.
- **Source location:** `../index.html`: `readBuild`,
  `verificationCodes.pageRevisionMismatch`, and `showFailure`;
  `../locales/en.json`: `startup.verify.NRV-V10`;
  `../tests/startup-verification.js`.

### NRV-V11

- **Trigger / technical condition:** A fetched app asset's revision is
  inconsistent with the page/deployment revision. The explicit mismatches
  include `app.js` versus `version.json`, `app.js` versus the page, and the
  service-worker source versus the page.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “Parts of NRV do not match the
  same release, so NRV can’t safely open your saved information.” Popup code
  label: “Error code: NRV-V11”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates refreshes the build sources
  and metadata, then repeats the consistency check; Close only closes help.
- **Recovery logic:** The app, page, worker, and release metadata must agree
  before the verified scripts can access saved information. A mismatch can
  result from a partial/stale deployment or cache, so the gate retries
  verification rather than clearing app data.
- **Data risk:** **No expected local-data risk** from the gated retry; the
  app data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. Backup/restore
  is not offered before verification.
- **Reinstall / removal status:** **Reinstall not required.** Resolve the
  inconsistent asset/build state; do not erase local data to fix it.
- **Source location:** `../index.html`: `readBuild`,
  `verificationCodes.assetRevisionMismatch`, and `showFailure`;
  `../locales/en.json`: `startup.verify.NRV-V11`;
  `../tests/startup-verification.js`.

### NRV-V12

- **Trigger / technical condition:** The active service worker reports a
  revision different from the page revision. If the active/controller
  relationship indicates that a newer active worker is ready, NRV can
  perform one guarded reload to enter that worker; if the mismatch remains,
  it raises this code.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “Parts of NRV do not match the
  same release, so NRV needs to check for an update before opening your saved
  information.” Popup code label: “Error code: NRV-V12”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates retries worker/update checks
  and the guarded one-time reload logic; Close only closes help.
- **Recovery logic:** The active worker controls the cached app and must
  match the page before it can safely launch. A session-storage marker limits
  automatic update reloads so NRV does not enter an unbounded reload loop.
- **Data risk:** **No expected local-data risk** from the verification or
  guarded reload. Only app assets and a session-scoped reload marker are
  involved before application data scripts run.
- **Backup requirement:** No backup is required before retry; no backup
  option is present on the blocked screen.
- **Reinstall / removal status:** **Reinstall not required.** The gate
  explicitly checks for a coherent update; reinstalling or clearing local
  storage is not a technical fix.
- **Source location:** `../index.html`: `verifyWorker`,
  `maybeReloadIntoWorker`, `RELOAD_MARKER`, and
  `verificationCodes.activeWorkerRevisionMismatch`;
  `../locales/en.json`: `startup.verify.NRV-V12`;
  `../tests/startup-verification.js`.

### NRV-V13

- **Trigger / technical condition:** The service-worker controller reports a
  revision different from the page revision after worker communication
  succeeds.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “Parts of NRV do not match the
  same release, so NRV can’t safely continue.” Popup code label:
  “Error code: NRV-V13”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates repeats update/controller
  verification; Close only closes help.
- **Recovery logic:** The controller serving the current page is checked
  independently from the active worker. A stale or inconsistent controller
  cannot be treated as a verified release.
- **Data risk:** **No expected local-data risk** from retry; the application
  data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. No backup
  control is offered.
- **Reinstall / removal status:** **Reinstall not required.** This is a
  worker/page revision mismatch, not a reason to clear the user database.
- **Source location:** `../index.html`: `verifyWorker`,
  `getWorkerState`, and `verificationCodes.controllerRevisionMismatch`;
  `../locales/en.json`: `startup.verify.NRV-V13`;
  `../tests/startup-verification.js`.

### NRV-V14

- **Trigger / technical condition:** The `APP_VERSION` read from fetched
  `app.js` differs from the semantic version in deployed `version.json`.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV’s version doesn’t match
  the version information it checked, so it can’t confirm this copy is
  ready.” Popup code label: “Error code: NRV-V14”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates fetches release information
  again and repeats version/build verification; Close only closes help.
- **Recovery logic:** Version agreement complements the generated build
  revision check. A mismatch means NRV cannot establish that the displayed
  release and deployed app files belong together.
- **Data risk:** **No expected local-data risk** from retry; app data scripts
  have not been launched.
- **Backup requirement:** No backup is required before retry. The screen
  offers no way to create one.
- **Reinstall / removal status:** **Reinstall not required.** The discrepancy
  is in application release metadata, not the saved-data store.
- **Source location:** `../index.html`: `readBuild`,
  `verificationCodes.appVersionMismatch`, and `showFailure`;
  `../locales/en.json`: `startup.verify.NRV-V14`;
  `../tests/startup-verification.js`.

### NRV-V15

- **Trigger / technical condition:** A verification/startup-gate exception
  does not map to a more specific `VerificationFailure` code. Examples in
  this path include failure to check or record the one-time reload marker.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t finish checking
  this copy, so it can’t safely continue.” Popup code label:
  “Error code: NRV-V15”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates retries the verification
  process; Close only closes help.
- **Recovery logic:** This is the typed catch-all for an unexpected gate
  failure. It prevents an unhandled internal exception from bypassing the
  safety checks. The specific cause should be taken from the developer
  console/log and the code supplied for support.
- **Data risk:** **No expected local-data risk** from the gate as implemented;
  its known examples involve session state and verification. The app data
  scripts have not been launched.
- **Backup requirement:** No backup is required before retry. There is no
  backup control on this screen.
- **Reinstall / removal status:** **Reinstall not required.** This code does
  not identify a data-store problem; preserve the copy and investigate the
  logged cause.
- **Source location:** `../index.html`: `VerificationFailure`,
  `showFailure`, `maybeReloadIntoWorker`, and both startup-gate catch blocks;
  `../locales/en.json`: `startup.verify.NRV-V15`;
  `../tests/startup-verification.js`.

### NRV-V16

- **Trigger / technical condition:** Reading the current service-worker
  registration does not resolve within its one-second limit, or a new
  registration does not resolve before the shared five-second
  update-registration deadline.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t set up its update
  check in time, so it can’t finish checking this copy.” Popup code label:
  “Error code: NRV-V16”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates re-attempts registration and
  verification; Close only closes help.
- **Recovery logic:** A hung registration cannot establish an update
  controller in time. The deadline bounds the wait and gives the user a
  retry instead of leaving startup pending indefinitely.
- **Data risk:** **No expected local-data risk** from retry; the app data
  scripts have not been launched.
- **Backup requirement:** No backup is required before retry. The code screen
  offers no backup action.
- **Reinstall / removal status:** **Reinstall not required.** The timed-out
  registration is not evidence that local information is damaged.
- **Source location:** `../index.html`: `getLocalRegistration`,
  `UPDATE_TIMEOUT_MS`, `updateRegistration`, and
  `verificationCodes.registrationTimeout`;
  `../locales/en.json`: `startup.verify.NRV-V16`;
  `../tests/startup-verification.js`.

### NRV-V17

- **Trigger / technical condition:** `registration.update()` does not resolve
  before the shared five-second update-registration deadline.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV’s update check took too
  long, so it can’t confirm this copy is ready.” Popup code label:
  “Error code: NRV-V17”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates retries the update check and
  build verification; Close only closes help.
- **Recovery logic:** NRV cannot confirm update state if the browser's worker
  update request stalls. The timeout prevents an indefinite wait; a retry
  can succeed when the browser/network responds.
- **Data risk:** **No expected local-data risk** from the check or retry; the
  app data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. No backup
  control is offered.
- **Reinstall / removal status:** **Reinstall not required.** Clearing
  browser data is not a justified response to an update request timeout.
- **Source location:** `../index.html`: `UPDATE_TIMEOUT_MS`,
  `updateRegistration`, and `verificationCodes.updateTimeout`;
  `../locales/en.json`: `startup.verify.NRV-V17`;
  `../tests/startup-verification.js`.

### NRV-V18

- **Trigger / technical condition:** NRV cannot query the active/controller
  worker because a worker or `MessageChannel` is unavailable, or sending the
  revision request fails.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t send its app
  check, so it can’t confirm this copy is ready.” Popup code label:
  “Error code: NRV-V18”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates repeats worker queries and
  build verification; Close only closes help.
- **Recovery logic:** A missing worker-message channel or failed postMessage
  means worker revisions cannot be trusted. NRV blocks until it can check.
- **Data risk:** **No expected local-data risk** from retry; app data scripts
  have not been launched.
- **Backup requirement:** No backup is required before retry. No backup
  control is available.
- **Reinstall / removal status:** **Reinstall not required.** The failure
  concerns worker messaging, not the local data store.
- **Source location:** `../index.html`: `workerRevision`,
  `codeForWorkerResult`, and `verificationCodes.workerQueryUnavailable`;
  `../locales/en.json`: `startup.verify.NRV-V18`;
  `../tests/startup-verification.js`.

### NRV-V19

- **Trigger / technical condition:** A fetched asset response is successful
  but its body cannot be read as text, is not textual, or the body-read
  operation exceeds its three-second limit and there is no usable cached
  fallback.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t read an answer it
  needed for its app check, so it can’t confirm this copy is ready.” Popup
  code label: “Error code: NRV-V19”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates retries asset retrieval and
  verification; Close only closes help.
- **Recovery logic:** The gate must read and inspect build source text to
  validate its revision. An unreadable body cannot establish a trusted build,
  so the page remains blocked.
- **Data risk:** **No expected local-data risk** from this read or retry; app
  data scripts have not been launched.
- **Backup requirement:** No backup is required before retry. Backup/restore
  is not offered on the verification screen.
- **Reinstall / removal status:** **Reinstall not required.** This is a
  response-body/build-source problem; clearing data would add risk without
  addressing its cause.
- **Source location:** `../index.html`: `FETCH_TIMEOUT_MS`, `fetchText`,
  `readResponseText`, and `verificationCodes.responseUnreadable`;
  `../locales/en.json`: `startup.verify.NRV-V19`;
  `../tests/startup-verification.js`.

### NRV-V20

- **Trigger / technical condition:** A required app asset network fetch does
  not resolve before the three-second asset-fetch timeout.
- **Exact current user-facing message:** Screen title: “NRV is keeping your
  information safe”. Message and popup title: “NRV couldn’t get a file it
  needs before its app check timed out, so it can’t safely continue.” Popup
  code label: “Error code: NRV-V20”.
- **Available controls:** Startup screen: code-help button and **Check for
  Updates**. Popup: **Check for Updates** and **Close**.
- **What each control does:** Check for Updates retries source retrieval and
  build verification; Close only closes help.
- **Recovery logic:** The gate bounds a stalled request for required app
  source. If no verified cached source can be used, it blocks instead of
  launching a partial or uncertain build.
- **Data risk:** **No expected local-data risk** from retry; application data
  scripts have not been launched.
- **Backup requirement:** No backup is required before retry. No backup
  control is available on this screen.
- **Reinstall / removal status:** **Reinstall not required.** The timed-out
  asset fetch does not justify removing the app or local data.
- **Source location:** `../index.html`: `FETCH_TIMEOUT_MS`, `fetchText`, and
  `verificationCodes.assetFetchTimeout`; `../locales/en.json`:
  `startup.verify.NRV-V20`; `../tests/startup-verification.js`.

### NRV-S01

- **Trigger / technical condition:** The independent startup watchdog observes
  a script/resource error or unhandled rejection, or its eight-second
  pre-data-start timer expires before `initializeAppData()` calls
  `beginData()`. The optional Leaflet script error is explicitly ignored.
- **Exact current user-facing message:** Screen title: “NRV could not start.”
  Message and popup title: “NRV couldn’t start. It stopped before opening
  your saved information.” Popup code label: “Error code: NRV-S01”.
- **Available controls:** Startup screen: code-help button and **Try Again**.
  Popup: **Try Again** and **Close**.
- **What each control does:** Try Again attempts service-worker registration
  and update when online, then reloads the page. It does not erase, restore,
  or intentionally write saved information. Close only closes help.
- **Recovery logic:** The watchdog is independent of the app scripts and can
  still present a recovery path if those scripts fail before data
  initialization. It distinguishes this from a later, less certain failure.
- **Data risk:** **No expected local-data risk.** The watchdog has not yet
  observed the data-initialization boundary; the current code path reports
  that it stopped before opening saved information.
- **Backup requirement:** No backup is required before this one retry. The
  failed screen cannot create a backup. Do not follow a retry with a
  destructive storage action.
- **Reinstall / removal status:** **Reinstall not required.** The recovery
  action refreshes app code; the message does not indicate deleted or
  corrupted records.
- **Source location:** `../index.html`: `NRVStartupFallback.show`,
  `arm(8000)`, `beginData`, and `recover`; `../locales/en.json`:
  `startup.verify.NRV-S01`; `../tests/startup-handoff.js` and
  `../tests/startup-error-help.js`.

### NRV-S02

- **Trigger / technical condition:** The watchdog observes a startup error or
  its ten-second data-start watchdog expires after `beginData()` has been
  called. This means database opening/data initialization has begun; it does
  not identify whether the failure occurred during a read, migration, unlock,
  or later startup work.
- **Exact current user-facing message:** Screen title: “NRV could not finish
  starting.” Message and popup title: “NRV began opening your saved
  information but couldn’t finish starting.” Popup code label:
  “Error code: NRV-S02”.
- **Available controls:** Startup screen: Backup and recovery help link,
  code-help button, and **Try Again**. Popup: **Try Again** and **Close**.
- **What each control does:** Try Again attempts service-worker registration
  and update when online, then reloads the page. It does not deliberately
  clear or restore data. The help link opens the recovery guide, which explains
  how to locate and restore a suitable backup if retry does not work. The
  screen does not directly export or restore a file. Close only closes help.
- **Recovery logic:** `beginData()` is a boundary marker, not a data-integrity
  result. Startup may have opened IndexedDB and may be reading or migrating
  records. Schema migration writes settings and contacts together in one
  IndexedDB read-write transaction; legacy localStorage cleanup follows the
  commit. A committed migration is version-gated and is not repeated on the
  next load. Retry updates/checks the service worker when online, then reloads
  the document; it does not clear storage or wait for/cancel a pending
  initialization promise. `writeStoredValues()` checks the startup-failure
  state before starting a transaction, so pending initialization that reaches
  a write after S02 appears is blocked. A transaction already started remains
  atomic and can finish before reload.
- **Data risk:** **Retry is non-destructive; new data-write transactions are
  blocked after S02 appears.** There is no evidence that Retry deletes or
  resets the database. The settings/contacts migration is atomic as a pair,
  so the code does not partially commit those two records. Startup tests cover
  a pending initialization read reaching the guard, and Chromium verifies
  that the guard leaves saved settings and contacts unchanged. Do not treat a
  visible S02 screen as proof that every pending operation was cancelled or
  that all data is untouched. See
  [Storage, Backup, and Recovery Architecture](STORAGE_BACKUP_RECOVERY.md#s02-startup-investigation)
  for the transaction and retry analysis.
- **Backup requirement:** If a verified backup is available without changing
  or clearing this copy, preserve it before any further recovery that could
  replace data. The error screen cannot make a backup; its Help link directs
  the user to the recovery guide. Keep the local copy intact before clearing
  storage, reinstalling, or restoring over it.
- **Reinstall / removal status:** **Reinstall should not normally be
  suggested.** No evidence says reinstall will resolve the underlying
  initialization failure, and it may move the user to a separate data store.
- **Source location:** `../index.html`: `NRVStartupFallback.beginData`,
  `arm(10000)`, and `recover`; `../app.js`: `initializeAppData` and
  `startApplication`; `../locales/en.json`: `startup.verify.NRV-S02`;
  `../tests/startup-handoff.js`.

### NRV-A01

- **Trigger / technical condition:** The setup walkthrough's Continue handler
  throws while advancing to step 2 or verifying that step 2 became visible.
  A failure to save the setup progress separately replaces this coded state
  with an uncoded save-progress message and a direct retry button.
- **Exact current user-facing message:** Setup alert: “NRV couldn’t continue
  setup to the next step. This attempt didn’t save your setup progress.”
  The code button reads “Error code: NRV-A01”. The popup title repeats the
  message and its code label reads “Error code: NRV-A01”.
- **Available controls:** The setup screen retains its **Continue** control
  and the error-code button. The popup offers **Try Again** and **Close**.
  The separate inline **Try Again** button is hidden for this code.
- **What each control does:** Popup Try Again closes the dialog and clicks the
  setup Continue button again; Close only closes help. Continue also invokes
  the same setup progression.
- **Recovery logic:** The error is about moving the walkthrough to its next
  screen, not opening or changing contacts. Retrying repeats that UI step.
  If saving walkthrough progress itself fails, the separate uncoded handler
  exposes a retry that only writes the progress marker.
- **Data risk:** **No expected local-data risk** to contacts/settings. The
  affected state is the setup walkthrough marker; this code path reports
  that the attempt did not save its setup progress.
- **Backup requirement:** No backup is required before retry. No backup or
  restore control is involved.
- **Reinstall / removal status:** **Reinstall not required.** A setup-screen
  transition or progress-marker issue is not repaired by removing the app.
- **Source location:** `../app.js`: `continueWizard`,
  `showWizardProgressSaveError`, and `retryWizardProgressSave`;
  `../index.html`: `setup-error-code` and `nrv-error-help-script`;
  `../locales/en.json`: `setup.continueFailure` and
  `setup.continueFailureCode`; `../tests/startup-safety.js` and
  `../tests/startup-error-help.js`.

## Recovery-safety review

### Coded recovery actions

| Code range | Current action | Safety assessment |
|---|---|---|
| `NRV-V01` | Code help, then Close; no retry or continue action | The installed copy can be stuck without a next step. **Recommendation requiring approval:** provide safe environment guidance without implying that removing/reinstalling is necessary, and warn that another browser/installed copy may have separate data. |
| `NRV-V02`–`NRV-V20` | Check for Updates; dialog also has Close | Technically appropriate for verification/update failures. The action rechecks app assets and worker state without an explicit user-data reset. It is not a restore action. |
| `NRV-S01` | Try Again reloads after an optional service-worker update | Appropriate as a non-destructive first attempt before data initialization. |
| `NRV-S02` | Try Again reloads after an optional service-worker update; Backup and recovery help link opens recovery guidance | Retry is non-destructive and new IndexedDB write transactions are blocked after S02 appears. Startup may already have accessed or migrated data; preserve the current copy and use the recovery guidance if retry does not work. |
| `NRV-A01` | Try Again repeats the setup Continue action | Appropriate; it retries walkthrough progression, not data recovery. |

No coded error message recommends uninstalling, reinstalling, clearing data,
or resetting storage. No coded error says those actions are technically
required. No coded screen offers a direct Restore from Backup action.
`NRV-V01` offers no actual recovery action beyond closing help. `NRV-S02`
states that Try Again does not erase information, that the message does not
mean information is lost, and that the recovery guide can help find and restore
a backup if Try Again does not work. Reinstall is reserved for cases where the
recovery guidance recommends it.

### Other uncoded failures relevant to recovery

These are not primary error codes and must not be assigned one without an
implementation change.

| Condition / exact current English text | Visible controls and actual behavior | Data/recovery implications |
|---|---|---|
| **Storage startup failure message exists in localization but is not wired into the runtime:** “NRV could not open and verify its storage. Private Safari use is unsupported: close the Private tab and reopen NRV in normal Safari, then install and open NRV from its Home Screen icon. Nothing has been deleted.” | No active caller of `storage.startupFailed` was found in the App source. The current generic startup watchdog instead uses `NRV-S01` or `NRV-S02`. | If wired later, changing to a normal tab/Home Screen copy can access a separate data store. “Nothing has been deleted” is not proof the same data will be visible there. **Recommendation requiring approval:** verify diagnosis and protect/transfer existing data before prescribing a copy/environment change. |
| **Unsupported update browser:** “This browser can’t check for NRV updates. Before using NRV in another browser, make a backup of your saved information.” | Settings → App Updates shows **Open Backup/Restore**; the user must make the backup and perform any move. | Appropriate warning; use the backup before switching. App/browser storage can be distinct. This is not a coded error dialog. |
| **Unreadable encrypted local structure:** “NRV couldn’t read this saved information in a usable form. It stopped before changing it. Choose Restore from Backup. If you don’t have a suitable backup, keep this copy and contact NRV for help.” | On the unlock screen, **Restore from Backup** opens a file picker; restore validates/decrypts, asks for the backup secret if encrypted, and confirms replacement before writing. The passphrase form remains available. | Restore is appropriate only with a suitable backup. A full restore replaces this copy's contacts/settings; preserve the original and do not erase it if no valid backup exists. Current data is retained until a restore commits. |
| **Future/unsupported data schema:** “This information uses a format this copy of NRV can’t open safely. NRV stopped before changing your saved information.” The Dropbox variant says “The Dropbox copy uses a format this copy of NRV can’t open safely. NRV stopped before changing your saved information.” | The recovery screen offers **Check for Updates**; no error code or Restore button is shown. It verifies/reloads app code. A completed update does not repeat the original restore/import/Dropbox action. | Keep the source backup/copy unchanged; update first, then deliberately retry the original operation. Do not erase the only copy. |
| **Local file or Dropbox restore failure:** Local: “NRV couldn’t complete the restore. Your saved information was not changed. Check that the backup file is valid and the passphrase is correct.” Dropbox: “NRV couldn’t complete the Dropbox restore. Your saved information was not changed. Check that the Dropbox copy is valid and the passphrase is correct.” | Acknowledgement dialog has **OK**. The user can correct the secret/source and select the intended backup again. | Before commit, an unsuccessful restore leaves current data unchanged. A successful restore replaces contacts/settings; use the confirmation and preserve the original backup. If the separate committed-data notice appears, do not repeat the restore. |
| **Import failure:** “NRV couldn’t complete the import. Your saved information was not changed. {detail}” | **OK** dismisses the alert. Import errors occur before the atomic write; retry only after checking the file/passphrase. | No full restore occurs; importing valid contact files adds rather than replaces contacts. |
| **Committed data, failed screen refresh:** “NRV saved the information, but couldn’t finish updating the screen. Choose OK to open Contacts, or Cancel to stay here.” If that display also fails: “NRV saved the information, but still couldn’t display it. Keep this copy and contact NRV for help.” | The first confirmation's **OK** rebuilds the contact view; **Cancel** stays. The second message is an **OK** alert. | The write already committed. Do not repeat restore/import/sync solely because the view failed. Keep the copy and seek help if Contacts cannot be displayed. |
| **Generic storage action failure:** “Could not {action}. Your changes may not have been saved. Please try again.” | Alert with **OK**. The named action is logged to the console; OK dismisses only. | Actual save outcome can vary by failed operation. Check whether the change is present before repeating; especially, a failed backup export does not produce a verified recovery copy. |
| **Setup progress save failure:** “NRV couldn’t save this setup step. Your saved information was not changed.” | A modal confirmation offers **Try Again** and **Cancel**; the inline setup version exposes a **Try Again** button. It retries only saving the setup progress marker. | No expected contact/settings change. This is uncoded and is distinct from `NRV-A01`. |
| **Dropbox automatic sync failure:** “The last automatic Dropbox sync did not finish. Your changes are saved on this device and it will try again.” | Status notice; retry is automatic and can be initiated from cloud controls. It does not itself overwrite local data. | Current edits remain local; verify sync status before relying on another device. A separate restore/replace decision can replace destination data and needs its own confirmation. |
| **Erase All Data / Start Fresh (deliberate destructive operation, not routine recovery):** Confirmation warns that contacts, visits, settings, and security/setup information for this working copy will be removed; a Dropbox-specific warning says existing Dropbox backups are not deleted. The final confirmation is “Last check: erase this NRV working copy and start fresh?” | The user must confirm twice. The code closes/deletes/recreates the local IndexedDB database and clears local/session storage, then verifies empty state and redirects. A failed verification can leave a partially cleared copy; the retry prompt offers **OK** (retry) or **Cancel** (return to Settings). | **Significant local-data risk by design.** Use only when the user explicitly intends a fresh start after creating/verifying an independent backup. It is not a fix for any code above. Dropbox and independently downloaded backup files are not erased by this operation. |

The App's controlled reset is safer and more explicit than telling users to
clear browser/site data, but it is still destructive and must not be suggested
as a coded-error remedy. A failed erase can leave partial state, so it must not
be described as a successful clean slate.

## Backup and restore behavior

### Supported backup methods and destinations

1. **Local full-backup file:** Settings → Data/Security → Backup/Restore →
   Local Backup/Restore → **Back up everything** builds a full JSON backup and
   asks the browser to download it. If a passphrase is enabled, backup data is
   encrypted; otherwise, the local backup is unencrypted. The app cannot
   verify whether or where the browser saved the download. It asks the user
   to confirm; only that confirmation resets the reminder, and it is not
   filesystem verification. The install-preservation flow also downloads a
   full transfer-purpose JSON backup and follows the same confirmation rule.
2. **Optional Dropbox backup/sync:** The user connects their Dropbox. NRV
   uploads `/latest.json` and keeps up to three automatic recovery copies. A
   user-requested Dropbox backup also creates a separately named saved backup
   that is not pruned by automatic cleanup. Automatic uploads follow saved
   changes, app opens/checks, and restored connectivity, subject to the
   sync/pause rules. Dropbox is not enabled by default and is not a local
   backup. Keep an independent recovery copy outside NRV's active Dropbox
   folder for additional protection. Capacity-aware reductions are not yet
   implemented.
3. **Contact export:** Contact exports are not full backups: they do not
   include the app's settings, security state, defaults, or location lists.
   They are not a substitute for the full-backup paths above.

Full backups can be restored from a selected local JSON file during setup,
from the unlock screen, or in Settings. Dropbox backups can be restored from
the Dropbox restore controls. A restore validates the backup, requests its
passphrase/recovery code when encrypted, displays a replacement confirmation,
and writes the selected full backup to the current copy. Restoring replaces
that destination's contacts and settings; it does not merge two full backups.
The original browser copy is not erased by restoring into another copy.

### Backup reminder: current implementation

- The reminder threshold is **10 days** since `LAST_BACKUP_KEY`.
- It checks during normal App startup after the user data is available, and
  only if the current copy has contacts. It cannot run on the blocked coded
  startup screen.
- It asks at most once per local calendar day. **Not Now** dismisses the
  popup, does not update `LAST_BACKUP_KEY`, and suppresses another reminder
  for that day.
- **Back Up Now** requests a local backup file even when Dropbox is connected.
  Opening the Backup/Restore area alone does not count as a backup.
- A local download click does not update `LAST_BACKUP_KEY`. The confirmation
  shows the requested filename and time, explains that NRV cannot verify
  whether or where the browser saved the file, and asks whether the user saved
  it. Only a positive user confirmation records success; this remains
  user-reported, not filesystem verification.
- Installation preservation updates the reminder only when the user confirms
  the saved file and continues. Restore paths do not update the reminder.
- Dropbox upload success can update the reminder. If a user-requested saved
  file uploads but NRV cannot update `/latest.json`, the status explicitly
  reports the separate file as the only confirmed result and leaves the
  existing latest copy unchanged.
- When Dropbox is connected and its latest successful upload is at least one
  day old, NRV first attempts the configured automatic upload during startup.
  A successful upload may satisfy the reminder before it appears.

## Remaining follow-up decisions

1. Decide the approved safe recovery guidance for `NRV-V01`, which currently
   provides no next action beyond closing its help dialog.

## Documentation items for a later user-docs stage

The in-app [`../help.html`](../help.html) error-code paragraph still describes
retry wait times, browser guidance for `NRV-V01`, and reopening for `NRV-A01`.
Those details are not present in the current dialog: `NRV-V01` offers no
recovery action, `NRV-A01` retries setup, and the dialog gives no wait-time or
ask-for-help threshold. Review that error-code paragraph in a dedicated
user-documentation change; it is separate from the backup and recovery
guidance updated here.

## Maintenance requirements

Whenever a code is added, removed, or remapped, or an error message, control,
trigger, recovery action, backup/restore behavior, or data-risk assessment
changes, update this document in the same change. Update the matching
English/Spanish localization, offline fallback, and focused tests as
applicable. Keep the code-to-condition mapping and exact English message
aligned with `index.html`, `app.js`, and `locales/en.json`; do not infer codes
from ordinary validation text or test-only unknown-code fixtures.

## Source map and audit coverage

| Implementation/reference | Relevance |
|---|---|
| [`../index.html`](../index.html) | Inline watchdog, startup recovery screen, embedded offline bilingual error meanings, code-help dialog, verification code map, triggers, and recovery-button routing |
| [`../app.js`](../app.js) | App data initialization, setup error, backup/restore, Dropbox, storage errors, and deliberate erase flow |
| [`../locales/en.json`](../locales/en.json) | Exact English messages, button labels, backup reminder, and uncoded recovery text |
| [`../locales/es.json`](../locales/es.json) | Spanish equivalents for the current behavior and user-facing messages |
| [`../service-worker.js`](../service-worker.js) | Asset caching and worker revision support used by the verification gate |
| [`../nrv-dialog.js`](../nrv-dialog.js) | Shared alert/confirmation buttons and their default labels |
| [`../tests/startup-verification.js`](../tests/startup-verification.js), [`../tests/startup-error-help.js`](../tests/startup-error-help.js), [`../tests/startup-handoff.js`](../tests/startup-handoff.js), [`../tests/startup-safety.js`](../tests/startup-safety.js), [`../tests/service-worker-chromium.js`](../tests/service-worker-chromium.js) | Verification-code triggers, visible help, fallback handoff, S02 write guard, encrypted migration, and setup failure behavior |
| [`../tests/data-integrity-recovery.js`](../tests/data-integrity-recovery.js), [`../tests/backup-recovery.js`](../tests/backup-recovery.js), [`../tests/install-preservation.js`](../tests/install-preservation.js), [`../tests/erase-data.js`](../tests/erase-data.js) | Backup confirmation, restore/data-integrity, install preservation, and destructive erase safety |
| [`../help.html`](../help.html), [`../help-es.html`](../help-es.html) | Current English and Spanish backup, restore, device-change, error-code, and troubleshooting guidance |
