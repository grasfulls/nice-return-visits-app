# Nice Return Visits

Nice Return Visits is free to use, with no app fees or subscription. It is
intentionally a simple tool for maintaining contact details and tracking
return visits—not a full-featured contact-management app. It may have fewer
features or be less reliable than paid products. The app is provided as-is.
Your internet or mobile provider may charge for data, and third-party services
have their own terms.

It is a client-side contact and return-visit tracker that can be used in a
browser or installed as a Progressive Web App (PWA).

## Before you start

For regular use, we recommend adding the app to your Home Screen; it opens
like an app while keeping contacts locally on that device. The browser and Home
Screen versions may store separate data and do not sync with each other. Adding
the app icon does not transfer contacts already stored in the browser. If you
have already entered contacts in a browser, either keep using that browser or
export a backup (encrypted or unencrypted, your choice) and restore it in the
Home Screen app before switching. The app has no sync service of its own; syncing between devices happens
only if you connect your own Dropbox on each device (see Cloud backup below).
Without Dropbox, keeping multiple copies current requires manual backup/restore.

On iPhone, open the site in Safari, tap **Share → Add to Home Screen**, then
launch the Home Screen copy. If a link opens inside another app, use that app's
menu to choose **Open in Safari**; the website cannot choose the browser for
you. On Android, open the site in Chrome and choose **Install app** or
**Add to Home screen** from the browser menu. Do this before entering contacts
when possible, since browser and Home Screen copies may keep separate data.

## Data and passphrase

Contacts and settings are stored on the current browser and device in IndexedDB
and, when a passphrase is turned on, encrypted with AES-GCM. A passphrase is
optional: by default the app opens without one and stores data unencrypted. To
turn it on, use **Settings → Choices → Passphrase to Open App → Turn On Passphrase**, enter and confirm a passphrase of at
least 12 characters; it is then required whenever opening the app. The app shows a
recovery code once; typing that code in place of the passphrase unlocks the app (and
also unlocks backups, because a locked copy of the passphrase is stored inside the backup
file). If both the passphrase and the code are lost, the encrypted data cannot be unlocked.
Anyone with the code can open the data, so keep it private. **Settings → Choices → Passphrase to Open App →
Make a New Recovery Code** replaces it (needed once for passphrases created before this feature).
Keep the passphrase safe and separate from any backup or contact file. Once on,
use **Settings → Choices → Passphrase to Open App → Change Passphrase** and verify the current passphrase first. To stop requiring
one, use **Settings → Choices → Passphrase to Open App → Turn Off Passphrase**; the app explains the consequences
(unencrypted storage, recovery code stops working, later backups unencrypted) and offers
**Continue** or **Cancel**. Continuing asks for the current passphrase once to decrypt the data;
it can be turned on again later.
The change does not affect other copies or previously exported backup files;
those backups continue to require the passphrase they were created with.

Developers can require a passphrase on first use by setting
`REQUIRE_PASSPHRASE_ON_FIRST_USE` to `true` in `app.js`.

Existing legacy browser data is migrated without a passphrase, or encrypted and
verified during migration if a passphrase is required, before plaintext copies
are removed. Data is not synchronized between browsers or
devices unless you opt in to Dropbox sync, and the app has no user account or server-side contact database.
Clearing browser data or losing a device can remove its local records, so keep
an encrypted backup.

## Contacts and visit logs

Tap the **ADD VISIT** button on a contact card. The contact opens on its **Visits**
section with the cursor in the new-visit note box; the details are under **Contact Info**.
If you leave without a note or date change, no visit is added. The pencil opens
**Contact Info** instead, and the visit history stays hidden until you tap **Visits**.
The card shows the newest visit and its note; earlier visits stay in the contact's visit log.

Add contacts with a required first name and optional last name, address, city,
region, area, map coordinates, email, and phone. Email and phone are optional;
email accepts addresses such as `name@someemail`, and U.S. phone numbers are
formatted as `(555) 123-4567`. City, Region, and Area are each single optional
values, so a contact can be saved with partial details and completed later. A
street address and newly entered location names are automatically capitalized
when you leave the field or save. Recognized U.S. state names are saved as
their standard two-letter abbreviations; two-letter state codes are uppercased.
Region belongs to one City, and an Area belongs to one Region. The contact
form's Area list always offers **+ Add New Area...**, even when other areas are
available for the selected City and Region. Each contact has a stable unique
ID, so different people can share the same name. The Region list also offers
**+ Add New Region...** for the selected City. Every new City is automatically
given the Regions North, South, East, and West. A Region is a large part of a
city and an Area is a neighborhood within it. In Settings, edit a City,
Region, or Area to rename it and update existing assignments. Deletion is
blocked while any contact is assigned to that entry or its child locations;
reassign those contacts first. Deleting a City or Region with no assigned
contacts also deletes its Regions and Areas, after confirmation. Contact cards show available
phone and email details along with the address, location
hierarchy, urgency, last visit date, and note count; they include actions to
edit, delete, and navigate to a contact. Share, Export, and Print are icons at the
bottom of the Edit Contact screen and work on the saved contact (save any
changes first). Notes themselves are viewed,
added, edited, and deleted (including their date and time) in the contact
editor, not on the card. Navigate opens Google Maps directions using
saved coordinates when available, or the contact address otherwise. Share
prepares a plain-text contact summary in
Text/SMS, WhatsApp, or Email. The summary includes available contact details
and a directions link. Visit notes are left out unless you choose to include
the most recent note or all notes in the Share dialog. This message is not
encrypted by the app; use the contact export action for app-to-app transfer.

Every print button is the printer icon in the bottom bar and prints what is on
that page. On the contacts page it prints exactly the contacts
shown by the current search and filters (the icon shows the count). It confirms first, groups
each contact once under their most specific location (Area, then Region, then
City, then unassigned), and includes only the latest visit note. On the **Map**
page it asks for numbered pins only or pins with contact details; pin numbers
match the printed list, and contacts without a pin are listed separately. On
**Settings** it prints the defaults, passphrase on/off, and locations. In **Edit
Contact**, the printer offers **Most recent note only** (the default) or **All
notes**. Save any pending contact edits before printing; the printer is
disabled while changes are unsaved. Print layouts omit app controls. Printing
uses the browser/device print dialog, where you can choose a printer or save as
PDF if that option is available.

Search matches names, email addresses, phone numbers, addresses, and visit
notes. The list can be filtered by urgency, city, region, and area, and sorted
newest first, oldest first, or alphabetically by first name. In the contact
form, Region is available only after choosing a City, and Area is available
only after choosing a Region.
Settings lets you create regions under cities and areas under regions. Filters
follow the same hierarchy. During migration from the earlier multiple-area
format, a contact keeps its first listed area and drops other area assignments;
the contact's unique ID, visit history, and other details are preserved.
Legacy area-list strings are placed under an **Unassigned** region for review
and later editing.
Urgency is based on the most recent visit log, or the contact creation date if
there are no logs:

- **Normal:** 0–7 days
- **Urgent:** 8–14 days
- **Immediate:** 15 or more days

## Location and privacy

Map coordinates are optional. In the contact form, choose **Find Address or
City Pin** to look up the entered address, city, and state, or **Use Device
Location** to request the device's current location. A partial street name can
return several possible matches; choose from the street-name choices, which
omit house numbers and ZIP codes, to fill in the street and place the pin.
Common street suffixes are displayed in abbreviated form, including for
contacts saved before this formatting was added (for example, Avenue as Av,
Road as Rd, Court as Ct, and Lane as Ln). If the full address is not found,
the app also searches by the street name without the leading house number. A
city-only lookup places an approximate pin near the city. Typing or saving
address details does not automatically create a pin. Once a pin is set,
choose **Confirm pin is correct** to hide the lookup buttons, coordinates, and
map; they return with **Adjust pin** or when the address, city, or state
changes.
Device location requires browser permission and
its accuracy can vary. Refine a pin in the contact form by tapping the map,
dragging the pin, or editing the coordinates. Pins can also be dragged in Map
view; those changes save automatically. The map shows pins only for contacts
matching the current search and filters, and indicates when matching contacts
have no saved coordinates. Whenever the Map is open with no visible contact
pins, it centers approximately on the Default City and State from Settings.

Settings -> Defaults & Your Details stores your name, address and a home pin.
The home pin appears on the Map as a house icon (draggable), the Map opens
fitted to include it, and the details are included in backups and the Settings
printout. If you enter your name, it is added as "Shared by [your name]" to a
message when you choose Share on a contact. The app prepares the message; you
decide whether and to whom to send it. Your address and home pin are not
included in that message. The address lookup is sent to OpenStreetMap Nominatim
only when you choose it.

Address text (including partial street-name and city searches) and cross-street
text are sent to OpenStreetMap Nominatim when you choose the corresponding
search button. Whenever the Map is open with no visible contact pins, the saved
default City and State are also sent to Nominatim to center the map. Leaflet
map assets, map tiles, and location searches require internet access. The app
shell may work offline after it has been cached, but the map and address
search are not available offline.
Choosing Navigate sends that contact's saved coordinates or address to Google
Maps to open directions.

## Full backup and restore

Use **Settings → Choices → Backup or Restore → Local Backup/Restore → Back up
everything** to download a JSON backup of all contacts and settings. Encryption
is your choice: with a passphrase on, a tick box (on by default) lets you
encrypt the file or export it unencrypted; with no passphrase the file is
unencrypted. Anyone who obtains an unencrypted file can read it, so store and
send it only where you trust the recipient. The browser saves it to its usual
download location—for example, **Files → Downloads** on iPhone or the browser’s
**Downloads** location on other devices. The app cannot choose a save folder.
At app start it asks the browser to protect its storage from automatic clearing
(persistent storage); the result is shown at the top of **Settings → Choices → Backup or Restore → Local Backup/Restore**.
This lowers but does not remove the risk of data loss, so keep backups.

To restore, select the backup and, if it is encrypted, enter the passphrase used
for it. Restore
replaces the current local contacts and settings only after confirmation. On a
new device, you can choose **Choose Backup to Restore** on the initial unlock
screen; the restored backup’s passphrase becomes the passphrase for that
device. Older unencrypted full-app backups are supported; restoring one onto a device
with a passphrase keeps that device's own passphrase and recovery code.

All devices that share your data use one passphrase and one recovery code. Restoring an
encrypted backup onto a device with no passphrase turns the passphrase on there (after a
confirmation message) with the backup's passphrase and recovery code; restoring onto a
device with a different passphrase switches it to the backup's. After you change the
passphrase on one device, the others keep the old one until they restore a newer backup.

Full backups cannot be merged directly. To combine several browser or app
copies, choose one as the base and import individual contacts from the other
copies using the import icon on the contacts page. Check for missing or duplicate
contacts, create a fresh backup of the combined destination, then clear unused
source data. See the [User Guide](./help.html) for a step-by-step consolidation
and data-removal checklist.

The app reminds you about a backup after 10 days without one (a file or Dropbox
backup), showing the number of days and asking at most once a day. Only a
successful backup resets the count.

## Cloud backup (optional)

**Settings → Choices → Backup or Restore → Cloud Backup/Restore (Dropbox)** can keep a copy of your contacts and
settings in your own Dropbox. It is off unless you turn it on, and file backups
keep working. Dropbox is entirely optional: the app works fully without it, and all
your data can stay only on this device. You need a Dropbox account (the free Basic plan is enough); the app
can send you to dropbox.com/basic to sign up but cannot create the account. The
setup asks whether you already have an account, shows the sign-up steps if not,
then connects through Dropbox's own sign-in page. The app can only use its own
Dropbox folder named **Return Visits**.

The app backs up on open when the last Dropbox backup is more than a day old, and
about 15 seconds after changes (or when you leave the app); a web app cannot back
up while closed. Dropbox keeps a latest copy plus up to 10 dated copies. Before
connecting, the app explains whether backups will be encrypted and lets you
continue or cancel. A passphrase is optional: backups made without one are not
encrypted, while backups made with one are encrypted before upload. Existing
Dropbox copies made without a passphrase remain unencrypted until you delete
them. It never backs up an empty device over your Dropbox copy. Use
**Restore from Dropbox** to restore the latest or a dated copy (it replaces
this device's data), and **Disconnect Dropbox** to stop.

With more than one device, each device combines its changes with Dropbox
automatically: when the app opens, every couple of minutes while it is open, and as
soon as the connection returns after being offline. Visits and contacts added on
different devices are all kept; for the very same contact changed on two devices, the
most recent change is used but visits from both are kept. With no signal, changes stay
saved on the device and upload when Dropbox is reachable again. A cloud icon in the
header shows synced, syncing, waiting, offline or paused; tap it to sync now (**Check
for a Newer Backup** does the same). A Dropbox copy that uses a different passphrase
cannot be combined automatically; the app asks whether to restore it and automatic
backup stays paused until you do (**Back Up to Dropbox Now** replaces the Dropbox copy).
A city, region or area deleted on one device can reappear from another.

To sync devices: turn on a passphrase first only if you want encrypted copies, connect the
main device, then connect each other device to the same Dropbox and choose **Restore**
(not Replace), entering the main device's passphrase or recovery code. All devices that
sync together must use the same passphrase and recovery code. Without Dropbox, nothing
syncs and each device keeps its own data.

## Share one contact

Open a contact with the pencil button and choose the export icon at the bottom
of the Edit Contact screen to export that contact, including
its visit history, as a file. If the device has a passphrase, the file is
encrypted: create a separate sharing passphrase of at least 8 characters and
give it to the recipient through a different channel. With no passphrase, the
file is plain and no passphrase is asked for.

The recipient can use the regular website or install the PWA. On the contacts
page, choose the import icon next to the blue **+**, select one or several
files, enter the sharing passphrase if a file is encrypted, and confirm the
import. It adds new contacts without replacing existing contacts.

## Export several contacts

On the contacts page, choose the export icon at the far right of the toolbar.
Export all contacts currently shown, or choose numbers/ranges such as
`3, 4-7, 9`. Numbers match the current filtered and sorted list and map pins.
Selected contacts can be exported to a file or shared by SMS, WhatsApp, or
email. Large selections may exceed messaging app limits; use a file instead.
With a passphrase on, file export lets you choose whether to encrypt; with no
passphrase, the file is unencrypted. Use **Settings → Choices → Keep Your Data
Safe → Backup & Restore → Back up everything** for a full backup of contacts
and settings. The Import icon beside Export adds every contact from the selected
contact file or files without replacing existing contacts.

## Stop using the app and remove data

Browser and Home Screen app copies may store data separately, so removing one
copy may not remove another. To remove the Safari browser copy on iPhone or
iPad, go to **iOS Settings → Safari → Advanced → Website Data** and delete
`grasfulls.github.io`. To remove a separate Home Screen app copy, touch and
hold its icon, choose **Remove App**, then **Delete App**. In Chrome on
Android, use the site's **Clear data** or **Clear & reset** setting, or find it
under **Settings → Site settings → All sites**. Menu names may vary by
version. Repeat for every browser and device used. Downloaded backups,
exported contact files, PDFs, and printed pages are separate; delete those
wherever you saved or shared them.

## Install and updates

The app is published on GitHub Pages:

**https://grasfulls.github.io/return-visits-app/**

The app checks for updates when it opens and shows any update prompt once it has
finished opening (after unlocking, if a passphrase is on). If an update is ready, it prompts you to update now or later; an
exclamation mark also appears by Settings. To check or refresh manually, open
**Settings → App updates → Check for Updates & Refresh** while online. If there is no
update, a "No update available" message appears with an OK button. Save or finish any
open contact or Settings edits before refreshing; if something is unsaved, the app
names the exact section and field and opens it. Leaving Settings with unsaved edits
asks "Discard unsaved changes?" (OK discards, Cancel stays so you can finish). The app reloads its code
while keeping the contacts and settings stored in that app copy on the device.
After the reload, unlock with the same passphrase if one is turned on.

The plain-language user guide is available from **Settings → Help → User Guide & Privacy Notice** or directly at
**https://grasfulls.github.io/return-visits-app/help.html**. It is an
accessible, responsive HTML page that can be read in a standard web browser.
The combined Setup and User Guide PDF is in the [docs/](./docs) folder and linked from the page.

The **Privacy & Data Notice** is available from Settings or directly at
**https://grasfulls.github.io/return-visits-app/privacy.html**. The page also
provides a downloadable PDF copy. It explains what information the app stores
on the user's device, what may be sent to hosting and mapping providers, and
that the app owner does not collect information identifying who downloads or
uses the app.

PWA installation is optional. On iPhone, open the site in Safari, tap **Share**,
then **Add to Home Screen**. On Android, open it in Chrome and choose **Install
app** or **Add to Home screen**.

The browser version and Home Screen app do not automatically sync local
contacts. Installing the app does not transfer data already stored in the
browser. To move contacts, export a backup (encrypted or not, as you prefer) in the source version and
restore it in the destination version. Keep the source copy until the restored
contacts are confirmed; later changes do not sync between the copies.
The app is free to use and has no sync service of its own; optional Dropbox sync is described under Cloud backup. For simpler day-to-day
use, choose one browser or Home Screen app on one device as your regular copy;
without Dropbox, maintaining multiple copies requires manual backup/restore, and restoring a
full backup replaces the destination copy's contacts and settings.

The service worker caches the same-origin app shell and updates cached files
when they are next requested online. Maps and address searches still need
internet access. Changes go live after they are pushed to GitHub and the Pages
deployment completes. GitHub Pages and third-party services are subject to
their providers’ terms and availability.
