# Documentation index

Supporting documents for the Nice Return Visits app. User-facing documentation
is in [../NRV-CURRENT-USER-DOCUMENTATION.md](../NRV-CURRENT-USER-DOCUMENTATION.md)
and the [README](../README.md).

| File | What it is |
|---|---|
| `Branding-and-Website-Audit.md` | Read-only audit of branding, naming, and website/domain references |
| `Branding-and-Website-Implementation-Plan.md` | Implementation plan based on the audit |
| `NRV-Privacy-Notice.pdf` | Downloadable copy of the Privacy & Data Notice |
| `NRV-Setup-User-Guide.pdf` | Downloadable English Help and setup reference |
| `NRV-Setup-User-Guide-es.pdf` | Downloadable Spanish Help and setup reference |
| `install-browser-en.png`, `install-browser-es.png` | Current installation-guide browser selection examples |

The PDFs are generated from `help.html` and `help-es.html`. After updating and
reviewing those pages and screenshots, run
`python scripts/generate-user-guides.py --browser "<Chrome or Edge executable>"`
and copy both PDFs and screenshots to the website's `assets/docs` directory.
Check the generated PDFs, links, screenshots, and page layout before publishing.

The public website is maintained in the
[nice-return-visits-site](https://github.com/grasfulls/nice-return-visits-site)
repository.
