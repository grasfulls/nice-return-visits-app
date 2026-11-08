# Nice Return Visits Localization Policy

This document defines the localization strategy and requirements for Nice Return Visits across the website and app repositories.

---

## Core Branding Rules

The following identifiers are **global brand elements** and must **remain unchanged in every language and writing system**:

- **NRV** — the abbreviation for the app and for a single Nice Return Visit
- **Nice Return Visits** — the full branded name of the app
- **RV** — the branded abbreviation for "Return Visit" when used as a noun in context (e.g., "Never forget an RV.")

### Tagline Translation

Translate the surrounding tagline naturally, but retain **RV** exactly as **RV**. The current approved examples are:

- **English:** NRV - Nice Return Visits / *Never forget an RV.*
- **Spanish:** NRV - Nice Return Visits / *Nunca olvides un RV.*

Future languages, including languages using non-Latin scripts, must follow the same branding rule: keep the brand name and RV unchanged, translate the tagline naturally.

---

## Website Language Architecture

### Language-Specific Routes

The website uses a single-language-per-path architecture:

- **English (default):** Root level (e.g., `index.html`, `help.html`, `getting-started.html`)
- **Spanish:** `es/` folder (e.g., `es/index.html`, `es/help.html`, `es/getting-started.html`)

Each language version maintains its own HTML pages with identical structure and shared CSS/JS.

**Pages included in both languages:**
- `index.html` — Home page
- `getting-started.html` — Installation and setup guidance
- `help.html` — In-app documentation and support
- `faq.html` — Frequently asked questions
- `contact.html` — Contact and support
- `privacy.html` — Privacy notice
- `terms.html` — Terms of use

### Language Selection

The website provides a language menu in the header:

- **Visible as:** "Language" dropdown in the header (top right)
- **Mechanics:** HTML `<details>` element with clickable language links
- **No persistence:** The language menu navigates to a different URL path; each path maintains its language independently
- **Script:** `assets/js/language-menu.js` — Handles dropdown open/close behavior only

Users select a language by clicking a link; there is no automatic language detection.

---

## Website-to-App Language Handoff

When a user clicks the "Open NRV" button on the website, English and Spanish pages link to `https://nicereturnvisits.org/app/?lang=en` and `https://nicereturnvisits.org/app/?lang=es`, respectively.

**Current behavior:** The website passes the language parameter to the app. When the app launches, it:
1. First checks for a valid `?lang=<code>` URL parameter (if present)
2. Then checks for a previously stored language preference in browser `localStorage`
3. Falls back to English if neither is available

If a language parameter is provided in the URL, the app will use that language and save it to local storage for subsequent visits.

The app's paths are relative to its install location so the same app files can run from the GitHub Pages project path or `/app/` on the public website.

---

## Language Persistence in the App

The app uses a runtime i18n system (`i18n.js`) that:

1. **On first launch:** Checks for a `?lang=<code>` URL parameter; if present and valid, uses that language
2. **On return launches:** Restores the user's previously selected language from browser `localStorage`
3. **Fallback:** Defaults to English if no language preference is found or the stored preference is unavailable
4. **Language is persisted** in the browser's local storage on the device and survives installation as a Home Screen app

The app does not provide an in-app language selector. To change the app's language after initial setup, users must:
- Reinstall the app from the desired language's website page (if the website is updated to pass `?lang=` parameters in the future)
- Clear browser data and revisit the app URL with an explicit `?lang=<code>` parameter

### Home Screen Apps (Installed PWA)

When NRV is installed as a Home Screen app (PWA):

- Each installed copy maintains its own language preference in its own browser storage
- Installing NRV in Browser A with Spanish selected does NOT affect Browser B or other devices
- The Home Screen copy and the browser copy are independent and may have different languages
- Changing language requires clearing data and reinstalling, or accessing the app with an explicit `?lang=` parameter

---

## Language Independence from Contact Location

**Critical rule:** The app's interface language and the contact database country/location are **completely independent**.

- A user with a Spanish interface can manage contacts in any country
- A user with an English interface can manage Spanish contacts and addresses
- Contact address country, contact phone number format, and interface language are three separate concerns
- Do not infer or assume a user's contact location based on their interface language
- Do not restrict address fields based on the interface language

---

## User-Facing Content (Translatable)

The following content is user-facing and translatable:

### Website

- Page titles (`<title>`, `<h1>`, etc.)
- Headings and body copy (marketing, help, legal)
- Navigation labels ("Home", "Getting Started", "Help", "FAQ", "Contact")
- Button text ("Open NRV", "Getting Started")
- Form labels and help text
- Footer text

### App

- All UI text: labels, buttons, menu items, prompts, error messages, help text
- Page titles and section headings
- Form fields and validation messages
- Dialog text and confirmations
- Settings labels and descriptions
- Localized using `data-i18n="key"` attributes and the `locales/<code>.json` catalog files
- Translations managed via the `i18n.js` runtime and `NRVI18n.t()` function

---

## Non-Translatable Content

The following must **never** be translated:

### Brand Identifiers

- **NRV** — the app name and abbreviation
- **Nice Return Visits** — the full brand name
- **RV** — when used as the branded abbreviation for Return Visit

### Internal/Canonical Values

- Database field names and schema identifiers (e.g., `firstName`, `lastName`, `contactId`)
- Code identifiers and variable names
- URLs and file paths
- Email addresses and domain names
- Configuration keys and enum values
- API parameter names and response keys

### Data Values

- Contact names and personal information (user data)
- User-entered notes and addresses
- Email addresses and phone numbers
- Custom City, Region, and Area names created by the user
- Date and time values (use locale-aware formatting, not translation)

### Legal/Copyright

- Copyright notices and license text (English version is canonical; translations may be provided separately if legally appropriate)

---

## International Address Requirements

The app's address model is country-aware and includes country-specific address field labels and formatting:

### Supported Countries

Current supported countries (expandable):
- **Canada**
- **Mexico**
- **Peru**
- **United States** (default)

Each contact has an optional `country` field; if not specified, the contact uses the user's default country setting (configured in Settings).

### Country-Specific Address Field Labels

The app dynamically updates address field labels based on the selected country:

- **Peru:** Uses administrative terms
  - State → Department
  - City → Locality
  - Region → Province
  - Area → District
  
- **Other countries (Canada, Mexico, United States):** Use standard terms
  - State (province in Canada)
  - City
  - Region
  - Area

### Address Fields (Language and Country Independent)

All contacts support:
- Street address (free-form text, any language)
- State/Department/Province (country-specific term, user-entered)
- City/Locality (user-entered, displayed in custom City list)
- Region (user-entered, displayed in custom Region list)
- Area (user-entered, displayed in custom Area list)
- Postal code (optional)
- Country (dropdown, defaults to user's setting)
- Map coordinates (latitude/longitude, user can place or adjust pins)

### Key Architectural Principle

**Contact address country, interface language, and user settings are completely independent systems.**

- A user with a Spanish interface can manage contacts in any supported country
- A user with an English interface can manage Spanish/Mexico/Peru addresses
- Changing the interface language does not affect existing contact data
- Do not infer or assume a user's contact location based on their interface language
- Do not restrict address fields based on interface language

### Adding Country Support

When adding a new country to NRV:

**Adding a new language must not require modifying the address data model.** Interface language and address country are independent systems. New country support may require country-specific field labels, ordering, formatting, validation, or presentation rules, but these should use the common country-neutral address model wherever possible.

A flexible international address model should be reviewed and designed before additional country-specific address schemes are added. The goal is to support multiple countries without requiring schema changes for each new language or region added.

---

## Requirements for Adding a New Language

To add a language to either the website or the app, follow these steps:

### For the Website

1. **Create translated HTML pages** in a new language folder (e.g., `fr/` for French):
   - Copy all HTML files from the root to the new folder
   - Translate all user-facing content in each page
   - Keep the brand names unchanged: **NRV**, **Nice Return Visits**, **RV**
   - Update navigation links to point to the same-language versions
   - Keep the tagline translation natural

2. **Update the language menu** in all existing pages (English and other languages):
   - Add a new `<li>` entry for the new language
   - Ensure the link points to the correct path in the new language folder
   - Test the language menu in all pages and all languages

3. **Verify responsive design** at phone (375px), tablet (768px), and desktop (1200px) widths

4. **Update `README.md`** with the new language and folder structure

### For the App

1. **Create a locale file** `locales/<code>.json`:
   - Copy `locales/en.json` as a template
   - Translate all values (keys remain unchanged)
   - Keep brand identifiers and internal values unchanged
   - Use proper plural forms if required by the language

2. **Register the language** in `i18n.js`:
   - Add an entry to the `LANGUAGES` array
   - Specify the language code, display name, and file path
   - Example:
     ```javascript
     { code: "fr", name: "Français", file: "locales/fr.json" }
     ```

3. **Run automated tests**:
   - `node tests/i18n-check.js` — Validates the locale file structure and completeness

4. **Update the website app links** to use the new language parameter:
   - Add links like: `https://nicereturnvisits.org/app/?lang=fr`

5. **Test the language in the app:**
   - Launch the app and verify all text displays correctly in the new language
   - Test across all app pages and features
   - Verify date/time formatting (use locale-aware `Intl.*` APIs, not translation)
   - Test on multiple browsers and devices
   - Test at common viewport widths (phone, tablet, desktop)

6. **Test language persistence:**
   - Launch the app in the new language (either via `?lang=<code>` parameter or by manually changing the browser's locale)
   - Close and reopen the app; verify the language is remembered
   - Install as a Home Screen app; verify language preference persists

7. **Update documentation:**
   - Add the new language to the app's `README.md` and the website's `README.md`
   - Note any language-specific limitations or considerations

---

## Documentation and PDF Localization

### Website Documentation

- The **Getting Started**, **Help**, and **FAQ** pages are website content and should be translated as part of adding a new language
- These pages are the public documentation; they are separate from the in-app help

### In-App Help

- The app's in-app `help.html` is localized via the same i18n system:
  - Headings and sections use `data-i18n` attributes
  - Long-form text content (like help instructions) uses plain HTML with manual translation
  - The `help.html` file is version-controlled in the app repository

### PDF Guides and Downloads

- Downloadable user guides (e.g., `NRV-Setup-User-Guide.pdf`) may be provided in multiple languages
- Each language version is stored separately and linked from the appropriate website pages
- PDF localization is outside the scope of this document; coordinate with documentation maintainers

---

## Testing Required Before Release

Before releasing a new language, verify:

### Website

- [ ] All pages exist in the new language folder
- [ ] All user-facing content is translated (headings, buttons, body copy)
- [ ] Brand names remain unchanged (NRV, Nice Return Visits, RV)
- [ ] Navigation links point to the correct language
- [ ] Language menu appears in all pages and is functional
- [ ] Responsive design is tested at phone, tablet, and desktop widths
- [ ] Links to the app are correct
- [ ] All external links work
- [ ] Images and graphics display correctly
- [ ] Footer and legal pages are complete

### App

- [ ] Locale file is properly formatted and complete
- [ ] All strings in the UI are translated
- [ ] Brand identifiers are unchanged
- [ ] `node tests/i18n-check.js` passes
- [ ] All app pages display correctly in the new language
- [ ] Date and time formatting is correct for the language
- [ ] Number formatting (phone, address) follows appropriate conventions
- [ ] Keyboard and input methods work correctly
- [ ] Right-to-left (RTL) languages display correctly (if applicable)
- [ ] Tested on phone, tablet, and desktop browsers
- [ ] Tested after installation as a Home Screen app
- [ ] Form validation messages display correctly in the new language
- [ ] Language preference is remembered between app launches (localStorage persists)
- [ ] Country-specific address labels display correctly for all supported countries

### Cross-Language Verification

- [ ] Website language menu includes the new language
- [ ] Website-to-app handoff works (if applicable)
- [ ] Backup/restore works with contacts created in different languages
- [ ] User can switch languages without losing data (website and app independently)

---

## Repository Coordination

### Website Repository (`nice-return-visits-site`)

- **Language routes:** English (root), Spanish (`es/`)
- **Shared assets:** `assets/css/styles.css`, `assets/js/language-menu.js`, images
- **Language-specific pages:** HTML files in root and `es/` folder
- **LOCALIZATION.md:** This file (policy document, identical in both repositories)

### App Repository (`nice-return-visits-app`)

- **Language system:** i18n.js runtime with localStorage persistence
- **Locale files:** `locales/<code>.json`
- **Supported languages:** Registered in `i18n.js` LANGUAGES array
- **In-app selector:** Settings → Language
- **Tests:** `node tests/i18n-check.js` validates locale completeness
- **LOCALIZATION.md:** Copy of the policy (with optional App Implementation Notes section if needed)

### Policy Synchronization

The **core localization policy** in `LOCALIZATION.md` must remain identical in both repositories. This document defines:

- Core branding rules
- Language architecture (website paths, app i18n system)
- What is translatable vs. non-translatable
- Requirements for adding a new language
- Testing requirements

Repository-specific technical details (e.g., "Use `i18n.js`" for the app, "Use HTML files in `es/` folder" for the website) are included in the relevant sections and are not duplicated.

If a repository-specific technical clarification is needed, add it in a clearly labeled **App Implementation Notes** or **Website Implementation Notes** section rather than altering the shared policy.

---

## Maintenance Workflow

When changes are made to user-facing content:

1. **Update the English version** first (website or app)
2. **Update all other language versions** immediately after
3. **Test each language** to ensure translations are accurate and display correctly
4. **Commit and push** all language versions together
5. **Document the change** if it affects the localization policy or adds a new language

When the language policy itself changes:

1. **Update LOCALIZATION.md** in the website repository
2. **Copy the updated file** to the app repository
3. **Ensure the core policy remains identical** in both repositories
4. **Note any repository-specific implementation details** in separate sections, not in the core policy
5. **Commit and push** the updates to both repositories in separate, coordinated commits

---

## References

- **Website repository:** https://github.com/grasfulls/nice-return-visits-site
- **App repository:** https://github.com/grasfulls/nice-return-visits-app
- **App i18n module:** `i18n.js` (app repository)
- **Website language menu:** `assets/js/language-menu.js` (website repository)
- **Locale files:** `locales/` folder (app repository)
- **Tests:** `node tests/i18n-check.js` (app repository)

---

## Document History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-11-06 | 1.0 | Copilot | Initial policy document. Core branding rules, website architecture (English root + es/ folder), app i18n system, language independence from contact location, requirements for adding languages, testing checklist. |
