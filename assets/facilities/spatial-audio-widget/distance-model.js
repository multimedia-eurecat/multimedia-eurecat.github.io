export const REFERENCE_DISTANCE = 2;
// Nominal spherical-head radius (17.5 cm diameter), not a visual constraint.
export const HEAD_RADIUS = 0.0875;

// Preserve the original azimuth and elevation while starting exactly 2 m away.
const direction = { x: 1.5, y: 0.6, z: 1.6 };
const length = Math.hypot(direction.x, direction.y, direction.z);
export const DEFAULT_POSITION = Object.freeze(Object.fromEntries(
  Object.entries(direction).map(([axis, value]) => [axis, value * REFERENCE_DISTANCE / length]),
));

/** Free-field pressure gain, referenced to 2 m and capped at the head surface. */
export function gainForDistance(distance) {
  return REFERENCE_DISTANCE / Math.max(HEAD_RADIUS, distance);
}

/** Control close-range boosted peaks after the user's volume setting. */
export function createOutputLimiter(context) {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0;
  limiter.release.value = 0.15;
  // Catch transient overshoots that can escape a compressor's envelope.
  // The guard is linear below 0.9, then bends smoothly towards its ceiling.
  const guard = context.createWaveShaper();
  guard.curve = Float32Array.from({ length: 4097 }, (_, index) => {
    const value = index / 2048 - 1;
    const magnitude = Math.abs(value);
    return magnitude <= 0.9 ? value : Math.sign(value) * (0.9 + 0.08 * Math.tanh((magnitude - 0.9) / 0.08));
  });
  limiter.connect(guard);
  return {
    input: limiter,
    output: guard,
    disconnect() { limiter.disconnect(); guard.disconnect(); },
  };
}
