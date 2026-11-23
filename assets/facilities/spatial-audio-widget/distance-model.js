export const REFERENCE_DISTANCE = 2;
// Nominal spherical-head radius (17.5 cm diameter), not a visual constraint.
export const HEAD_RADIUS = 0.0875;

// Start at azimuth 0°, elevation 0°, exactly 2 m from the listener.
export const DEFAULT_POSITION = Object.freeze({
  x: 0,
  y: 0,
  z: REFERENCE_DISTANCE,
});

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
