const GRID = 5;
const HALF = 3; // columns 0..2 are drawn; 0 and 1 mirror onto 4 and 3

/**
 * A 5x5 mirrored identicon derived from the identity hash.
 *
 * Deterministic and self-contained: the same DNA always yields the same face,
 * and the SVG loads nothing. The design's one concession to charm — and it
 * costs no mechanism the pipeline does not already have, exactly as kitty
 * appearance derived from kitty dna.
 */
export function avatarSvg(id: `0x${string}`, size = 120): string {
  const bytes = hexToBytes(id);
  const hue = ((bytes[0] ?? 0) * 360) / 256;
  const fg = `hsl(${hue.toFixed(1)} 62% 48%)`;
  const bg = `hsl(${hue.toFixed(1)} 30% 94%)`;
  const unit = size / GRID;

  const cells: string[] = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < HALF; col += 1) {
      if ((bytes[1 + row * HALF + col] ?? 0) % 2 === 0) continue;
      // The centre column is its own mirror, so it must be emitted once.
      const columns = col === HALF - 1 ? [col] : [col, GRID - 1 - col];
      for (const c of columns) {
        cells.push(
          `<rect data-cell="${c},${row}" x="${(c * unit).toFixed(2)}" y="${(row * unit).toFixed(2)}" ` +
            `width="${unit.toFixed(2)}" height="${unit.toFixed(2)}" fill="${fg}"/>`,
        );
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" role="img" aria-label="reviewer avatar">` +
    `<rect width="${size}" height="${size}" fill="${bg}"/>${cells.join("")}</svg>`
  );
}

function hexToBytes(hex: string): number[] {
  const body = hex.slice(2);
  const out: number[] = [];
  for (let i = 0; i + 1 < body.length; i += 2) out.push(parseInt(body.slice(i, i + 2), 16));
  return out;
}
