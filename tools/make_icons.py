#!/usr/bin/env python3
"""Render the Art Club mark into the app's icon PNGs.

Pure standard library -- no Pillow, no SVG toolchain. The mark is simple enough
(a record overlapping a page) that drawing it analytically is both exact and
dependency-free, so this keeps working on any machine.

Geometry lives in both this file and curator/src/Mark.js. Change them together.

Usage:  python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

PAPER = (251, 249, 246, 255)
INK = (26, 23, 20, 255)
ACCENT = (180, 96, 58, 255)
CLEAR = (0, 0, 0, 0)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "curator", "assets")
WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "curator", "public")


def rounded_box_sdf(x, y, cx, cy, hx, hy, r):
    """Signed distance to a rounded rectangle. Negative inside."""
    dx = abs(x - cx) - (hx - r)
    dy = abs(y - cy) - (hy - r)
    outside = math.hypot(max(dx, 0.0), max(dy, 0.0))
    inside = min(max(dx, dy), 0.0)
    return outside + inside - r


def paint(dst, src, a):
    """Lay src over dst with coverage a, *replacing* rather than compositing.

    Replacement matters for the transparent Android variant: the gap and the
    record's centre hole must punch through to nothing, and compositing a
    transparent colour would simply leave the pixel untouched.
    """
    if a <= 0:
        return dst
    if a >= 1:
        return src
    if src[3] == 0:                      # fading out to transparent
        return (dst[0], dst[1], dst[2], int(round(dst[3] * (1 - a))))
    if dst[3] == 0:                      # fading in over nothing
        return (src[0], src[1], src[2], int(round(src[3] * a)))
    return tuple(int(round(dst[i] + (src[i] - dst[i]) * a)) for i in range(4))


def coverage(d):
    """Antialiased coverage from a signed distance, ~1px soft edge."""
    return min(1.0, max(0.0, 0.5 - d))


# The mark's geometry, as fractions of a 1x1 square. Kept in step with
# curator/src/Mark.js -- change both together.
DISC = (0.46, 0.54, 0.315)
HOLE_R = 0.085
GAP_R = 0.327
PAGE = (0.60, 0.135, 0.295, 0.48, 0.032)      # x, y, w, h, corner radius

BOX_X0 = DISC[0] - GAP_R
BOX_Y0 = PAGE[1]
BOX_X1 = PAGE[0] + PAGE[2]
BOX_Y1 = DISC[1] + GAP_R
SPAN = max(BOX_X1 - BOX_X0, BOX_Y1 - BOX_Y0)


def render(size, background, fill_ratio):
    """The mark, centred, on the given background.

    `background` doubles as the colour of the gap and the record's centre hole,
    so a transparent background gives a mark that punches through cleanly.
    """
    art = size * fill_ratio
    s = art / SPAN
    ox = -BOX_X0 * s + (size - (BOX_X1 - BOX_X0) * s) / 2
    oy = -BOX_Y0 * s + (size - (BOX_Y1 - BOX_Y0) * s) / 2

    dcx, dcy, dr = ox + DISC[0] * s, oy + DISC[1] * s, DISC[2] * s
    px_, py_, pw, ph, pr = PAGE
    page_cx = ox + (px_ + pw / 2) * s
    page_cy = oy + (py_ + ph / 2) * s

    rows = []
    for y in range(size):
        cy = y + 0.5
        row = bytearray()
        for x in range(size):
            cx = x + 0.5
            col = background

            col = paint(col, ACCENT, coverage(rounded_box_sdf(
                cx, cy, page_cx, page_cy, pw / 2 * s, ph / 2 * s, pr * s)))
            col = paint(col, background,
                        coverage(math.hypot(cx - dcx, cy - dcy) - GAP_R * s))
            col = paint(col, INK,
                        coverage(math.hypot(cx - dcx, cy - dcy) - dr))
            col = paint(col, background,
                        coverage(math.hypot(cx - dcx, cy - dcy) - HOLE_R * s))

            row += bytes(col)
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("  %-34s %d x %d  (%.0f kB)" % (
        os.path.basename(path), size, size, len(png) / 1024))


# Home-screen icons for the web build. iOS ignores the favicon when you "Add to
# Home Screen" and draws a letter instead unless an apple-touch-icon is present,
# and it does not respect transparency -- hence the solid paper background.
WEB_TARGETS = [
    ("apple-touch-icon.png", 180, PAPER, 0.66),
    ("icon-192.png", 192, PAPER, 0.66),
    ("icon-512.png", 512, PAPER, 0.66),
]

TARGETS = [
    # name, size, background, how much of the canvas the mark fills
    ("icon.png", 512, PAPER, 0.70),
    ("splash-icon.png", 512, PAPER, 0.62),
    ("favicon.png", 128, PAPER, 0.78),
    # Android crops adaptive icons hard, so the mark sits well inside the safe area.
    ("android-icon-foreground.png", 512, CLEAR, 0.46),
]

if __name__ == "__main__":
    out = os.path.abspath(OUT_DIR)
    print("Rendering the Art Club mark into %s\n" % out)
    for name, size, bg, inset in TARGETS:
        write_png(os.path.join(out, name), size, render(size, bg, inset))

    web = os.path.abspath(WEB_DIR)
    os.makedirs(web, exist_ok=True)
    print("\nHome-screen icons -> %s\n" % web)
    for name, size, bg, inset in WEB_TARGETS:
        write_png(os.path.join(web, name), size, render(size, bg, inset))
    print("\nDone.")
