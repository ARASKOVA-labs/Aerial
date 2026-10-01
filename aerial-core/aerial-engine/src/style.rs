//! Colour theming and stroke styling.
//!
//! Elements store *canonical* (light-theme) colours. In dark mode every colour
//! is mapped through the same transform as the CSS filter
//! `invert(93%) hue-rotate(180deg)`: luminance flips (black ink → near-white,
//! white paper → #121212) while hues stay recognisable. Switching theme
//! therefore re-colours every drawing consistently — the old renderer only
//! special-cased two hex values, so most ink stayed dark on a dark canvas.
//! Images are never transformed.

use std::borrow::Cow;

use crate::geom::parse_hex_rgb;

/// Legacy dark-mode default ink. Old boards stored it as the "ink" colour, so
/// it maps to the canonical dark ink rather than to white paper.
const LEGACY_DARK_INK: &str = "#f8fafc";
pub const DEFAULT_INK: &str = "#1e1e1e";

fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

/// `invert(0.93)` followed by `hue-rotate(180deg)` on an sRGB triple.
pub fn dark_transform(rgb: (u8, u8, u8)) -> (u8, u8, u8) {
    let inv = |c: u8| 0.93 - 0.86 * (c as f64 / 255.0);
    let (r, g, b) = (inv(rgb.0), inv(rgb.1), inv(rgb.2));
    // hue-rotate(180deg) matrix from the Filter Effects spec (cos = -1, sin = 0).
    let r2 = -0.574 * r + 1.430 * g + 0.144 * b;
    let g2 = 0.426 * r + 0.430 * g + 0.144 * b;
    let b2 = 0.426 * r + 1.430 * g - 0.856 * b;
    let to8 = |v: f64| (clamp01(v) * 255.0).round() as u8;
    (to8(r2), to8(g2), to8(b2))
}

/// Canonical colour → colour to paint for the current theme. Non-hex values
/// (`transparent`, named colours) pass through unchanged.
pub fn themed(color: &str, is_dark: bool) -> Cow<'_, str> {
    let canonical = if color.eq_ignore_ascii_case(LEGACY_DARK_INK) { DEFAULT_INK } else { color };
    if !is_dark {
        return Cow::Borrowed(canonical);
    }
    match parse_hex_rgb(canonical) {
        Some(rgb) => {
            let (r, g, b) = dark_transform(rgb);
            Cow::Owned(format!("#{r:02x}{g:02x}{b:02x}"))
        }
        None => Cow::Borrowed(canonical),
    }
}

pub fn is_transparent(color: &str) -> bool {
    color.is_empty() || color.eq_ignore_ascii_case("transparent")
}

/// Dash pattern (world units) for a stroke style, scaled by stroke width the
/// way Excalidraw does so thick dashed lines still read as dashed.
pub fn dash_pattern(style: &str, stroke_width: f64) -> Option<(f64, f64)> {
    match style {
        "dashed" => Some((8.0 + stroke_width, 8.0 + stroke_width * 1.5)),
        "dotted" => Some((0.01, 5.0 + stroke_width * 2.0)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paper_and_ink_swap_like_excalidraw() {
        assert_eq!(themed("#ffffff", true), "#121212");
        assert_eq!(themed("#000000", true), "#ededed");
        assert_eq!(themed("#1e1e1e", false), "#1e1e1e");
    }

    #[test]
    fn hues_survive_and_grays_stay_gray() {
        let (r, g, b) = dark_transform((0xe0, 0x31, 0x31)); // red
        assert!(r > g && r > b, "red stays red: {r} {g} {b}");
        let (r, g, b) = dark_transform((128, 128, 128));
        assert!(r.abs_diff(g) <= 1 && g.abs_diff(b) <= 1);
    }

    #[test]
    fn legacy_dark_ink_maps_to_default_ink() {
        assert_eq!(themed("#f8fafc", false), DEFAULT_INK);
        assert_eq!(themed("transparent", true), "transparent");
    }
}
