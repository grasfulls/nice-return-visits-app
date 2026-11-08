# Documentation index

Supporting documents for the Nice Return Visits app. User-facing documentation
is in [../NRV-CURRENT-USER-DOCUMENTATION.md](../NRV-CURRENT-USER-DOCUMENTATION.md)
and the [README](../README.md).

| File | What it is |
|---|---|
| `Branding-and-Website-Audit.md` | Read-only audit of branding, naming, and website/domain references |
| `Branding-and-Website-Implementation-Plan.md` | Implementation plan based on the audit |
| `install-browser-en.png`, `install-browser-es.png` | Current installation-guide browser selection examples |

Published PDF copies are hosted only in the
[website repository](https://github.com/grasfulls/nice-return-visits-site/tree/main/assets/docs).
The app links directly to the authoritative copies:
[Privacy Notice](https://nicereturnvisits.org/assets/docs/NRV-Privacy-Notice.pdf),
[English Setup and User Guide](https://nicereturnvisits.org/assets/docs/NRV-Setup-User-Guide.pdf),
and [Spanish Setup and User Guide](https://nicereturnvisits.org/assets/docs/NRV-Setup-User-Guide-es.pdf).

The guide PDFs are generated from `help.html` and `help-es.html`. After updating and
reviewing those pages and screenshots, run
`python scripts/generate-user-guides.py --browser "<Chrome or Edge executable>"`
and publish the approved PDFs in the website repository's `assets/docs` directory.
Keep the installation screenshots in both repositories because each Help page uses
its local copy.

The public website is maintained in the
[nice-return-visits-site](https://github.com/grasfulls/nice-return-visits-site)
repository.
