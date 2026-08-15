"""Export Enginuity and SparkAI ad images as PNG and JPEG."""

from __future__ import annotations

from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ADS_DIR = ROOT / "site" / "assets" / "ads"
RENDER_HTML = ADS_DIR / "ad-render.html"

EXPORTS = [
    ("enginuity-landscape", "enginuity-ad-1200x630"),
    ("enginuity-square", "enginuity-ad-1080x1080"),
    ("sparkai-landscape", "spark-ai-ad-1200x630"),
    ("sparkai-square", "spark-ai-ad-1080x1080"),
]


def png_to_jpeg(png_path: Path, jpeg_path: Path, quality: int = 92) -> None:
    with Image.open(png_path) as img:
        rgb = img.convert("RGB")
        rgb.save(jpeg_path, "JPEG", quality=quality, optimize=True)


def main() -> None:
    if not RENDER_HTML.exists():
        raise FileNotFoundError(f"Missing ad template: {RENDER_HTML}")

    ADS_DIR.mkdir(parents=True, exist_ok=True)
    file_url = RENDER_HTML.resolve().as_uri()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(device_scale_factor=2)
        page.goto(file_url, wait_until="networkidle")
        page.wait_for_timeout(800)

        for element_id, basename in EXPORTS:
            locator = page.locator(f"#{element_id}")
            png_path = ADS_DIR / f"{basename}.png"
            jpeg_path = ADS_DIR / f"{basename}.jpg"
            locator.screenshot(path=str(png_path), type="png")
            png_to_jpeg(png_path, jpeg_path)
            print(f"Wrote {png_path.name} and {jpeg_path.name}")

        browser.close()


if __name__ == "__main__":
    main()
