import { View } from 'react-native';

/**
 * The Art Club mark: a record overlapping a page.
 *
 * Built from plain views rather than an image so it stays sharp at every size,
 * adds nothing to the bundle, and works unchanged on the web build.
 *
 * Draw order matters and does the work of clipping: the page goes down first,
 * then a paper-coloured disc bites a gap out of it, then the record sits in
 * that gap. That gap is what keeps the two shapes from touching.
 */

// Geometry as fractions of a 1x1 square, measured off the original artwork.
//
// The page is wider than the source drawing and the gap a little tighter. At a
// 38px home-screen mark the original proportions left barely a sliver of
// terracotta showing, so the mark read as a lone record and lost the book half
// of the idea entirely.
const G = {
  disc: { x: 0.46, y: 0.54, r: 0.315 },
  hole: 0.085,
  gap: 0.327,                                   // paper disc behind the record
  page: { x: 0.60, y: 0.135, w: 0.295, h: 0.48, r: 0.032 },
};

// Bounding box of everything above, used to centre the mark in its box.
const BOX = {
  x0: G.disc.x - G.gap,
  y0: G.page.y,
  x1: G.page.x + G.page.w,
  y1: G.disc.y + G.gap,
};
const SPAN = Math.max(BOX.x1 - BOX.x0, BOX.y1 - BOX.y0);

export default function Mark({
  size = 96,
  ink = '#1A1714',
  accent = '#B4603A',
  paper = '#FBF9F6',
}) {
  const s = size / SPAN;
  const ox = -BOX.x0 * s + (size - (BOX.x1 - BOX.x0) * s) / 2;
  const oy = -BOX.y0 * s + (size - (BOX.y1 - BOX.y0) * s) / 2;

  const circle = (r, cx, cy, color) => ({
    position: 'absolute',
    left: ox + cx * s - r * s,
    top: oy + cy * s - r * s,
    width: r * 2 * s,
    height: r * 2 * s,
    borderRadius: r * s,
    backgroundColor: color,
  });

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Art Club"
      style={{ width: size, height: size }}
    >
      <View
        style={{
          position: 'absolute',
          left: ox + G.page.x * s,
          top: oy + G.page.y * s,
          width: G.page.w * s,
          height: G.page.h * s,
          borderRadius: G.page.r * s,
          backgroundColor: accent,
        }}
      />
      <View style={circle(G.gap, G.disc.x, G.disc.y, paper)} />
      <View style={circle(G.disc.r, G.disc.x, G.disc.y, ink)} />
      <View style={circle(G.hole, G.disc.x, G.disc.y, paper)} />
    </View>
  );
}
