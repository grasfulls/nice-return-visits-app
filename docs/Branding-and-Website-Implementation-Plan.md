# Nice Return Visits: Revised Branding and Website Implementation Plan

**Purpose:** Implementation handoff based on the owner's architecture decision
and Section G answers.
**Status:** Revised plan only. No implementation is authorized by this document.
**Related audit:** [Branding and Website Audit](./Branding-and-Website-Audit.md)

The owner's decisions in `VSCCP-Section-G-Decisions.docx` supersede open
questions or earlier suggestions in the related audit and prior plan version.

## Architecture decision

The existing Nice Return Visits PWA remains at:

`https://grasfulls.github.io/return-visits-app/`

The PWA is **not** moving to either custom domain. The custom domains serve a
separate purpose:

- `https://nicereturnvisits.org` is intended to be the canonical public website
  for help, documentation, and related public pages.
- `https://nrvisits.org` is intended to redirect to the primary public website
  in the future. Do not configure that redirect without explicit approval.
- Public support email: `Reachout@nrvisits.org`.

The PWA's origin, deployment, IndexedDB/storage origin, service-worker scope,
and operational URLs must remain unchanged during branding and public-site work.
Do not assume the domains, DNS, HTTPS, redirects, or custom Pages site are
already configured.

The PWA keeps its existing local Help, Privacy, and Terms pages. The public
site will host separate published counterparts. The built-in Help remains the
dependable PWA help system initially; do not immediately replace its Help
button with an external-site link.

## A. Safe branding changes in the existing PWA

1. **Set the PWA short name to NRVs.**
   - File: `manifest.webmanifest`
   - Keep `name` as `Nice Return Visits`.
   - Change only `short_name` from `Nice Return Visits` to `NRVs`.
   - Reason: This applies the owner's intended compact launcher name without
     changing the full product name.

2. **Keep the full brand for ordinary user-facing product references.**
   - Files: `index.html`, `app.js`, `help.html`, `privacy.html`, `terms.html`,
     and `README.md`
   - Continue using `Nice Return Visits` in page titles, headings, agreements,
     onboarding, dialogs, and legal text.
   - Use `NRV` or `NRVs` only when the singular/plural short form is intended;
     do not replace ordinary prose such as “return visits.”
   - Reason: The approved full brand remains clearer in longer-form copy.

3. **Do not change the generic location-pin icons for branding alone.**
   - Files: `icons/icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png`
   - The existing assets contain no old product name or abbreviation.
   - Reason: No branding inconsistency requiring an icon change was identified.

4. **Add the approved support contact in PWA Settings.**
   - File: `index.html`, in the existing Settings → Help section near the
     User Guide, Privacy Notice, and Terms links (currently around lines
     700–730).
   - Add a simple `Contact Support` link to `mailto:Reachout@nrvisits.org`.
   - Reason: This is an explicit placement decision. It does not change the
     PWA origin or persisted app data.

## B. Existing PWA links to public help

Do not change PWA links to the public site now. First publish and verify the
public site. Keep the existing local document links in `index.html`:

- Lines 51 and 56: agreement-screen Terms and Privacy links.
- Lines 104 and 193: illustrated install-help links.
- Lines 713, 716, and 721: Settings links to Help, Privacy, and Terms.

Initially, these local pages remain authoritative for the working PWA and
available offline. After the public versions are operating, review separately
whether any particular in-app help link should point outward. If an external
Terms or Privacy link is later approved, open it in a new tab; do not replace
the running PWA page. Keep all links to the PWA itself at its existing GitHub
Pages URL.

### Navigation and offline considerations

- Keep local Help, Privacy, and Terms pages in the PWA and in the service-worker
  app shell for dependable offline access.
- Maintain the public pages as published counterparts of the authoritative
  PWA documents. Coordinate updates so legal/help content does not drift.
- If an in-app link to public Terms or Privacy is approved later, open it in a
  new tab and ensure the external page offers a clear link back to the PWA.

**Relevant files:** `index.html`, `help.html`, `privacy.html`, `terms.html`,
`service-worker.js`.

## C. Help and documentation content for nicereturnvisits.org

The following existing content is a candidate for publication on the public
site:

- `help.html` — illustrated installation guidance and full user guide.
- `privacy.html` — Privacy & Data Notice.
- `terms.html` — Terms of Use.
- `docs/NRV-Setup-User-Guide.pdf` — downloadable setup/user
  guide.
- `docs/NRV-Privacy-Notice.pdf` — downloadable privacy notice.
- `README.md` — contains user-facing setup and hosting instructions mixed with
  repository/developer information; review before publishing it as public help.

Initial public-site scope:

- Home
- Help
- Getting Started
- FAQ
- Privacy
- Terms
- Contact/Support using `Reachout@nrvisits.org`
- Relevant existing PDF downloads

Treat public Help, Privacy, and Terms as published counterparts of the
authoritative local PWA pages. Keep Terms and Privacy synchronized with the
versions shown in the PWA agreement flow. If either notice changes, review the
app's agreement-version behavior and update it intentionally where required.

## D. Work required to create and publish the nicereturnvisits.org site

1. **Create a separate site repository.**
   - Suggested repository name: `nice-return-visits-site`.
   - Do not repurpose `grasfulls/return-visits-app` for the public site.
   - Preserve the existing PWA repository's Pages configuration, project URL,
     and working deployment.

2. **Prepare the public content.**
   - Create the initial pages listed in Section C.
   - Use `Reachout@nrvisits.org` on Contact/Support and Help, in the Privacy
     Notice, in Terms where an appropriate contact section exists, and in the
     public README.
   - Include the relevant PDFs and links between pages.
   - Link to the PWA at its existing GitHub Pages origin.

3. **Review the initial site before configuring its domain.**
   - Create and review the separate GitHub Pages site first.
   - Review all content, navigation, contact links, and PDF downloads before
     connecting the custom domain.

4. **Configure and verify hosting after review.**
   - Configure GitHub Pages for the chosen repository.
   - Configure the nicereturnvisits.org domain, DNS, and HTTPS.
   - Verify every public page, PDF download, navigation path, and return-to-app
     link.

5. **Only after verification, consider PWA documentation-link changes.**
   - Do not change any PWA documentation links until the public site and each
     intended destination page are published and verified.
   - Keep the local PWA pages. Any later external Terms/Privacy links open in a
     new tab. Do not immediately replace the built-in Help button.
   - Leave PWA links and origin-specific instructions pointed at the existing
     GitHub Pages PWA.

6. **Add metadata only after the canonical site is live.**
   - Consider canonical URLs, Open Graph/Twitter cards, structured data,
     sitemap, or robots directives for the public site.
   - Do not publish canonical metadata pointing to a domain that has not been
     verified.

**Repository observation:** The current repository does not contain a tracked
`CNAME`, sitemap, `robots.txt`, custom-domain configuration, or GitHub Pages
workflow establishing the new public site.

## E. Work eventually required for nrvisits.org

The eventual behavior is decided: redirect `nrvisits.org` to
`nicereturnvisits.org`. Do not configure this yet without the owner's explicit
implementation approval.

When approved:

1. Configure `nrvisits.org` to redirect to `nicereturnvisits.org`, preserving
   matching paths and query strings where the chosen redirect mechanism
   supports this cleanly (for example, `/help/` should resolve to `/help/`).
2. Verify HTTPS for both domains and confirm that the redirect does not host
   or change the PWA.
3. Test representative links, including documentation paths and PDF URLs.

## F. Existing internal names, URLs, and settings to preserve

Do not rename the following for cosmetic consistency:

- IndexedDB database names, schema versions, and stored-data property names.
- `localStorage` and `sessionStorage` keys.
- Dropbox persistence keys, app folder, and integration identifiers.
- Internal variable, function, or class names.
- Package/app identifiers, migration identifiers, and routes.
- Filenames referenced by code or by existing deployment.
- Service-worker/cache identifiers and scope logic.
- Existing PWA `id`, `start_url`, and `scope` in `manifest.webmanifest`.
- PWA origin and operational links based on
  `https://grasfulls.github.io/return-visits-app/`.

“Return Visits” is the literal Dropbox folder name and must stay unchanged so
the PWA can continue to find existing backups.

### Why origin preservation matters

Browser storage and service workers are origin-scoped. Hosting the PWA at a
different origin would create a separate local data store and service worker;
it would not transfer or merge existing contacts. A redirect also does not
migrate local data. Dropbox OAuth uses an origin-derived redirect URI, so any
future origin change would require separate provider-side configuration.

During the documentation-site work:

- Keep the PWA at the existing GitHub Pages URL.
- Keep site-data removal guidance for `grasfulls.github.io`.
- Do not direct the PWA itself to either custom domain.
- Do not change OAuth redirect origins or provider settings as part of the
  public documentation site work.

## G. Decisions received and remaining approval checkpoints

The owner has answered the earlier Section G questions:

- Put `Reachout@nrvisits.org` on the public Contact/Support and Help pages, the
  Privacy Notice, Terms where an appropriate contact section exists, README,
  and as a simple Contact Support link in PWA Settings.
- Keep local PWA Help, Privacy, and Terms pages; also publish counterparts on
  nicereturnvisits.org. Keep the local pages dependable and available offline.
- If the PWA later links to public Terms or Privacy, open those pages in a new
  tab. Do not immediately replace the built-in Help button.
- Create a separate public-site repository, suggested name
  `nice-return-visits-site`.
- Keep initial public-site scope small: Home, Help, Getting Started, FAQ,
  Privacy, Terms, Contact/Support, and relevant PDFs.
- Create and review the site before configuring GitHub Pages, the primary
  domain, DNS, and HTTPS. Verify the site before changing any PWA links.
- Eventually redirect `nrvisits.org` to the canonical domain and preserve
  paths/query strings where supported.
- Do not implement yet; wait for explicit approval.

### Remaining approval checkpoints

1. Review the separate public-site repository and content before enabling
   GitHub Pages/custom-domain configuration.
2. Verify nicereturnvisits.org pages, HTTPS, and downloads before any PWA link
   points to them.
3. Obtain explicit approval before configuring the `nrvisits.org` redirect.
4. Decide separately, after both sites operate, whether any particular PWA
   documentation link should point to the public site.

## Approval boundary

This plan does not authorize implementation. Do not change PWA links, app
files, PWA deployment, domains, DNS, redirects, or external provider
configuration until the owner explicitly approves the relevant implementation
step.
