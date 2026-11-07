# Nice Return Visits: Current User Documentation Source

## Purpose and evidence standard

This document records the user-facing behavior present in the inspected application source. It is a handoff for a nontechnical writer preparing a User's Guide, Help pages, FAQ, and related website content. It describes the implementation, not a feature proposal.

The controlling evidence is the current application markup and code: `index.html`, `app.js`, `dropbox.js`, `merge.js`, `service-worker.js`, and `manifest.webmanifest`. Current in-repository Help, Privacy, and Terms pages were consulted only as supporting context; where they differ from the application source, follow the source and verify the discrepancy before publishing. No older audit, plan, or guide should override the behavior described here.

Names in this document follow the user-facing product name **Nice Return Visits** and the short form **NRV**. The Dropbox app folder is literally named **Return Visits**.

---

## 1. Product overview

### What Nice Return Visits is

Nice Return Visits (NRV) is a free, installable web app/PWA for keeping contact details and recording return-visit history. It can show the currently matching contacts on a map, print records, and optionally track time in service. It is not a full-featured general-purpose contact-management system.

### Problem it solves and intended users

The app helps a person keep track of people they want to revisit: who the person is, how to contact or locate them, where they fit in an optional city/region/area hierarchy, when visits happened, and the most recent visit note. The source does not identify a particular organization, occupation, or eligibility requirement. A guide should describe the practical use without assigning an audience the source does not establish.

### Normal workflow in plain English

1. On first visit, choose to set up the recommended app icon or use NRV in the current browser. Accept the current Terms of Use and Privacy & Data Notice before using the app.
2. If you choose the app icon, follow the install guidance, open NRV from the icon, then complete the agreement and first-launch setup. If you choose the browser, use the same browser on the same device as your working copy.
3. Set a default state/province and city in Settings. Optionally fill in Your Details and create reusable Cities, Regions, and Areas.
4. Add contacts. A first name and country are required; other contact details and location fields are optional. A map pin is separate from the street address and must be looked up, placed, or entered.
5. Add visit notes as they happen. NRV uses the newest visit note (or the contact's creation date if there are no notes) to calculate elapsed days and urgency.
6. Search, filter, sort, view, print, navigate to, or share the contacts currently needed.
7. Protect the local copy with an optional passphrase and make backups. Dropbox backup/sync is optional and requires the user's Dropbox account.

---

## 2. Complete feature inventory

### Contact records and visits

| Feature | What it does and where to find it | How to use it | Limitations, warnings, and special behavior |
|---|---|---|---|
| Add a contact | **Contacts** screen, **Add a Contact** button. Opens the Add Contact editor. | Enter a first name; select a country; add any other details; use the save icon in the editor footer. | First name and country are required. Email and phone are optional. Phone validation accepts a 10-digit number formatted as `(555) 123-4567` (a leading US country code `1` may be stripped while typing); this is not an international phone-number form. An address alone does not set a map pin. |
| Contact details | **Add Contact** / **Edit Contact** editor, **Contact Info** section. | Enter first/last name, email, phone, country, state/province, city, region, area, street address, and optional coordinates. Save with the footer icon. | First name and city are required; last name is optional. Choose a saved city or add one in the editor. Country enables city; city enables region and area. Region and area are optional. Location names are reused as filter choices. Email is checked for a basic `name@example.com`-shaped value. |
| Phone formatting | Phone field in contact editor. | Type a number; the field formats up to ten digits in US style. | Saving rejects a nonempty value not matching the US-style format. Do not promise support for other national dialing formats based on the country selector. |
| Visit history | Contact editor, **Visits** section. Existing visit logs are shown newest first. | Add a note in the new-visit field; optionally change date/time; save the contact. Select **Edit** beside a prior log to change its date/time or text; select **Delete** and confirm to remove a log. | A visit date changed by the user can create a log even if the note text is blank. If neither text nor date is changed, no visit is added. Editing a log requires nonblank note text. A deletion is recorded so Dropbox synchronization does not bring the log back. |
| Quick visit | **ADD VISIT** button on a contact card. | Tap it to open that contact's editor directly in **Visits** and focus the new note field. | Saving still uses the editor's Save icon. Leaving without entering a note or changing the visit date does not add a visit. |
| Edit contact | Pencil/**Edit Details** button on a contact card, or **Edit Contact** in a map popup. | Change fields and save using the footer save icon. | The contact's Share, Export, and Print buttons are disabled while the editor has unsaved changes; save first. Closing the editor can prompt about discarding unsaved changes. |
| Delete contact | Trash/**Delete Contact** button on a contact card. | Choose delete and confirm. | Deletes the contact and all its data from this app copy. It does not erase previously exported files, printouts, or other app copies. A deletion marker is used by cloud merge logic. There is no bulk contact delete control. |
| Contact card summary | **Contacts** screen. | Review address/location, phone/email when present, days since last contact and urgency, most recent visit date, note count, and newest note text. | Newest note text on the card is shortened after 140 characters. Contacts with no visit notes use creation date for elapsed-time status and show “No visit notes yet.” |
| Search | Search field in the app header on the Contacts screen. | Type text to search names, email, phone, address, area, and visit-note text. Clear the query to remove that text condition. | Search is combined with selected filters. A card indicates “Matches a visit note” when the search matched only a note. |
| Urgency filter | **All Urgency** selector in the header. | Select Normal, Urgent, or Immediate. | Normal = 0–7 days; Urgent = 8–14 days; Immediate = 15 or more days since the newest visit note, or contact creation when there are no notes. Days are floored to whole elapsed days and never shown below zero. |
| Location filters | **All Cities**, **All Regions**, **All Areas** selectors. | Choose a city, then optionally a region and area. Clear to “All …” to remove that condition. | Region and area choices are constrained by selected city/region. Filtering applies to contact records, not just pins. |
| Sort | **Newest First**, **Oldest First**, **Alphabetical** selector. | Choose the desired order. | Newest/oldest use the most recent visit note date; if no notes exist, they use the contact's creation time. Alphabetical sorting uses first name. Contact numbers shown in the list and export dialog can change with filtering/sorting. |

### Places and map

| Feature | What it does and where to find it | How to use it | Limitations, warnings, and special behavior |
|---|---|---|---|
| City/region/area hierarchy | **Settings → Cities, Regions & Areas**; also available from Your Details and the contact editor. | Add a city, and optionally assign regions and areas to it. Fields offer add choices while editing Your Details or a contact. | City is required on a contact; region and area are independent and optional. |
| Manage locations | **Manage Cities, Regions, and Areas** list in Settings. | Use **Edit** to rename; **Save** or **Cancel** completes the inline edit. Use **Delete** to remove a location after confirmation. | Rename updates references in contacts and child locations. Deletion is blocked if contacts are assigned to that location or anything beneath it. Deleting an unassigned city or region also removes its child locations after confirmation. |
| Map view | **Map** button in the bottom navigation. Shows contacts currently visible after the Contacts search/filter conditions, contact pins, optional home pin, and live device-location dot. | Open Map. Select a popup for contact details/actions. Drag a saved contact pin or home pin to adjust it; the change saves automatically. | A contact with coordinates gets an exact pin. A contact without coordinates but with a city can be shown at an approximate city location after an online search. Contacts without mappable city information may not appear as pins. Contact/map list numbering follows the currently visible list. |
| Address/city pin lookup | Contact editor → **Use Address Entered**. | Enter address and/or city first; choose the lookup button. Select among multiple matches when offered, check the pin, drag it or tap the map to adjust it, then confirm and save the contact. | Lookup sends entered location text to OpenStreetMap Nominatim. If a street lookup fails, the app may search the street name without the leading house number and/or the city. City-only lookup creates an approximate pin. A street address does not itself make a pin. |
| Cross-street lookup | Contact editor, displayed after some address searches fail. | Enter a nearby cross-street/intersection and choose **Search Near Cross-Street**. Check and adjust the returned pin. | The cross-street text and selected city/state/country are sent to Nominatim. Network/search results may fail or be approximate. Manual map placement remains available. |
| Device location for contact/home pin | Contact editor **Use Device Location**, or Settings → Your Details **Use device location**. | Grant the browser location permission if asked. For a contact, check the returned location and save. For Your Details, save the fields after using the button. | Requires browser support/permission and can be approximate. These buttons place coordinates into the record being edited; map's live blue-dot location is a separate, unsaved display. |
| Live map location | Map view. | Allow location permission when the map opens. The browser may update a blue dot and accuracy area while Map is open. | It is not saved to a contact or backup. Permission denial or unavailable location produces a status message. |
| Map default center | Settings → Defaults & Your Details, **Default City** and default state/province. | Save the defaults. If there are no map pins to fit, the Map may geocode the default city and use it to center. | Opening Map may send default city/state/country to Nominatim when there are no contact, home, or live-location pins. |
| Directions | Navigate button on contact card, **Get Directions** in a map popup, or directions icon in a saved-contact editor. | Choose the directions action to open Google Maps with the destination from saved coordinates or address. | Destination information is sent to Google Maps. The editor action is available only for saved records with a usable destination. |

### Printing, sharing, and file transfer

| Feature | What it does and where to find it | How to use it | Limitations, warnings, and special behavior |
|---|---|---|---|
| Print visible contacts | Printer action in the bottom bar while on Contacts. | Apply desired search/filter/sort; tap the printer; confirm. | Prints currently visible contacts, grouped by the most specific assigned location. Includes contact ID, address, phone/email when present, and only the most recent note. |
| Print Map list | Printer action in the bottom bar while on Map; **Print Map List** dialog. | Choose **Numbered pins and addresses only** or **Pins with contact details**, then **Print**. | Uses the visible contacts. Precise pins are numbered; contacts sharing an approximate city pin use a grouped city pin number; contacts with no pin are listed separately. |
| Print one contact | Printer icon in a saved contact's editor. | Choose most recent note only (default) or all notes; choose **Continue to Print**. | Save edits first. The print output includes name, address/location, phone/email when available, ID, and selected notes. |
| Print settings | Printer action in bottom bar while in Settings. | Tap to open the browser/device print interface. | The printout includes default country/state/city, Your Details name/address/city/state/country if present, whether the passphrase is on (not the passphrase), and city/region/area lists. It is not a settings backup. |
| Share one contact | **Share** icon in the editor for an unchanged saved contact; opens **Share: [name]**. | Choose no notes (default), most recent note, or all notes; choose Text/SMS, WhatsApp, or Email. Review the outgoing message in the chosen app before sending. | The prepared plain-text message includes available contact name, phone, email, address and directions link; Your Details name is added as “Shared by …” if present. Home address/pin is not included. The app does not send until the user completes the chosen service's send action. Not encrypted. |
| Export visible/selected contacts | Export icon at top of Contacts; opens **Export Contacts**. | Choose all contacts shown or enter list numbers/ranges such as `3, 4-7, 9`. Choose Export File, Text/SMS, WhatsApp, or Email. | It exports/shares only contacts in the current visible view. The displayed numbers can change after filtering/sorting. Long message links may be refused with a prompt to export a file instead. |
| Export one contact | Export icon in the unchanged saved-contact editor. | Choose the icon; if a passphrase is on, choose whether to encrypt in the Export dialog; for protected contact-file export, create/confirm a separate passphrase when asked. | Creates a JSON contact-transfer file, not a full backup. A separately protected contact file uses a passphrase of at least 8 characters; give it to the recipient separately. |
| Import contact file(s) | Import icon at top of Contacts. | Select one or more JSON contact-transfer files. Enter the file passphrase when an encrypted file requires it. Confirm the number of contacts to add. | Imports records as new contacts; it does not modify existing records or merge duplicates by identity. Visit history is included. Location definitions needed by imported records are added. Failed imports report that existing contacts were not changed. |
| Full backup | Settings → Choices → Keep Your Data Safe → Backup & Restore → **Back up everything**. | Choose the button and save the downloaded JSON backup in a safe location. | Contains all contacts and settings, including Your Details, locations, and Time in Service. It is encrypted when a passphrase is on; otherwise it is readable JSON. Exporting does not upload the file. |
| Full backup restore | Same Settings subsection, choose a JSON backup and **Restore Selected Backup**. An encrypted backup prompts for its backup passphrase. | Select the backup, enter the passphrase if required, review the replacement prompt, and confirm only if intended. | Replaces all local contacts and settings, not a merge. Restoring an encrypted backup can turn on or switch the local passphrase/recovery code. Restoring a plain backup into a passphrase-protected copy keeps that device's passphrase and encrypts the restored records locally. |

### Security, preferences, Dropbox, and app operation

| Feature | What it does and where to find it | How to use it | Limitations, warnings, and special behavior |
|---|---|---|---|
| Optional passphrase protection | Settings → Choices → Passphrase to Open App. | **Turn On Passphrase**; enter and confirm at least 12 characters; save. On later launches, enter it to unlock. The app gives a recovery code once. | Fresh copies default to no passphrase and local records are not encrypted by the app. A passphrase encrypts this browser/app copy and new backups; it is not itself a backup or sync. Losing both passphrase and recovery code means the encrypted data cannot be opened. |
| Change/turn off passphrase | Same section. | Change requires current passphrase/recovery code and a different new 12+ character passphrase. Turn-off shows a warning, then requests current passphrase/recovery code. | Changing affects this local copy, not other app copies or previously created backup files. Turning off stores this copy unencrypted, disables unlock, invalidates the recovery code, and makes new backups unencrypted. |
| Recovery code | Same passphrase section; **Make a New Recovery Code**. | Enter current passphrase (or valid recovery code); record the newly shown code somewhere safe and private. **Copy** is available if clipboard access works; **I have saved it** closes the one-time display. | Anyone holding the code can open the data. It is shown only once; making a new one invalidates the prior code. Existing compatible backups include the recovery metadata locked to the backup passphrase. |
| Time in Service | Settings → Time in Service; after enabling, a **Time** navigation button appears and a Start/Stop Time control appears on Contacts. | Enable tracking. Start/stop the timer or add a manual entry with date, hours, minutes, optional note. Edit/delete entries in Time. | Daily/month/year totals derive from entries. The month goal is 50 hours; service-year goal is 600 hours (Sep. 1–Aug. 31), each optionally shown. A timer running while away prompts whether to keep it going or stop at last-seen time. Turning tracking off erases all recorded time after confirmation. At most the latest 60 time entries are listed. |
| Optional Dropbox cloud backup/sync | Settings → Choices → Keep Your Data Safe → Cloud Backup (optional). | Set up; choose whether you already have Dropbox; connect and sign in; approve access to the app's **Return Visits** folder. Confirm the risk warning before leaving for Dropbox. | Requires a Dropbox account; app has app-folder access, not all Dropbox files. Off until user connects. Without an app passphrase, cloud backups are not encrypted. With one, backups are encrypted using that copy's passphrase. |
| Dropbox automatic backups and multi-device merge | Dropbox controls once connected; cloud icon/status in app header. | Edits queue an automatic upload shortly after change; app also checks/syncs on open, periodically while open, and after connectivity returns. Tap cloud status to sync/check now; Settings offers **Check for a Newer Backup**, **Back Up to Dropbox Now**, **Restore from Dropbox**, and **Disconnect Dropbox**. | Keeps latest plus up to 10 dated copies. Contact/visit changes from multiple devices are merged where possible; visits from both are kept when the same contact changes. If a newer copy has a different passphrase and cannot be merged, automatic backup pauses and user must restore or explicitly choose to overwrite. Disconnect stops future app sync but leaves files in Dropbox. |
| Backup reminder | App prompt on opening after a sufficiently long interval without a successful backup. | Answer whether to back up. With Dropbox connected, Yes triggers a Dropbox backup; without it, the app opens the local Backup & Restore section. | Prompt appears after 10 days, at most once per day; only a successful backup resets the interval. |
| Persistent-storage status | Settings → Backup & Restore, **Storage protection** message. | The app checks/requests browser persistent storage when startup completes. Read whether it is on, unsupported, not granted, or could not be checked. | Browser support and decision vary. Persistent storage does not replace backups. |
| Install/bookmark walkthrough | First-use banner on Contacts. | Step 1 selects device type, platform, browser and gives bookmark instructions; **I saved the bookmark — continue** or **Skip for now** moves to Step 2. Step 2 offers **Set up Defaults & Your Details** or **Skip setup and start using Contacts**. | This walkthrough teaches bookmarking; it does not itself install the PWA or transfer data. It guesses device/browser but lets the user correct them. |
| PWA installation | Optional instructions in unlock/help content; manifest declares standalone app, portrait orientation and icons. | iPhone/iPad: open in Safari → Share → Add to Home Screen. Android: Chrome menu → Install app/Add to Home screen. Computer: Chrome/Edge install icon if offered. | Browser options vary. Browser and installed-app copies can have separate storage; installing an icon does not move contacts. |
| Offline shell and updates | Service worker, update dialog, Settings → App Updates. | Same-origin app shell/resources are cached after successful service-worker installation. Check for update manually or respond to the “App update available” dialog with **Update now** or **Later**. | Offline operation is limited to already cached same-origin resources; maps, geocoding, Dropbox and external assets require network. Update applies by refreshing; app blocks refresh if a contact is open or Settings has unsaved edits. |

---

## 3. Complete screen, page, dialog, menu, form, and important-state inventory

### Entry, consent, and setup

| Exact name/title | Purpose and how the user gets there | Controls and what happens next |
|---|---|---|
| **How would you like to use NRV?** | First-visit choice in a browser: set up the recommended app icon or explicitly use this browser. Installed-app launches skip this choice. | **Set up the app icon (recommended)** opens platform install guidance. **Use NRV in this browser** saves the choice and reloads to the agreement. Links explain the benefits of the icon and return to the website in the selected language. |
| **Before you use Nice Return Visits** | Agreement overlay, shown until the current agreement version has been accepted in this browser/app copy. It follows the first-visit choice for browser use and appears on the first launch from an installed icon. | Links open **Terms of Use** and **Privacy & Data Notice** in another tab/window. Checkbox enables **Agree and continue**. On success it reveals the unlock/launch flow; storage failure shows a visible error and leaves retry possible. Acceptance does not connect Dropbox or trigger a map search. |
| **Unlock Nice Return Visits** | Conditional startup overlay when a local encrypted database exists. | **Passphrase**, **Unlock**. Wrong passphrase/data error appears beside the form. It can also offer **Choose Backup to Restore** in this protected-startup state. Successful unlock opens the app. |
| **First-time use** (conditional unlock content) | Passphrase creation copy in the unlock screen if startup is configured to create encryption. The current checked-in default bypasses this screen on a fresh unencrypted copy. | Passphrase and confirmation; **Encrypt and Continue**; **Help me add an app icon** details; optional restore. Do not describe this as the normal fresh-install screen while the current source default remains unchanged. |
| **Help me add an app icon** | Expandable install guidance on unlock content. | Gives iPhone/Safari and Android/Chrome instructions and links to Help's illustrated install guide. |
| **Contacts** (`NRV - Contacts`) | Main/default screen after successful entry. | Header search and selectors; Add a Contact; optional Start/Stop Time; import and export icons; contact cards and actions; bottom navigation. Filtering/search also determines visible map contacts. |
| **Let's get Nice Return Visits ready for you** | Dismissible first-use banner on Contacts, with two steps. | Step 1: device type, system, browser, dynamic bookmark steps; **I saved the bookmark — continue**, **Skip for now**. Step 2: **Set up Defaults & Your Details**, **Skip setup and start using Contacts**. Progress shows current step. |
| **You're ready to get started** | Follow-up dialog after saving Defaults during guided setup. | **Add my first contact**, **Add more details or places**, **Continue to Contacts**. These route to the contact editor, Settings personal details, or Contacts. |

### Main app screens and editors

| Exact name/title | Purpose and how the user gets there | Controls and what happens next |
|---|---|---|
| **Contacts** | Main record list. Initially active; returned to by bottom navigation. | Search; urgency/city/region/area filters; sort; **Add a Contact**; import; export visible; optional timer; cards with Add Visit, Edit, Navigate when available, Delete. Bottom-bar printer prints visible list. Empty state reads **No matching contacts found.** |
| **Map** | Main map screen via bottom navigation. | Interactive map; contact/home pins; popups; drag pins; live-location permission/status. Bottom printer opens **Print Map List**. Status messages cover locating pins, no matches, no coordinates, and lookup failures. |
| **Time** / **Time in Service** | Appears in bottom navigation only when tracking is enabled. | Today timer total; optional month/year goal summaries; Start/Stop at Contacts; manual add/edit form; up to 60 time entries, each with edit/delete. **Cancel** exits entry editing. |
| **Settings** | Settings screen via bottom navigation (gear). Accordion sections can expand/collapse. A section generally collapses a peer section. | Bottom printer prints settings; sections below contain settings, data, help and update controls. Navigating away with unsaved edits asks whether to discard or return. |
| **Defaults & Your Details** | First Settings section, with expandable **Defaults** and **Your Details** subsections. | Defaults contains country, default state/province and default city. Your Details contains name, street, city, state/province, postal code, region, area and coordinates, with location add controls, **Find from address**, **Use device location**, and clear. Region and area can be set to **None**. During setup, **continue to Contacts** and the Contacts navigation icon both open Contacts. When leaving with changes, choose **Save Changes** or **Discard Changes** to continue. Optional details affect share attribution and map home pin. |
| **Cities, Regions & Areas** | Settings location-management section. | Add City; choose city and add Region; choose city/region and add Area; hierarchy list with inline Edit/Save/Cancel/Delete. Duplicate/invalid selections and location-in-use deletions produce messages. |
| **Time in Service** (Settings section) | Enables the Time screen and timer. | **Track Time in Service**; optional monthly and yearly goal checkboxes. Disabling warns that all time will be erased and requires confirmation. |
| **Choices** | Settings section that contains passphrase and safety/backup sections in the current markup. | Expand **Passphrase to Open App**; **Keep Your Data Safe** contains **Backup & Restore** and **Cloud Backup (optional)**. |
| **Passphrase to Open App** | Nested Settings subsection. | Depending on state: **Turn On Passphrase**, **Change Passphrase**, **Turn Off Passphrase**; current/new/confirm fields; warning and confirmation steps; status messages; recovery-code form. |
| **Keep Your Data Safe** | Nested Settings section. | Introduces backup controls; has nested Backup & Restore and Cloud Backup. |
| **Backup & Restore** | Nested Settings subsection. | Storage-protection status; **Back up everything**; file picker; **Restore Selected Backup**. Restore may prompt for passphrase and then a replace confirmation. |
| **Cloud Backup (optional)** | Nested Settings subsection. | Disconnected flow (setup, existing-account question, signup directions, connection instructions); connected flow (account/last-backup status, backup now, restore, check newer, disconnect). Cloud status text explains failures, waiting, paused sync, or success. |
| **Help** / **User Guide & Privacy Notice** | Nested Settings help links. | Opens User Guide (`help.html`), Privacy & Data Notice (`privacy.html`), Terms of Use (`terms.html`) as separate pages. |
| **App Updates** | Settings section. | Explains check on open; **Check for Updates & Refresh** (label becomes **Update Now** when an update is ready); status text; update-ready notice. Refresh asks the user to finish edits first. |
| **Add Contact** / **Edit Contact** | Contact modal opened by Add, Edit, Add Visit, or map popup. Header title updates to exact state. | Header **Add a new contact** button opens a clean Add Contact form after warning about unsaved edits; close control exits through unsaved-change handling. Sections **Contact Info** and **Visits**. Footer has save icon. Saved, unchanged contacts have Share, Export, Print and conditional Directions icons. |
| **Contact Info** | Expandable section in contact editor; open by default on normal edit. | Name, contact methods, country/state/city/region/area, street address, coordinates, address/cross-street lookup, GPS, interactive pin map, Confirm pin/Adjust pin. **Add Country/Region/Area** mini-forms each have save/cancel. |
| **Visits** | Expandable section in contact editor; opened directly by Add Visit. | Existing logs show date/text plus **Edit** and **Delete**. New log date/time field and note field; save contact to store. |

### Dialogs, sharing, printing, and transient states

| Exact name/title | Purpose; controls; outcome |
|---|---|
| **Print Map List** | Choose numbered pins/addresses only (default) or pins with contact details; **Print** opens system print UI; **Cancel** closes. |
| **Export Contacts** | Choose all visible or one/more list numbers/ranges; status validates selection. **Export File**, **Text / SMS**, **WhatsApp**, **Email**, **Cancel**. Message-size limits can disable message links and recommend file export. |
| **Export** | Checkbox **Encrypt with my passphrase** (checked by default when this dialog is shown for a protected export); warning appears if unchecked; **Export** or **Cancel**. |
| **Unlock Backup** | Requests the passphrase used for a selected encrypted backup; **Decrypt Backup** or **Cancel**. |
| **Restore from Dropbox** | Select Latest copy or dated backup and choose **Restore** or **Cancel**. Restore replaces local data after additional confirmation. |
| **Protect Contact File** / **Unlock Contact File** | Dynamic title/description for encrypted one-contact export or import. Export requires passphrase and confirmation; import requires existing file passphrase. Submit label changes to Export Contact/Import Contact; **Cancel** abandons. |
| **Share: [contact name]** | Choose no visit notes (default), most recent note, or all notes; shows count; Text/SMS, WhatsApp, Email, Cancel. Launches a prepared external composer. |
| **Print Contact** | Choose most recent note only (default) or all notes; **Continue to Print** or **Cancel**. |
| **App update available** | **Update now** refreshes after safety checks; **Later** dismisses current prompt. |
| **Your recovery code** | One-time recovery-code display; **Copy**; copy status; **I have saved it**. |
| **You are up to date!** | Shown after successful update refresh; **OK** closes. |
| **No update available** | Shown after explicit check finds no update; **OK** closes. |
| Browser/device confirmation and alert prompts | Used for contact/log/time/location deletion, overwrite/restore, unsaved edits, turning off passphrase/time tracking, Dropbox conflict/connection choices, print confirmation, and errors/success. Exact wording is action-dependent; treat the choice as consequential and explain what data may be replaced or erased. |
| Important map/location states | Loading, lookup results, ambiguous address matches, approximate city pin, no result, failed network lookup, invalid coordinates, denied GPS, no mappable contacts, no matching contacts, pin save/rollback. Status is shown beside the map/picker; actions may retry or allow manual placement. |
| Important Dropbox states | Header cloud button is hidden when disconnected; when connected it can show synced, syncing, waiting, offline, or warning/paused state. Tap it to start/check sync and read status. |
| Important update/storage states | Update badge/notice; unsaved-settings/contact refresh block; storage protection granted/not supported/not granted/could not be checked; startup database/newer-schema errors. |

### Separate pages

| Page title | Purpose and navigation |
|---|---|
| **Nice Return Visits - User Guide** (`help.html`) | Separate Help page linked from Settings and from the app's setup/install guidance. Has return-to-app links, print-friendly layout, and a downloadable PDF link. Its content should be refreshed to match source before relying on it. |
| **Nice Return Visits - Privacy & Data Notice** (`privacy.html`) | Separate notice linked on startup and in Settings. Includes a downloadable PDF link and return-to-app links. |
| **Nice Return Visits - Terms of Use** (`terms.html`) | Separate terms page linked on startup and in Settings. Includes return-to-app links. |

---

## 4. Step-by-step user workflows

### A. First-time use

1. Open NRV in a browser. Review the **Before you use Nice Return Visits** screen and both linked notices.
2. Check the agreement box and choose **Agree and continue**. If it cannot save acceptance, check browser storage settings and retry.
3. On a fresh copy, passphrase protection is off by default; the current source opens directly to Contacts rather than requiring a new passphrase.
4. Follow **Let's get Nice Return Visits ready for you**, if shown. Correct the guessed device/browser if needed. Save a bookmark using the instructions; the bookmark does not install an app.
5. Continue to Step 2. Optionally choose **Set up Defaults & Your Details**. In Settings, save default state/province and city. Add personal details only if desired.
6. Add reusable cities, regions, and areas in Settings or while editing a contact. You can also skip setup and start adding contacts.
7. Optionally install an app icon through the browser's own install/add-to-home-screen controls. Select one browser or installed copy for regular use because copies may have separate data.
8. Consider turning on a passphrase and/or setting up Dropbox, and make a backup before entering information you cannot replace.

### B. Add a contact and place a pin

1. On Contacts, choose **Add a Contact**.
2. In Contact Info, enter a first name, confirm/select a country, and choose a city. Last name, email, phone, and state/province are optional.
3. City is enabled after country; region and area are enabled after city. Choose a saved city or `+ Add City` to enter one, or choose the `+ Add New …` option for region/area.
4. Enter street address if known. This stores an address but does not automatically create a map pin.
5. To place a pin, use **Use Address Entered**, **Use Device Location**, the coordinate fields, or tap/drag the marker on the picker map. If multiple matches appear, select the correct one. Review approximate results and adjust as needed.
6. If address search fails, use the offered cross-street field, choose a city-only approximate pin, or place the pin manually. Lookup requires internet and sends search text to Nominatim.
7. Open Visits if desired; the default visit date/time is now. Type a note and/or change the date/time.
8. Save using the save icon at the bottom. Validation errors identify invalid email, phone, country/location hierarchy, or coordinates.

### C. Record, edit, and delete visit history

1. Choose **ADD VISIT** on a card for quick entry, or edit the contact and open **Visits**.
2. Enter note text; optionally change the date/time. Save the contact. Merely opening and saving without text or changing the date does not create a visit.
3. To change an existing visit, open the contact's Visits section, choose **Edit**, change date/time/text, and choose **Update Log**. Note text cannot be blank when editing.
4. To remove an individual visit, choose **Delete** beside it and confirm.
5. To remove a whole contact, choose its card's trash icon and confirm. Contact deletion removes its visit history too.

### D. Find contacts

1. Use the header search field to search the supported text fields (name, email, phone, address, area, and visit-note text).
2. Optionally select an urgency, city, region, and area. Conditions combine.
3. Choose Newest First, Oldest First, or Alphabetical. This sorts by creation time or first name; it is not a last-visit sort.
4. Clear search and choose all-values in filters to restore the full list. The map uses this same visible subset.

### E. Use the map and directions

1. Open **Map** from bottom navigation.
2. Allow location access if you want the live blue dot. It is not saved.
3. Review exact contact pins, approximate city pins, and the optional Your Details home pin. Open a pin popup for contact details and Edit Contact/Get Directions actions.
4. Drag a saved contact pin or home pin to adjust it; the app saves automatically and reports success or restores the previous contact pin if saving fails.
5. Use directions to open Google Maps. The selected destination is sent to Google Maps.
6. Use the Map printer action for a numbered pin list or print with contact details.

### F. Configure Your Details and the location hierarchy

1. Open Settings → Defaults & Your Details → Defaults. Set the country, default state/province and default city.
2. Fill Your Details only as desired. Country selection affects available state/city fields; your entered name is appended to contact share messages as “Shared by [name]”.
3. Use **Find from address** or **Use device location** to propose home coordinates. When leaving, choose **Save Changes** to keep your edits or **Discard Changes** to restore the saved values. The saved home pin appears on Map and map fitting includes it.
4. For reusable locations, open Settings → Cities, Regions & Areas. Add cities first, then regions under a selected city, then areas under a selected region.
5. To rename a location, select Edit, type the replacement, then Save. Existing assignments are updated.
6. To delete, select Delete and confirm. Deletion is blocked while assigned contacts use that node or its children.

### G. Enable, use, and disable Time in Service

1. Settings → Time in Service → check **Track Time in Service**.
2. The Time navigation button and Contacts Start Time control appear.
3. Start and stop the timer on Contacts. If the app is closed or backgrounded with the timer running, it continues; after a sufficiently long absence the app asks whether to continue or stop at the last recorded presence.
4. To record forgotten time or change a prior record, open Time and use the date, hours, minutes and optional note form. Add Time; use entry edit/delete controls for existing records.
5. Optionally show monthly/yearly remaining-goal bars. Goals are 50 hours/month and 600 hours per service year (September 1 through August 31).
6. Turning tracking off warns that it permanently erases recorded time; only confirm if this is intended. A backup may contain prior time entries.

### H. Back up, restore, export, and import

**Full local backup**

1. Open Settings → Choices → Keep Your Data Safe → Backup & Restore.
2. Choose **Back up everything** and save the downloaded JSON file somewhere controlled.
3. With passphrase protection on, it is encrypted by default; with protection off, it is readable. Full backups include contacts and all settings including locations, Your Details, and time tracking.

**Full backup restore**

1. In Backup & Restore, choose a JSON backup, then **Restore Selected Backup**.
2. If encrypted, enter the backup's passphrase in **Unlock Backup**.
3. Read the replace warning. A full restore replaces all current contacts and settings; it does not merge. Cancel if the current data must be retained.
4. Confirm; check the resulting contacts/settings and make a new backup.

**Contact transfer**

1. Export one saved contact from its editor or selected/all visible contacts from the Contacts toolbar.
2. If a protected copy exports a contact file, decide whether to encrypt it. A protected one-contact transfer asks for a new passphrase (minimum 8 characters); convey it separately.
3. At the destination, choose Import and select one or more contact JSON files. Enter a transfer passphrase when asked and confirm the import.
4. Imported contacts are added as new records; review for duplicates. The import does not replace existing contacts.

**Share as a message**

1. Use the contact's Share action or Export Contacts selection dialog.
2. Select visit-note inclusion where offered, then choose SMS, WhatsApp, or email.
3. Review and send in the opened external app. Message sharing is plain text, not an encrypted transfer.

### I. Set up and use Dropbox

1. Open Settings → Choices → Keep Your Data Safe → Cloud Backup (optional).
2. Choose Set Up Cloud Backup; select whether you already have a Dropbox account. Signup help opens Dropbox's Basic-plan page outside NRV.
3. Choose Connect to Dropbox. Before redirect, review and confirm the warning about whether backups will be encrypted (depends on passphrase setting), Dropbox folder access and account risk.
4. Sign in at Dropbox and allow access. Dropbox returns to NRV. When connecting a copy with existing data or an account with an existing backup, read the restore/replace prompts carefully.
5. In connected state, use Back Up to Dropbox Now, Restore from Dropbox, Check for a Newer Backup, or Disconnect Dropbox as needed.
6. Watch the cloud icon/status: synced, syncing, changes waiting, offline, or paused/warning. An offline edit remains local and waits for connectivity.
7. When a remote copy cannot be merged because it uses a different passphrase, restore it or explicitly choose to replace it with this device's data. Do not overwrite unless intended.
8. Disconnecting removes the app's local Dropbox token and asks Dropbox to revoke it; it does **not** delete existing backups from Dropbox. Delete those separately in Dropbox if desired.

### J. Bookmark, install, switch copies, and update

**Bookmark and optional installation**

1. Use the first-run device/browser selectors and bookmark instructions, or the Help install section.
2. iPhone/iPad: use Safari's Share → Add to Home Screen. Android: Chrome menu → Install app or Add to Home screen. Computer: Chrome/Edge install control if available.
3. Choose one copy as the working copy. A bookmark is not an install; adding an icon does not move records. Use a full backup/restore to move a full set, or contact exports/imports to add contacts to an existing destination.

**Updates**

1. NRV registers its service worker and checks for updates on open when online.
2. If prompted, finish/save contact edits and Settings edits before refreshing. Choose Update now, or Later.
3. You can also open Settings → App Updates and choose Check for Updates & Refresh. If no update exists, **No update available** appears.
4. After a successful refresh, **You are up to date!** appears. A data schema newer than the running app produces a warning; update/reload before opening that data.

### K. Offline, errors, and recovery

- After the service worker has successfully cached the app shell, same-origin shell navigation/resources may be served offline. It attempts network first, uses a cached response on a network failure, and falls back to cached `index.html` for navigation. Offline support is not guaranteed before the first successful cache.
- Map tiles, Nominatim searches, Dropbox, Google Maps directions, and externally hosted Leaflet files rely on network/provider availability. Offline edits are saved locally; connected Dropbox sync waits for the connection.
- If browser storage is unavailable or the local database cannot open, the app shows an explicit startup/storage message. Do not clear browser data as a troubleshooting shortcut if records matter.
- If lookup fails, retry when connected or manually position a pin. If location permission is denied, use manual placement/address lookup or adjust browser permissions.
- If an encrypted copy will not unlock, check the correct passphrase; try the current recovery code in the passphrase field. Without either, the app cannot decrypt that copy. A backup may be restored only if its passphrase/recovery information is available.
- A malformed backup, incorrect backup passphrase, or backup made by a newer app version reports failure; the restore handler states current data was not replaced. Do not delete the source backup.
- If a Dropbox sync is paused because of a different passphrase, read the warning and choose restore or explicit overwrite; local changes remain saved while waiting.
- If app update refresh is blocked, save/finish the open contact or the identified unsaved Settings field, then try again.

---

## 5. Data and privacy

### What is stored

The app stores contacts (names, email, phone, country/state/city/region/area, address, coordinates, timestamps, visit logs, and synchronization deletion markers); app settings (defaults, Your Details including home coordinates, location lists, time-tracking preferences and entries, backup/sync metadata); and encryption metadata when a passphrase is enabled.

### Where it is stored

- Contact and settings records use the browser's IndexedDB database named `return-visits-app`.
- With passphrase protection off, the app stores those records without app-level encryption. With protection on, it encrypts saved contacts/settings locally and requires the passphrase to unlock that browser/app copy.
- Browser `localStorage`/`sessionStorage` also hold non-contact operational flags, agreement/onboarding state, backup/sync timestamps and Dropbox connection/token workflow data. Clearing a browser's site data can remove the app's local records and these states.
- Each browser profile, device, and installed-app/browser copy may have separate storage. There is no user account or central contact database in the application.

### Whether data leaves the device

Ordinary contact details are not automatically uploaded. They leave the device only when the user chooses a feature or provider that sends them:

| Action/service | Data leaving or provider contact |
|---|---|
| Nominatim address lookup | Address, selected city, state/province, and country; fallback street/city or cross-street text may also be searched. Map opening can look up cities of visible contacts without saved coordinates and, in an empty-map case, default city/state/country. |
| OpenStreetMap map tiles | Browser requests tiles for displayed map areas; ordinary connection information may be visible to the tile provider. |
| Browser geolocation | Browser asks for device permission and supplies coordinates to NRV for a live map dot or an explicitly requested contact/home pin. Live dot is not stored in a contact; explicitly chosen pin coordinates become part of the record only when saved. |
| Leaflet library | The page loads Leaflet CSS/JavaScript from `unpkg.com`. |
| Google Maps | Choosing Navigate opens Google Maps with saved destination coordinates or address. |
| Dropbox (optional) | After connection/authorization, NRV communicates directly with Dropbox and stores full backups in the account's app folder `Return Visits`. Backups are encrypted when app passphrase protection is enabled; otherwise they are not app-encrypted. |
| Export/share/print | A downloaded file, external message composer, printer, or PDF destination receives data the user selected. NRV does not control subsequent copies or their retention. Plain-text Share is not encrypted. |
| Hosting | App resources are delivered from the hosting origin (the privacy page identifies GitHub Pages); provider request logs/practices cannot be established solely from app source. |

The source contains no app analytics, advertising, registration, or in-app user-tracking feature. This does not establish that hosting or third-party providers do not process technical request data.

### Backup and deletion semantics

- A full JSON backup is initiated by the user, except optional Dropbox backups. It contains the app's contacts and settings; it does not upload to a central NRV server.
- A full backup is encrypted when passphrase protection is on, otherwise plain/readable. Contact export can be separately protected when a passphrase is available. Plain files should be treated as readable by anyone who gets them.
- Full restore replaces contacts and settings on the destination after confirmation. It is not a merge. Contact import adds new records and leaves existing records unchanged, so duplicates are possible.
- Deleting a contact/log in NRV removes it from the current copy and uses sync deletion markers for multi-device propagation. It does not erase prior exported files, printouts/PDFs, Dropbox history, or another independent app copy.
- Disconnecting Dropbox leaves existing remote files in Dropbox. They must be removed there separately.
- Clearing site/browser data or uninstalling/removing a PWA copy can make that copy's records unavailable. Export and verify a backup before clearing/removing. Clearing site data does not delete downloaded files or copies sent to other services.

---

## 6. User terminology glossary

| Term | Plain-English meaning in NRV |
|---|---|
| **Contact** | A person record with required first name and country, optional details, location, and visit history. |
| **Visit / Visit log / Visit note** | A dated record attached to a contact. The app uses the newest visit date for elapsed-time urgency. |
| **Days Since Last Contact** | Whole elapsed days since newest visit note; if none exists, since the contact was created. |
| **Normal / Urgent / Immediate** | Recency bands: 0–7, 8–14, and 15+ days. |
| **City → Region → Area** | Optional location hierarchy. Region is a larger part of a city; area is a smaller section/neighborhood within a region. |
| **Pin** | A map marker represented by saved latitude/longitude. A street address by itself is not a pin. |
| **Approximate city pin** | A marker geocoded from city/state/country when no saved contact coordinates exist. It represents the city area, not necessarily a person's exact address. |
| **Your Details** | Optional owner details and home location, used for the map's home marker and attribution on prepared contact-share messages. |
| **Passphrase** | Optional secret protecting one app copy's saved data and encrypting new backups. It is not an account password for NRV and does not sync data. |
| **Recovery code** | One-time-displayed alternate secret that can unlock passphrase-protected data. Anyone with it can open that data. |
| **Full backup** | JSON file of all contacts and settings for one copy; restoring replaces the destination data. |
| **Contact export/transfer** | JSON file for one or selected contacts; importing adds them as new contacts. |
| **Dropbox cloud backup** | Optional copies in the user's Dropbox `Return Visits` app folder. |
| **Sync** | Optional Dropbox exchange/merge of changes between copies connected to the same Dropbox account. |
| **Service year** | Time-tracking period September 1 through August 31; optional goal is 600 hours. |
| **Bookmark** | Browser shortcut to the page; it does not install the PWA or move data. |
| **Installed-app copy** | Browser-provided app-like launch of the PWA; it may keep data separate from the normal browser copy. |
| **Service worker / app shell** | Browser mechanism caching some same-origin app files for offline launch and update. Not all app features/assets are offline. |

---

## 7. FAQ candidates

1. **Do I need an account or subscription?** No NRV account or subscription is implemented. A Dropbox account is needed only for optional Dropbox backup.
2. **Does NRV automatically upload my contacts?** No. Local records stay in that browser/app copy unless you choose Dropbox or send/export/print information through another service.
3. **Is my information encrypted by default?** No. A fresh copy has passphrase protection off. Turn it on in Settings to encrypt local records and future full backups.
4. **What if I forget the passphrase?** Use the recovery code in the passphrase field. If both are lost, the app cannot decrypt that copy. A separate backup can help only if its needed passphrase/recovery information is available.
5. **Does a passphrase back up or sync data?** No. It protects/encrypts a copy; create a backup or connect Dropbox separately.
6. **Are my browser and home-screen app contacts shared automatically?** No. Each copy may store separate data. Move a full dataset by backup/restore; use contact export/import to add selected records.
7. **Will adding a street address show a map pin?** No. Use address/city lookup, device location, coordinates, or the map picker. Check approximate results before saving.
8. **Does the app send address information to search providers?** Yes, when you request address/city/cross-street lookup; opening Map can also trigger city geocoding for visible unpinned contacts or a default center.
9. **Why is a map pin approximate?** City-only or fallback street search may return an area rather than the exact location. Move/check the marker before relying on it.
10. **How is urgency calculated?** From the most recent visit note, or creation date if no note exists: Normal 0–7 days, Urgent 8–14, Immediate 15+.
11. **Does sorting by newest mean most recent visit?** No. Newest/Oldest sort by contact creation time.
12. **Can I import without replacing my current contacts?** Contact files are imported as new records. Full backup restore replaces all local contacts and settings.
13. **Will import detect a duplicate person?** No identity-based duplicate matching is implemented; inspect after import.
14. **Are shared messages encrypted?** No. Contact Share prepares plain text for the selected SMS, WhatsApp or email service. Contact-file export is the app-to-app transfer option and can be encrypted.
15. **Does deleting a contact delete old exports or Dropbox files?** No. Delete those separately wherever saved. Disconnecting Dropbox also leaves remote backup files in that Dropbox account.
16. **What does disabling Time in Service do?** After warning/confirmation, it erases all stored time entries and removes the Time navigation button.
17. **Will the app work offline?** Some cached same-origin pages/app shell may work after service-worker caching. Map, location search, Dropbox, external map library/assets, and directions may not.
18. **Why did Dropbox sync pause?** A newer backup using a different passphrase may not be mergeable. Restore it or explicitly choose to overwrite it with this device's data.
19. **What happens when I delete a visit log?** It is deleted locally after confirmation and a deletion marker helps prevent it returning during Dropbox sync.
20. **How often are Dropbox backups retained?** The app keeps the latest file and up to 10 dated backup files in its app folder.
21. **What does Disconnect Dropbox remove?** It removes local connection/token state and asks Dropbox to revoke access; existing files remain in Dropbox.
22. **Can a browser clear my contacts to free storage?** The app asks the browser for persistent storage when supported and reports the result, but cannot guarantee the browser grants it. Keep backups.
23. **What if the update prompt appears while I am editing?** Save or finish the open contact/Settings changes before refreshing; the app blocks an unsafe refresh and points out pending edits.
24. **Can I print all visit history?** For one contact, choose all notes in Print Contact. List printing includes only each contact's latest note.
25. **Are Your Details shared with a contact?** Your name may be appended as “Shared by [name]”. Your home address and pin are not included in the prepared share message.

---

## 8. Website Help-content placement

| Website area | Recommended source-based content |
|---|---|
| **Getting Started** | Agreement screen; fresh-copy behavior (no passphrase by default); bookmark versus install distinction; device-specific install; copy separation warning; first-run wizard; setting defaults and optional Your Details; creating first contact; optional passphrase/recovery-code setup; first full backup. |
| **Help** | Navigation; contact fields and validation; city/region/area relationships; visit entry/edit/delete; urgency and search/filter/sort; map pins, geocoding, live GPS and permissions; printing; contact sharing versus encrypted file transfer; import/export; time tracking; app updates; offline limits; storage errors; missing passphrase/recovery code; restore behavior and overwrite warnings. |
| **FAQ** | Account/fees; default encryption; passphrase versus backup; separate copies; address lookup/network privacy; approximate pins; urgency formula; sort meaning; full restore versus contact import; duplication; deletion scope; Dropbox conflict/pause; offline limitations; timer erasure; disconnect semantics. |
| **Privacy** | IndexedDB/local storage; passphrase default and encryption boundary; local-copy separation; Nominatim queries; map tiles/Leaflet; geolocation; Google Maps destination; optional Dropbox OAuth and app-folder files; export/share/print recipients; hosting/provider uncertainty; retention/deletion; lack of app analytics/registration. Distinguish application behavior from third-party provider practices. |
| **Terms** | User responsibility for lawful contact data and sharing; third-party service availability/privacy; backup responsibility and restore verification; optional encryption/passphrase responsibility; as-is availability and changes. Legal wording should be reviewed by the publisher; do not imply source inspection is legal advice. |

Do not copy old Help/Privacy/PDF wording blindly. In particular, verify any claims about frequency, merge behavior, restore prompts, current app version, browser support, exact provider handling, or deletion against the current source before publication.

---

## 9. Recommended User's Guide chapter structure

1. **Welcome to Nice Return Visits** — purpose, intended workflow, what it is not.
2. **Before You Begin** — agreement, local storage, separate copies, data safety checklist.
3. **Bookmark or Install NRV** — bookmark versus PWA install, platform-specific directions.
4. **Set Up Your App Copy** — defaults, Your Details, cities/regions/areas, optional security choices.
5. **Add and Edit Contacts** — required/optional fields, phone/email validation, location hierarchy.
6. **Place and Manage Map Pins** — address/city/cross-street search, manual placement, device location, approximate pins.
7. **Record and Maintain Visits** — quick visit, add/edit/delete logs, dates and notes.
8. **Find the Right Contacts** — search fields, filters, urgency calculation, sort meaning.
9. **Use the Map and Directions** — markers, map popups, live location, directions privacy.
10. **Print, Share, and Export Contacts** — print variants, plain-text messages, contact JSON export/import.
11. **Protect and Back Up Your Data** — optional passphrase, recovery code, full backup/restore, storage protection.
12. **Use Dropbox (Optional)** — setup, automatic sync, statuses, conflicts, restore, disconnect and retained files.
13. **Track Time in Service (Optional)** — enable, timer, manual records, goals, away-from-app prompt, destructive disable warning.
14. **Offline Use and App Updates** — cached-shell boundaries, required connections, update prompt and edit safeguard.
15. **Troubleshooting and Recovery** — permissions, geocoding, storage, passphrase, restore, Dropbox conflict, lost device.
16. **Privacy, Data Removal, and Glossary** — data destinations, deletion scope, terms and user vocabulary.

---

## 10. Screenshot plan

Use synthetic names, addresses, phone numbers, emails, notes, map coordinates, and Dropbox accounts. Never use a real person's contact data, recovery code, passphrase, account email, or device coordinates. Before screenshots, create an isolated demo copy and confirm that sample records cannot sync to a real Dropbox account.

1. **Startup consent** — Clear site data in a disposable demo browser, open NRV, show **Before you use Nice Return Visits**. Teach consent and local/third-party data summary. No personal data.
2. **First-use walkthrough, Step 1** — On a fresh demo copy after consent, show device/browser selectors and bookmark steps. Teach bookmark is not install. Use generic device/browser selections.
3. **First-use walkthrough, Step 2** — Choose continue from Step 1. Teach optional setup and local-data/passphrase/Dropbox choices. No private data.
4. **Settings: Defaults & Your Details** — Use bottom Settings → open Defaults & Your Details. Show synthetic defaults and Your Details fields, with no home GPS coordinates that could identify a real location. Teach which fields are optional and where the home pin comes from.
5. **Location hierarchy manager** — Settings → Cities, Regions & Areas. Populate demo city, region, area; show hierarchy and Edit/Delete controls. Use fictional place names.
6. **Contacts list with sample cards** — Add 3 synthetic contacts with mixed urgency, locations, and visit counts, then show Contacts. Teach card summary and actions. Use obviously fictional data.
7. **Search/filter/sort** — On the demo Contacts list, apply a search, urgency and city filter, then set Alphabetical. Teach combined filters and dynamic list numbering.
8. **Add Contact editor** — Contacts → Add a Contact; show Contact Info fields and hierarchy. Teach first name/country requirement. Use fake personal data only.
9. **Pin lookup with matches or approximate result** — In the editor, use a synthetic fictional address/city lookup; show candidate/approximate result and draggable pin. Teach verify/adjust, with no real person's home address. If live service data makes a safe sample impossible, mock-up is not an actual screenshot; note uncertainty.
10. **Visits section** — Edit a demo contact → Visits. Show history plus new visit entry and Edit/Delete actions. Sample notes must be invented, not copied from real records.
11. **Map with exact and approximate pins** — Add one record with fictional coordinates and one with city-only location; open Map and wait for geocoding. Teach exact vs approximate and popup controls. Avoid showing user's live blue dot or actual home coordinates.
12. **Time in Service** — Enable tracking in Settings, open Time and show timer, goal bar and manual entries. Use fabricated time/note entries; do not imply actual service records.
13. **Export Contacts dialog** — Filter/sort sample contacts, choose export, show all-shown/number-range options and message choices. Teach visible-list selection semantics. Do not complete external sending.
14. **Full backup and restore warning** — Settings → Backup & Restore. Show backup action and, in a disposable destination with disposable data, restore dialog/replace prompt. Ensure no useful data can be overwritten.
15. **Passphrase and recovery code** — Disposable demo copy only: turn on a temporary 12+ character fake passphrase, show the recovery-code modal with a deliberately fake code, then delete/reset demo storage. Never capture a real recovery code or passphrase.
16. **Dropbox connection warning and statuses** — Prefer a mock/sanitized UI capture if a real account is unavailable. If real, use a test Dropbox account and fabricated records; show the risk confirmation before connecting, then synced/waiting status. Never expose account email, OAuth URL/code, or token.
17. **Print Contact dialog** — Open a saved synthetic contact → Print; show note-selection options before opening OS print UI. Do not capture the actual printer destination or saved PDF contents.
18. **Update available dialog** — Capture only in a test environment where a service-worker update is safely staged; show Update now/Later and edit warning. Do not manufacture a false “actual state” screenshot; if not reproducible, use a clearly labeled conceptual illustration.
19. **Offline status** — Disable network in a disposable browser after the app shell has cached; show Contacts shell and offline Dropbox/map status. Teach that core data is local but external services are unavailable.

---

## 11. Documentation uncertainties and limits

1. **Production deployment parity:** Source inspection alone does not prove that the currently hosted GitHub Pages deployment has exactly these files or the same service-worker cache/version. Confirm the live deployment before publishing version-sensitive screenshots or instructions.
2. **Browser/OS-specific UI:** The exact install controls, file picker, print UI, location prompt, persistent-storage decision, and storage clearing instructions vary by browser, operating system, and version. The source cannot guarantee exact labels on every device.
3. **Third-party data handling:** The source identifies Nominatim, OpenStreetMap tiles, unpkg, Dropbox, Google Maps, and the hosting provider, but cannot establish their current retention, logging, privacy terms, geographic routing, or service availability.
4. **Geocoder accuracy and coverage:** Search results and accuracy depend on Nominatim data and query results; the code cannot guarantee that an address resolves correctly or that a returned pin is exact.
5. **Offline completeness:** The service worker defines a shell and same-origin network-first caching, but cannot guarantee successful first cache, browser retention, external Leaflet availability offline, or behavior under every browser's PWA rules.
6. **Actual sync timing and provider state:** Code schedules automatic Dropbox backup/checks and handles conflicts, but real timing depends on the device, network, browser suspension, Dropbox API response, token validity, and cross-device activity.
7. **Permission availability:** The source requests geolocation and persistent storage where supported; it cannot establish a particular user's permission choice, accuracy, browser support, or whether the browser grants persistent storage.
8. **Publisher/legal assertions:** App source does not verify who uses NRV, legal rights to contact data, or legal compliance. Terms wording should be reviewed by the publisher/legal advisor.
9. **Screen availability by state:** Some markup screens/controls are conditional: Time exists only when enabled; passphrase/recovery forms depend on protection state; Dropbox controls change after connection; startup restore/unlock content depends on encryption state. A screenshot or workflow must identify the state that makes a control visible.
10. **Unexercised runtime branches:** Code inspection establishes intended branches and messages, not that every path succeeds in every supported browser. Reproduce destructive, security, and provider workflows only with isolated sample data before writing definitive instructions.

---

## Final source record

### Files examined

- `index.html`
- `app.js`
- `dropbox.js`
- `merge.js`
- `service-worker.js`
- `manifest.webmanifest`
- `styles.css` (supporting layout/control context)
- `help.html` (supporting context only; not treated as authoritative over application source)
- `privacy.html` (supporting context only; source behavior remains controlling)
- `terms.html` (supporting context only)

### Documentation file created

- `NRV-CURRENT-USER-DOCUMENTATION.md`

### Change and commit status

No application source files or configuration files were modified. Existing `APP_REVIEW.txt` and `Your Defaults.jpg` were not modified. No commit was created and nothing was pushed.
