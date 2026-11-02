#!/usr/bin/env python3
"""Generate browser, Apple, Android/PWA and Windows icons from assets/logo-app.webp."""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "logo-app.webp"
BG = (8, 11, 19, 255)


def open_logo():
    if not SOURCE.exists():
        raise FileNotFoundError(f"Source logo not found: {SOURCE}")
    logo = Image.open(SOURCE).convert("RGBA")
    # Trim only transparent margins; retain all visible logo artwork.
    alpha = logo.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        logo = logo.crop(bbox)
    if logo.width == 0 or logo.height == 0:
        raise ValueError("The source logo is empty or fully transparent.")
    return logo


def make_icon(logo, size, scale=0.78):
    canvas = Image.new("RGBA", (size, size), BG)
    max_side = max(1, int(size * scale))
    fitted = ImageOps.contain(logo, (max_side, max_side), method=Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    return canvas.convert("RGB")


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    logo = open_logo()

    make_icon(logo, 32, 0.84).save(ASSETS / "favicon-32.png", optimize=True)
    make_icon(logo, 180, 0.78).save(ASSETS / "apple-touch-icon.png", optimize=True)
    make_icon(logo, 192, 0.78).save(ASSETS / "icon-192.png", optimize=True)
    make_icon(logo, 512, 0.78).save(ASSETS / "icon-512.png", optimize=True)
    make_icon(logo, 512, 0.62).save(ASSETS / "icon-512-maskable.png", optimize=True)
    make_icon(logo, 150, 0.78).save(ASSETS / "mstile-150x150.png", optimize=True)

    ico = make_icon(logo, 48, 0.82)
    ico.save(ASSETS / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("Generated favicon and platform icons from assets/logo-app.webp")


if __name__ == "__main__":
    main()
