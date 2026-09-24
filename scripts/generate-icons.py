#!/usr/bin/env python3
"""
Generate Aerial Supersonic Delta brand icons.
Generates:
  - High-res app icons for macOS Dock / Windows (512x512, 128x128, 32x32)
  - Native transparent macOS menu bar template icons (32x32, 64x64)
"""
import os
import math
from PIL import Image, ImageDraw, ImageFilter

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def create_tray_icon(size=32):
    """
    Creates a native macOS template tray icon:
    100% transparent background, crisp white/alpha vector delta stencil.
    macOS automatically tints template icons according to menu bar appearance.
    """
    scale = 8
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = canvas_size / 2
    # Scaled coordinates
    pad_y = canvas_size * 0.16
    h = canvas_size * 0.68
    w = canvas_size * 0.72

    tip = (cx, pad_y)
    left_wing = (cx - w / 2, pad_y + h)
    left_notch = (cx - w * 0.22, pad_y + h * 0.82)
    center_notch = (cx, pad_y + h * 0.52)
    right_notch = (cx + w * 0.22, pad_y + h * 0.82)
    right_wing = (cx + w / 2, pad_y + h)

    # Draw supersonic delta polygon
    delta_poly = [
        tip,
        left_wing,
        left_notch,
        center_notch,
        right_notch,
        right_wing,
    ]
    draw.polygon(delta_poly, fill=(255, 255, 255, 255))

    # Crossbar / inner A-cutout to make it an unmistakable "A"
    bar_y = pad_y + h * 0.58
    bar_h = canvas_size * 0.08
    bar_w = canvas_size * 0.38
    cutout = [
        (cx - bar_w / 2, bar_y + bar_h),
        (cx, bar_y - bar_h * 0.8),
        (cx + bar_w / 2, bar_y + bar_h),
        (cx, bar_y + bar_h * 0.4),
    ]
    draw.polygon(cutout, fill=(0, 0, 0, 0))

    # Floating kinetic core dot at the apex
    dot_r = canvas_size * 0.035
    draw.ellipse(
        [cx - dot_r, pad_y - dot_r * 0.5, cx + dot_r, pad_y + dot_r * 1.5],
        fill=(255, 255, 255, 255),
    )

    # Downsample with high-quality anti-aliasing
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

def create_app_icon(size=512):
    """
    Creates the full Aerial Supersonic Delta app icon:
    Obsidian squircle base, vibrant Araskova flame faceted wings, glowing horizon.
    """
    scale = 2
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded squircle base
    r = canvas_size * 0.22
    margin = canvas_size * 0.04
    rect = [margin, margin, canvas_size - margin, canvas_size - margin]
    
    # Outer subtle glow
    glow_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_draw.rounded_rectangle(rect, radius=r, fill=(231, 63, 7, 50))
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(canvas_size * 0.04))
    img.paste(glow_img, (0, 0), glow_img)

    # Obsidian background
    draw.rounded_rectangle(rect, radius=r, fill=(14, 14, 15, 255), outline=(42, 42, 44, 255), width=int(canvas_size * 0.008))

    cx = canvas_size / 2
    pad_y = canvas_size * 0.22
    h = canvas_size * 0.56
    w = canvas_size * 0.62

    tip = (cx, pad_y)
    left_wing = (cx - w / 2, pad_y + h)
    left_notch = (cx - w * 0.22, pad_y + h * 0.82)
    center_notch = (cx, pad_y + h * 0.52)
    right_notch = (cx + w * 0.22, pad_y + h * 0.82)
    right_wing = (cx + w / 2, pad_y + h)

    # Left faceted wing (Deep crimson to flame)
    left_wing_poly = [tip, left_wing, left_notch, center_notch]
    draw.polygon(left_wing_poly, fill=(210, 48, 6, 255))

    # Right faceted wing (Bright flame to kinetic ember)
    right_wing_poly = [tip, center_notch, right_notch, right_wing]
    draw.polygon(right_wing_poly, fill=(255, 95, 34, 255))

    # Center supersonic spine / flight path
    spine_poly = [
        tip,
        (cx - canvas_size * 0.03, pad_y + h * 0.48),
        center_notch,
        (cx + canvas_size * 0.03, pad_y + h * 0.48),
    ]
    draw.polygon(spine_poly, fill=(231, 63, 7, 255))

    # Inner supersonic A-crossbar (Glowing titanium & ember)
    bar_y = pad_y + h * 0.60
    bar_h = canvas_size * 0.075
    bar_w = canvas_size * 0.32
    crossbar_poly = [
        (cx - bar_w / 2, bar_y + bar_h),
        (cx, bar_y - bar_h * 0.6),
        (cx + bar_w / 2, bar_y + bar_h),
        (cx, bar_y + bar_h * 0.4),
    ]
    draw.polygon(crossbar_poly, fill=(14, 14, 15, 255))

    # Central glowing horizon line
    draw.line(
        [(cx - bar_w * 0.45, bar_y + bar_h * 0.1), (cx + bar_w * 0.45, bar_y + bar_h * 0.1)],
        fill=(243, 243, 242, 230),
        width=int(canvas_size * 0.012),
    )

    # Apex kinetic diamond
    diamond_h = canvas_size * 0.03
    diamond = [
        (cx, pad_y - diamond_h),
        (cx + diamond_h * 0.8, pad_y),
        (cx, pad_y + diamond_h),
        (cx - diamond_h * 0.8, pad_y),
    ]
    draw.polygon(diamond, fill=(255, 255, 255, 255))

    # Corner tactical brackets
    bracket_len = canvas_size * 0.06
    bracket_inset = margin + canvas_size * 0.05
    bracket_color = (231, 63, 7, 180)
    bw = int(canvas_size * 0.006)
    # Top-left
    draw.line([(bracket_inset, bracket_inset), (bracket_inset + bracket_len, bracket_inset)], fill=bracket_color, width=bw)
    draw.line([(bracket_inset, bracket_inset), (bracket_inset, bracket_inset + bracket_len)], fill=bracket_color, width=bw)
    # Bottom-right
    br_x = canvas_size - bracket_inset
    br_y = canvas_size - bracket_inset
    draw.line([(br_x, br_y), (br_x - bracket_len, br_y)], fill=bracket_color, width=bw)
    draw.line([(br_x, br_y), (br_x, br_y - bracket_len)], fill=bracket_color, width=bw)

    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

def main():
    print("Generating Aerial Supersonic Delta icons...")
    # Tray Icons (macOS template: crisp transparent PNGs)
    tray_32 = create_tray_icon(32)
    tray_32.save(os.path.join(OUTPUT_DIR, "tray-icon.png"), "PNG")
    with open(os.path.join(OUTPUT_DIR, "tray-icon.rgba"), "wb") as f:
        f.write(tray_32.tobytes())
    tray_64 = create_tray_icon(64)
    tray_64.save(os.path.join(OUTPUT_DIR, "tray-icon@2x.png"), "PNG")
    print("  ✓ Saved tray-icon.png (32x32), tray-icon.rgba & tray-icon@2x.png (64x64)")

    # App Icons
    app_512 = create_app_icon(512)
    app_512.save(os.path.join(OUTPUT_DIR, "icon.png"), "PNG")
    app_512.save(os.path.join(OUTPUT_DIR, "app-icon-fixed.png"), "PNG")
    app_512.save(os.path.join(OUTPUT_DIR, "app-icon.png"), "PNG")

    app_128 = create_app_icon(128)
    app_128.save(os.path.join(OUTPUT_DIR, "128x128.png"), "PNG")

    app_256 = create_app_icon(256)
    app_256.save(os.path.join(OUTPUT_DIR, "128x128@2x.png"), "PNG")

    app_32 = create_app_icon(32)
    app_32.save(os.path.join(OUTPUT_DIR, "32x32.png"), "PNG")

    # Also save favicon in public/
    public_dir = os.path.join(os.path.dirname(__file__), "..", "public")
    app_32.save(os.path.join(public_dir, "favicon.png"), "PNG")
    print("  ✓ Saved app icon set: icon.png, 128x128, 128x128@2x, 32x32")

if __name__ == "__main__":
    main()
