/** Draws a {lat,lng}[] route as a bold neo-brutalism polyline. */
export function RouteOutline({
  route,
  width = 280,
  height = 150,
  stroke = 'var(--color-ink)',
}: {
  route: Array<{ lat: number; lng: number }>;
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (!route || route.length < 2) return null;

  const lats = route.map((p) => p.lat);
  const lngs = route.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const pad = 12;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  // Preserve aspect: use the larger span so the shape isn't distorted.
  const scale = Math.min(w / spanLng, h / spanLat);
  const offX = pad + (w - spanLng * scale) / 2;
  const offY = pad + (h - spanLat * scale) / 2;

  const pts = route
    .map((p) => {
      const x = offX + (p.lng - minLng) * scale;
      const y = offY + (maxLat - p.lat) * scale; // invert: north = up
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} fill="none">
      <polyline
        points={pts}
        stroke={stroke}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
