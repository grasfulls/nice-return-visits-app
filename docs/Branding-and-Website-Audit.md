# Nice Return Visits: Branding and Website Audit

**Purpose:** Read-only repository audit and handoff for a follow-up Copilot.
**Audit scope:** Branding, product naming, website/domain references, PWA
configuration, help and legal documentation, contact/support references, and
SEO/social metadata.
**Repository state at audit:** `grasfulls/return-visits-app`, branch `main`.
The audit found a clean worktree before this handoff document was created.

## Decisions supplied for this audit

- Full product name: **Nice Return Visits**
- Short app name: **NRVs**
- Singular short form: **NRV**; plural: **NRVs**
- Primary/canonical public website: `https://nicereturnvisits.org`
- Also owned: `https://nrvisits.org`; intended eventual redirect to the primary
  domain
- Public-facing brand is **Nice Return Visits**, not “NR Visits”
- Public contact email: `Reachout@nrvisits.org`
- Help currently lives in GitHub; GitHub Pages is intended for public
  documentation
- Public users should eventually see the primary website URL where appropriate
- Do not assume either domain, DNS, or redirect has been configured
- This document records an audit only; it does not authorize implementation

## Executive summary

The source already uses **Nice Return Visits** for the main app title, browser
titles, agreement and unlock screens, user guide, privacy notice, terms, and
README. The manifest `name` is correct, but `short_name` is still the full
name; the supplied short-name decision points to **NRVs**.

The public app and help URLs currently point to
`grasfulls.github.io/return-visits-app`. No `nicereturnvisits.org` or
`nrvisits.org` references/configuration, public support email, canonical URL,
Open Graph/Twitter cards, structured data, sitemap, robots file, CNAME, or
tracked GitHub Pages workflow were found.

The app's icon assets are unlettered location-pin graphics. “Return Visits”
without “Nice” remains in a few meaningful places: ordinary descriptive prose
about return visits, and the literal Dropbox folder name `Return Visits`.
Preserve the Dropbox folder name and persisted identifiers. Changing the
domain changes the browser origin and does not migrate existing local data.

## Auditable findings

“User-visible” means displayed in the app, browser/PWA shell, public docs, or a
downloaded PDF. “Change” means a straightforward branding update consistent
with the supplied decisions. “Needs Discussion” means timing, deployment, or
placement must be confirmed before changing it.

| File/path | Location or line | Current value | What it controls | User-visible | Recommended value | Action | Reason |
|---|---|---|---|---|---|---|---|
| `index.html` | 9, 27, 31, 73, 83, 148, 1244, 1252 | Nice Return Visits in the page title, access label, agreement/unlock headings, introductory copy, app header, and update notices | Main app identity and messages | Yes | Keep **Nice Return Visits** | Leave Alone | These values already use the approved full brand. |
| `index.html` | 78, 184–200 | “return visits” / “return visits to this device”; Nice Return Visits in the surrounding onboarding title and install copy | First-use guidance | Yes | Keep “return visits” when it means the activity; use **Nice Return Visits** for the product | Leave Alone | Not every ordinary use of the words “return visits” is a product-name reference. |
| `app.js` | 1210, 3179, 3188, 6352 | Nice Return Visits in unlock text, dynamic heading/title, and Dropbox warning | Runtime labels and warning | Yes | Keep the full brand | Leave Alone | Current product references match the decision. |
| `help.html` | 8, 10, 204, 214, 217, 308, 311, 319, 1062, 1113 | Nice Return Visits in description, title, heading, return links, setup instructions, and app link | Public guide | Yes | Keep the full brand; use NRV/NRVs only where an intentional short form fits | Leave Alone | Existing product naming is consistent. |
| `privacy.html` | 8, 10, 152, 159, 167, 176, 343, 424 | Nice Return Visits in description, title, heading, return links, and notice text | Public Privacy & Data Notice | Yes | Keep the full brand; preserve `Return Visits` when naming the Dropbox folder | Leave Alone | Existing product wording is correct; one Dropbox-folder reference is intentionally not the product brand. |
| `terms.html` | 8, 10, 135, 142, 144, 153, 169, 200, 217, 234 | Nice Return Visits in metadata, heading, terms text, and return links | Public Terms of Use | Yes | Keep the full brand | Leave Alone | Existing product naming is consistent. |
| `README.md` | 1, 3, 5 | Nice Return Visits heading and product description | Repository overview | Yes to repository readers | Keep the full brand | Leave Alone | Already matches the supplied full name. |
| `manifest.webmanifest` | 2–7 | `id`, `start_url`, and `scope` are `./`; `name` and `short_name` are both “Nice Return Visits” | Installed PWA identity, launcher label, and scope | Yes | Keep `name` as Nice Return Visits; set `short_name` to **NRVs**; evaluate `id` and scope only with the domain migration plan | Change (`short_name`); Needs Discussion (`id`/scope) | The full name is correct, but the intended short name is not reflected. Changing identity or scope during a host migration can affect installed-app behavior. |
| `icons/icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png` | Referenced by `index.html` line 14, `manifest.webmanifest` lines 12–20, and `service-worker.js` lines 15–17 | Blue location-pin artwork; no visible letters or old product name | Home-screen and app icon artwork | Yes | No branding change required by this audit | Leave Alone | Assets appear generic and contain no product-name text. |
| `README.md` | 286, 298, 312, 317 | `grasfulls.github.io` and absolute GitHub Pages app/help/privacy URLs | Install, update, and documentation instructions | Yes to readers | Eventually use `https://nicereturnvisits.org` after configuration is confirmed | Needs Discussion | The repository contains no evidence that the custom domain is configured or live. |
| `help.html` | 1019, 1028, 1036, 1044, 1061 | GitHub Pages hostname in site-data removal instructions and app link | Help and migration instructions | Yes | Update public app link after domain launch; retain clear cleanup guidance for existing GitHub-host data | Needs Discussion | A new host is a different browser origin; data does not move automatically. |
| `index.html` | 51, 56, 104, 193, 713, 716, 721 | Relative links to Terms, Privacy, and Help | In-app help/legal navigation | Yes | Keep relative links so they work on either host | Leave Alone | These links do not hard-code GitHub. |
| `service-worker.js` | 1–17 | Cache version `return-visits-shell-v99`; relative app, docs, and icon paths | Offline shell cache and app updates | Mostly not visible; affects app behavior | Keep cache mechanism and bump cache version for relevant future releases; keep paths valid | Leave Alone | Cache identifiers are operational, not branding labels. |
| `README.md`, `help.html` | README 286–317; Help 1019–1061 | Current public app and document URLs point to GitHub Pages | Public hosting and published documentation | Yes | Use the primary domain after deployment; eventually redirect `nrvisits.org` to it | Needs Discussion | DNS, HTTPS, GitHub Pages custom-domain setup, and redirect are not established in the repo. |
| `index.html`, `terms.html` | `index.html` 51, 56, 104, 193, 713, 716, 721; `terms.html` 147, 186 | Relative Help, Terms, and Privacy links | In-app navigation | Yes | Preserve these relative links | Leave Alone | They are host-independent and already point to the local published files. |
| Repository-wide contact search | No public support email or support link found | No `Reachout@nrvisits.org` or public contact route; `app.js` line 3353 has a generic `mailto:` composer for user-selected contact sharing | Support/contact route | Yes, absent | Add the approved address in agreed support/help surfaces | Needs Discussion | The email is a supplied decision, but its placement has not been specified. The contact-share composer is not a support address. |
| `dropbox.js` | 5–11, 34–64, 77–101 | Dropbox client key; origin-derived redirect URI; persisted Dropbox state keys | Dropbox OAuth and connection state | User sees the Dropbox flow; values are implementation details | Preserve persisted keys and app configuration; update allowed OAuth redirect origins when custom hosting is actually enabled | Leave Alone (keys); Needs Discussion (provider setup) | OAuth must be configured for a new origin. Do not rename keys or IDs to match the brand. |
| `app.js` | 28, 52, 447, 546, 1162, 1297–1312, 1493–1494, 2140, 5860–5865, 6564 onward | IndexedDB name `return-visits-app`; local/session storage keys such as `return_visits_*`; schema version and state keys | Existing saved data, onboarding, agreement, backup, update, and sync state | Usually no; affects existing users | Keep these identifiers unchanged | Leave Alone | Renaming keys/database identifiers can make existing data or settings appear lost and requires an explicit migration. |
| `dropbox.js` | 6–8, 23–30, 56, 80–121 | Dropbox storage/pending/result keys in browser storage | Existing Dropbox connection flow | No, except visible effects | Keep unchanged | Leave Alone | These are persisted compatibility-sensitive keys, not display names. |
| `app.js` | 447 | IndexedDB database opened as `return-visits-app`, version 1 | On-device database identity/schema | No, but directly affects user records | Keep database name and version unless implementing a deliberate migration | Leave Alone | Changing the database identifier can strand existing local data. |
| `index.html`, `help.html`, `privacy.html`, `app.js`, `README.md` | `index.html` 529; Help 804, 847; Privacy 343; `app.js` 6352; README 226 | `Return Visits` is the Dropbox app-folder name | Dropbox backup location and user instructions | Yes | Keep the literal folder name `Return Visits` | Leave Alone | Renaming it can disconnect the app from existing Dropbox backups. |
| `dropbox.js` | 34, 57, 155, 170, 194, 237 | Dropbox OAuth and API endpoints | Third-party Dropbox integration | Appears during sign-in; not product website | Keep these service endpoints | Leave Alone | These are provider API URLs, not branding or support URLs. |
| `app.js` | 421, 2187, 3049, 3107, 3349, 3353, 3613, 3740, 4068 | Google Maps, OpenStreetMap/Nominatim, map tiles, WhatsApp, and generic email-composer URLs | Navigation, geocoding/maps, and user-directed contact sharing | Some are visible as actions | Keep service URLs; do not replace them with the public brand domain | Leave Alone | They are functional third-party destinations, not public website references. |
| `index.html` | 18, 498, 1261 | unpkg Leaflet resources and Dropbox Basic signup URL | Map library and Dropbox signup | Some are reached through features | Keep service URLs | Leave Alone | These are service dependencies/flows, not public brand links. |
| HTML page metadata | `index.html` 4–14; `help.html`, `privacy.html`, `terms.html` 4–10 | Titles and descriptions; app theme/Apple metadata and manifest link. Help/Privacy/Terms titles already use Nice Return Visits. No canonical, Open Graph, Twitter card, or JSON-LD metadata found. | Browser/search/social previews and PWA shell | Yes, where supported | Keep titles branded; after domain setup, consider canonical and social metadata using the primary domain | Needs Discussion | A canonical URL should not point at a domain that has not been configured. |
| Repository/deployment files | Tracked-file inventory; no `CNAME`, sitemap, `robots.txt`, or Pages workflow found | No in-repo custom-domain, sitemap, robots, or Pages deployment config | Hosting and SEO/deployment | Publicly affects site behavior if added | Add/adjust only after confirming deployment ownership and domain configuration | Needs Discussion | The supplied decisions explicitly say not to assume domain or redirect configuration. |
| `docs/Nice-Return-Visits-Setup-User-Guide.pdf` and `docs/NRV-Privacy-Notice.pdf` | Covers and extracted text | Covers use Nice Return Visits; body uses full brand in product references. “Return Visits” also appears in ordinary prose and for the Dropbox folder. No standalone RV/RVs/NRV/NRVs or “My Return Visits” found. | Downloadable public user guide and privacy notice | Yes | Keep full brand; preserve Dropbox folder name | Leave Alone | Current PDFs already reflect the full product name. |
| Repository-wide abbreviation search | All tracked source/docs and extracted PDF text | No standalone `RV`, `RVs`, `NRV`, `NRVs`, “My Return Visits,” or “NR Visits” found | Existing brand/abbreviation usage | N/A | Use **NRV/NRVs** only for deliberate short-form uses | Leave Alone | Avoid introducing abbreviations as replacements for ordinary phrases such as “return visits.” |

### URL and contact inventory

| Location | Current URL/address | Purpose | Audit recommendation |
|---|---|---|---|
| `README.md` lines 298, 312, 317 | `https://grasfulls.github.io/return-visits-app/` and its `help.html` / `privacy.html` paths | Public app and documentation | Replace with primary-domain URLs only after the domain is deployed and verified. |
| `help.html` line 1061 | `https://grasfulls.github.io/return-visits-app/` | Link to app from Help | Update after domain setup; consider both-host user data guidance. |
| `help.html` lines 1019, 1028, 1036, 1044; `README.md` line 286 | `grasfulls.github.io` hostname | Clear/delete browser-site data instructions | Keep accurate for existing users; include the custom host after launch if both origins have been used. |
| `dropbox.js` lines 34, 57, 155, 170, 194, 237 | Dropbox API/OAuth URLs | Cloud backup authentication and API | Keep; these are service endpoints. |
| `app.js` lines 421, 2187, 3049, 3107, 3613, 3740, 4068 | Google Maps and OpenStreetMap/Nominatim/tile URLs | Directions, address lookup, and map rendering | Keep; these are feature providers. |
| `app.js` lines 3349, 3353 | WhatsApp URL and `mailto:` composer URL | User-selected contact sharing | Not a support contact. |
| `index.html` lines 18, 1261 | unpkg Leaflet CSS/JS URLs | Map dependency | Keep; not branding URLs. |
| `index.html` line 498 | Dropbox Basic signup URL | Optional Dropbox account setup | Keep; not the public app website. |
| Repository-wide email search | No public support email found | Support/contact | Consider adding `Reachout@nrvisits.org` after deciding where it should appear. |
| Supplied decision, not yet in repo | `https://nicereturnvisits.org`, `https://nrvisits.org`, `Reachout@nrvisits.org` | Intended future website, redirect, and contact | No configuration is assumed or evidenced in this repository. |

### Documentation suitable for eventual GitHub Pages publication

- `index.html` — PWA app shell, onboarding, and Settings links.
- `help.html` — full illustrated user guide and install instructions.
- `privacy.html` — Privacy & Data Notice and PDF link.
- `terms.html` — Terms of Use.
- `docs/Nice-Return-Visits-Setup-User-Guide.pdf` — downloadable setup/user guide.
- `docs/NRV-Privacy-Notice.pdf` — downloadable privacy notice.
- `README.md` — repository/developer and user-facing setup information; it
  contains hard-coded current GitHub Pages URLs.
- `manifest.webmanifest` and `service-worker.js` — PWA install metadata and
  offline cache; these are app configuration rather than standalone help pages.

The Help, Privacy, and Terms pages use relative links to one another and to the
app, so their internal navigation is already suitable for either host. Public
absolute links in Help and README need review during a domain transition.

## Proposed implementation plan

### A. Safe user-visible branding changes

1. Change `manifest.webmanifest` `short_name` from “Nice Return Visits” to
   **NRVs**; retain `name` as **Nice Return Visits**.
2. Keep the full name in regular page titles, headings, notices, and legal
   text. Use NRV/NRVs only where the short singular/plural form is intentional.
3. If desired, add `Reachout@nrvisits.org` to the Help page or another
   user-approved support location.
4. Do not rename the Dropbox folder, generic descriptive wording, icons, or
   internal identifiers merely for brand consistency.

### B. Website/help URL changes

1. Verify `nicereturnvisits.org` DNS, HTTPS, GitHub Pages custom-domain
   configuration, and actual production content.
2. Configure `nrvisits.org` to redirect to the primary domain when ready.
3. Replace public absolute app/help/privacy links in README and Help with
   primary-domain URLs once verified.
4. Preserve guidance for users whose data remains under
   `grasfulls.github.io`; changing host creates separate browser storage.
5. During any transition, explain export/restore and site-data removal for each
   host. Do not imply data is transferred by redirect.

### C. PWA/manifest/metadata changes

1. Set manifest `name` to Nice Return Visits and `short_name` to NRVs.
2. Assess PWA `id`, `scope`, and `start_url` against the real custom-domain
   deployment before changing them.
3. After domain setup, consider canonical URLs, Open Graph/Twitter cards, and
   structured data for public pages.
4. Add or configure CNAME, sitemap, robots rules, or a GitHub Pages workflow
   only if the chosen deployment process requires them.
5. Verify the Dropbox OAuth redirect URI is allowed for the new host before
   directing users there.

### D. Things that should deliberately remain unchanged

- IndexedDB database name/schema and all localStorage/sessionStorage keys.
- Dropbox folder name `Return Visits`, Dropbox connection keys, and provider
  integration identifiers.
- Internal variable/function/class names, routes, data fields, migration
  identifiers, filenames referenced by code, and app IDs unless a tested
  migration or functional requirement calls for a change.
- Google Maps, OpenStreetMap/Nominatim, Dropbox, unpkg, WhatsApp, and
  user-selected email-composer URLs.
- Generic location-pin icons; they contain no old name or abbreviation.
- Ordinary descriptive text such as “return visits,” which is not the product
  name.

### E. Items requiring the owner's decision before implementation

1. Should `Reachout@nrvisits.org` appear only in Help, or also in the Privacy
   Notice, Terms, README, or in-app Settings?
2. Is NRVs intended specifically as the installed PWA launcher label? The
   manifest is the direct control for that short name.
3. When will the primary domain be configured and verified? Should the old
   GitHub Pages host remain usable during a transition?
4. Should public documentation at the primary host link to the app root or
   specific user-help pages?
5. If adding SEO/social metadata, which title/description and preview image
   should public links use?

## Compatibility and migration safety notes

- Browser storage is origin-scoped. The same app under GitHub Pages and under
  `nicereturnvisits.org` will have separate local data until the user exports
  and restores a backup.
- A redirect from `nrvisits.org` to the primary domain does not merge or move
  local data.
- Dropbox OAuth uses an origin-derived redirect URI; the Dropbox developer
  configuration must allow each intended production origin.
- Keep the Dropbox folder label `Return Visits` so existing backups remain
  discoverable.
- Do not change database/localStorage identifiers or internal data fields as
  a cosmetic branding cleanup.
