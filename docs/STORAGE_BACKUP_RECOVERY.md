# NRV Storage, Backup, and Recovery Architecture

## Purpose and scope

This is a developer-facing description of the current App implementation and
recovery behavior. User-facing English and Spanish copy is maintained in the
App UI, localization catalogs, and Help guides.

## Working data and storage boundaries

- The working copy of NRV data is held in the browser-managed IndexedDB
  database `return-visits-app`, in the `appData` object store. The primary
  records are settings, contacts, and optional encryption metadata.
- Older copies may have settings and contacts in `localStorage` under
  `return_visits_settings` and `return_visits_contacts`. When the schema is
  older, NRV normalizes and writes both records to IndexedDB in one
  read-write transaction, then removes those legacy keys. Other local and
  session storage values hold preferences, setup/sync state, and transient
  flow state; they are not a full data backup.
- The service worker's Cache API holds application files for offline use. It
  is separate from the IndexedDB records and is not a recovery copy of
  contacts or settings.
- With app passphrase protection enabled, the stored settings and contacts
  are encrypted, as are full backups created from that copy. Without
  passphrase protection, local and Dropbox backup data is unencrypted and
  readable by anyone who obtains it.
- NRV requests persistent browser storage through `navigator.storage.persist()`
  when available and displays the result. This is a browser retention request,
  not a backup, export, filesystem location, or cross-device copy. A denied or
  unsupported request is reported; even a granted request does not protect
  against deliberate clearing, device loss, or every platform-level event.

The browser manages the physical representation of IndexedDB and localStorage.
NRV does not create a user-browsable working-data file, know the browser's
database file path, or receive the destination path for a downloaded backup.
The internal database is the live working copy, not an independently
recoverable file.

## Browser, installed-app, and device boundaries

Browser-managed storage is associated with an origin and a browser storage
context. Different origins, browser profiles, devices, and some installed-app
contexts can therefore hold distinct copies. NRV can inspect the data in the
current context and detect whether it is running standalone; it cannot inspect
another browser/profile/device, determine whether an OS migration copied its
storage, or verify that the current copy is the user's newest copy.

On iOS/iPadOS 17.2 and later, WebKit documents that adding a Home Screen web
app does not copy localStorage or other website data from the browser; the web
app has its own website data. NRV's install-preservation flow exists to move
data between such copies. The App README says the user guide was tested on
iPhone Safari and that Android behavior has not been tested. The install
guide's other browser/platform choices are not evidence of tested
storage-transfer or uninstall behavior.

The App contains no removal/uninstall migration hook and does not guarantee
that a browser or operating system will retain or transfer website storage
after an icon is removed, an app is reinstalled, a profile changes, or a
device is replaced. Do not recommend removal or reinstall as a recovery step.
Use an independent backup before changing the storage context.

The legacy GitHub Pages app and the nicereturnvisits.org App are on different
origins and do not share browser storage. A matching product name or installed
icon does not make their data the same copy.

## Available recovery copies

### Current working copy

The live IndexedDB records in the current browser context are the working copy.
NRV can read them when that context and app code remain usable, but they are
not a separate backup.

### Local full backup

On request, NRV serializes contacts and settings to a JSON Blob and asks the
browser to download it as `return-visits-backup-YYYY-MM-DD.json`. The JSON
contains an `exportedAt` timestamp. An installation-preservation backup uses
the same requested filename and adds `transferPurpose: "installation"`.

NRV knows the data was serialized and a download was requested. It then asks
the user to confirm that the file was saved; only that confirmation updates
the backup reminder. The confirmation is user-reported, not filesystem
verification. NRV cannot confirm the file's final location or whether it
remains available. The date-only requested name can repeat; the browser may
rename duplicates. Installation preservation follows the same rule and
updates the reminder only when the user confirms the file and continues.

### Optional Dropbox copy

Only after the user connects Dropbox, the app-folder-scoped integration writes
`/latest.json` and up to three dated `/automatic-recovery-<timestamp>-<revision>.json`
recovery copies in the user's `Return Visits` app folder. A user-requested
Dropbox backup also creates a separately named
`/saved-backup-<timestamp>.json` file. Automatic cleanup is limited to the
automatic recovery copies; manually saved and legacy `backup-*.json` files are
not pruned. Dropbox does not expose available app-folder capacity through the
current integration, so NRV does not estimate free space or automatically
change the three-copy target based on an unknown quota.

Rotation uploads a new recovery point before pruning older points, so one
temporary fourth automatic recovery copy can exist while cleanup is attempted.
If cleanup fails, NRV records a retention warning and preserves the copies.
When four or more automatic recovery copies already exist and no copy for the
current `latest.json` needs preserving, NRV blocks another recovery upload and
leaves `latest.json` unchanged. If Dropbox explicitly reports insufficient
space while exactly three recovery points exist, NRV removes only the oldest
automatic recovery point and retries once. If the retry still fails, two
recovery points remain and `latest.json` is not overwritten. Other or
ambiguous upload errors do not trigger deletion. NRV creates at most one
temporary extra point during rotation and does not grow a set already at or
above four; it does not claim to remove excess copies that predate this policy
or cannot be cleaned up.

The app requires Dropbox's upload response to include a path and server
modified time before treating the latest upload as confirmed. It records a
local completion time and reports the confirmed outcome with a non-modal
progress/completion status. If a separate saved backup uploads but NRV cannot
update `/latest.json`, the status says that only the separate file was uploaded
and leaves the existing latest copy unchanged. An automatic recovery copy is
saved before replacing the latest file when a recovery point is due; if
preserving that copy fails, NRV does not update the latest file. With capacity
unknown, a failed upload is not treated as proof that an older recovery point
can safely be discarded; NRV leaves the current latest copy untouched.

### Dropbox OAuth and public-release gate

The browser integration uses Dropbox's authorization-code flow with PKCE. It
generates a browser-cryptographic verifier and state value, sends the S256 code
challenge and origin-derived `/app/` redirect URI to Dropbox, validates the
returned state, and exchanges the code with the verifier without an app
secret. The public Dropbox app key is the only application identifier needed
by this browser client. Access and refresh tokens are kept in this browser's
local storage for the connected user's Dropbox account; they are not included
in NRV data backups, printed output, or NRV-controlled server storage. NRV
attempts to revoke the refresh token when disconnecting and removes the local
token record.

Before NRV’s Dropbox integration is made generally available, verify the
Dropbox application configuration, obtain the provider status or approval
required for the intended public audience, and verify that ordinary users can
authorize their own Dropbox accounts through the normal OAuth flow without GF
distributing application credentials, secrets, access tokens, or test-user
enrollment. Development status remains acceptable for the current limited
testing period.

### Contact reminders and printed emergency record

Contact reminders are separate records from `notesHistory`. Each has its own
ID, text, creation/update timestamps, optional due time, and optional
completion time. Completed reminders remain in the contact data so a Dropbox
merge does not resurrect them; the UI and emergency print include only current
reminders. Reminder records merge by ID, with the most recently updated
version winning and completion winning ties. They are stored and backed up
with the contact record, not sent to a reminder service. The Contacts overview
updates while NRV is open; it does not provide background or push
notifications.

**Print My NRV Information** is a human-readable reference, not a restorable
backup. It groups contacts by country, city, region, and area; sorts contacts
by last and first name; and includes saved addresses, phone numbers, email
addresses, the two newest non-empty notes/history entries, and current
reminders. It excludes contact IDs, coordinates, settings, account details,
and security/recovery secrets. Printing only reads the existing note history;
it does not reclassify or rewrite it.

If a user has never requested a local export or installation-preservation
download, NRV has not created a separate local recovery file. A Dropbox copy
may nevertheless exist if the user previously connected Dropbox and an
automatic or manual upload completed. Browser/OS-level backups are outside
NRV's visibility and are not an NRV recovery guarantee.

## Recommended recovery hierarchy

1. **Protect the original copy.** Do not clear site data, erase NRV, remove an
   installed copy, reinstall, or restore over the only current data while
   investigating a failure.
2. **Create and verify an independent local copy when NRV can still open.**
   Use the full JSON backup, choose encryption deliberately, confirm that the
   browser actually downloaded it, and keep it somewhere separate from the
   working browser storage. Keep the passphrase separate from an encrypted
   backup.
3. **Use opted-in Dropbox for cross-device recovery/sync.** Confirm the
   correct Dropbox account and any paused restore/replace decision before
   proceeding. Keep a separate copy outside NRV's managed Dropbox app folder
   when protection from app-managed replacement or retention is needed.
4. **Restore only after choosing the correct backup and destination.** Restore
   replaces the destination's contacts and settings after confirmation. Keep
   the original copy intact until the restored data has been checked.
5. **Treat erase/reset or storage-context changes as last resorts.** They are
   not substitutes for finding or preserving the original working copy.

## S02 startup investigation

`NRVStartupFallback.beginData()` is a boundary marker. The S02 screen can be
shown by the ten-second watchdog after data startup begins or by a runtime
error/unhandled rejection after that boundary; it does not identify which
startup phase was active.

- `beginData()` itself does not change contact data. The first
  `openAppDatabase()` can create the IndexedDB database and `appData` store if
  they do not exist; it does not populate existing contacts.
- Initial startup reads the stored keys, settings, contacts, and encryption
  metadata. For unencrypted legacy/schema migration, NRV normalizes records
  and writes settings and contacts together through `writeStoredValues()` in
  one IndexedDB read-write transaction. Legacy localStorage keys are removed
  only after that transaction completes.
- For encrypted data, submitting the unlock form calls `beginData()` again.
  After key derivation, reads, and decryption, an older schema is normalized
  and the encrypted settings and contacts are written together in one
  transaction. Legacy localStorage cleanup follows the transaction.
- A startup restore is a separate, user-initiated path. It writes the
  restored settings, contacts, and encryption metadata in one transaction
  after the restore flow's confirmation. A Retry click does not itself select
  a file or invoke restore.
- The transaction boundary means the settings/contacts pair is committed
  together or rolled back together. If a transaction commits, its normalized
  schema version is current, so the version-gated migration is not repeated
  on the next load. If it aborts, the prior IndexedDB pair remains available
  for a later attempt. Legacy localStorage cleanup is outside that
  transaction, so an interruption can leave stale legacy values; the
  initializer prefers the committed IndexedDB values.
- Retry attempts service-worker registration/update when online, then reloads
  the document. It does not clear or reset storage and does not wait for or
  cancel the pending initialization promise before starting the reload.
- `writeStoredValues()` checks the startup-failure state before creating a
  read-write transaction. Pending initialization that reaches a write after
  S02 has appeared is blocked before the transaction begins. A transaction
  already started before the failure remains atomic: its settings/contacts
  writes either commit together or abort together.

**Assessment:** **Retry is non-destructive; the runtime guard prevents new
data-write transactions after S02 appears.** The settings/contacts migration
is transactionally bounded and version-gated. Startup tests cover a pending
initialization read reaching the guard, and the Chromium integration test
confirms a failed guard leaves the stored settings and contacts unchanged.
An already-started transaction may still complete atomically before reload;
do not claim that every pending startup operation is cancelled or that all
data is known to be untouched. Preserve the current copy and avoid
destructive recovery. See the
[S02 error entry](ERROR_CODES.md#nrv-s02) for the user-facing recovery
controls and current risk statement.

## Backup reminder: current behavior and recommendations

### Current implementation

- The reminder threshold is 10 days since the stored backup timestamp, and it
-  is offered at most once per local calendar day. Not Now dismisses it
  immediately; it leaves the successful-backup timestamp unchanged, though
  the daily prompt marker suppresses another reminder that day.
- Back Up Now requests a local backup file even when Dropbox is connected.
  Opening the Backup/Restore area alone does not count as a backup.
- A local download click alone does not reset the reminder. NRV reports the
  requested filename and time, explains that it cannot verify whether or
  where the browser saved the file, and asks the user to confirm. Only the
  user's confirmation resets the reminder; this is user-reported, not
  filesystem verification.
- Installation preservation uses the same user-confirmation rule. Restore
  activity never resets the reminder.
- Dropbox automatic upload success can reset the reminder. A user-requested
  Dropbox backup creates a separate saved file and updates the latest copy;
  if only the separate file succeeds, the UI reports that partial outcome
  without claiming that the latest copy was updated.
- When Dropbox is connected and its latest successful upload is at least a
  day old, NRV first attempts the configured automatic upload during startup.
  A successful upload can satisfy the reminder before it appears.

## Source references

- App data and transactions: [`app.js`](../app.js) (`openAppDatabase`,
  `writeStoredValues`, `initializeAppData`, `markBackupDone`,
  `downloadEncryptedBackup`, Dropbox backup and reminder flow).
- Startup watchdog and Retry: [`index.html`](../index.html),
  [`service-worker.js`](../service-worker.js).
- Dropbox API wrapper: [`dropbox.js`](../dropbox.js).
- Relevant behavior tests: [`startup-handoff.js`](../tests/startup-handoff.js),
  [`startup-safety.js`](../tests/startup-safety.js),
  [`data-integrity-recovery.js`](../tests/data-integrity-recovery.js),
  [`backup-recovery.js`](../tests/backup-recovery.js),
  [`dropbox-errors.js`](../tests/dropbox-errors.js),
  [`reminders-print.js`](../tests/reminders-print.js),
  [`install-preservation.js`](../tests/install-preservation.js),
  [`nrv-dialog.js`](../tests/nrv-dialog.js), and
  [`service-worker-chromium.js`](../tests/service-worker-chromium.js).
- Platform references: [MDN Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API),
  [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/),
  [WebKit Safari 17.2 web-app storage behavior](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/),
  and the [IndexedDB specification](https://w3c.github.io/IndexedDB/).
