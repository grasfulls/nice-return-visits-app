"""Generate the downloadable guides from the app's bilingual Help pages."""

import argparse
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_URL = "https://grasfulls.github.io/nice-return-visits-app/"
GUIDES = (
    ("help.html", "NRV-Setup-User-Guide.pdf"),
    ("help-es.html", "NRV-Setup-User-Guide-es.pdf"),
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", required=True, help="Path to Chrome or Edge")
    args = parser.parse_args()
    browser = Path(args.browser).resolve(strict=True)

    with tempfile.TemporaryDirectory(prefix="nrv-guide-") as directory:
        temp = Path(directory)
        for source, output in GUIDES:
            html = (ROOT / source).read_text(encoding="utf-8")
            html = re.sub(
                r'href="\./([^"]*)"',
                lambda match: f'href="{APP_URL}{match.group(1)}"',
                html,
            )
            html = re.sub(
                r'src="\./([^"]+)"',
                lambda match: f'src="{(ROOT / match.group(1)).resolve(strict=True).as_uri()}"',
                html,
            )
            page = temp / source
            page.write_text(html, encoding="utf-8")
            pdf = temp / output
            subprocess.run(
                [
                    str(browser), "--headless", "--disable-gpu",
                    "--no-pdf-header-footer",
                    f"--user-data-dir={temp / 'profile'}",
                    f"--print-to-pdf={pdf}",
                    page.as_uri(),
                ],
                check=True,
                timeout=120,
            )
            if not pdf.is_file() or pdf.read_bytes()[:5] != b"%PDF-":
                raise RuntimeError(f"Browser did not produce {output}")
            (ROOT / "docs" / output).write_bytes(pdf.read_bytes())
            print(f"Generated {output}")


if __name__ == "__main__":
    main()
