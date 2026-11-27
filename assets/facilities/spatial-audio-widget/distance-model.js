// Directional rendering and initial source radius, independent of gain unity.
export const REFERENCE_DISTANCE = 2;
export const GAIN_REFERENCE_DISTANCE = 1;
export const DISTANCE_ROLLOFF_EXPONENT = 0.5;
// Nominal head radius limits close-range gain while controls can reach zero.
export const HEAD_RADIUS = 0.0875;
// Listening-test configuration: closest/farthest near-field plus far-field.
// The other measured packages remain available in the manifest.
export const PLAYBACK_DISTANCES = Object.freeze([0.5, 1.5, 3.25]);
// A shared dry-path delay near the closest decoder's ~24-sample frontal peak
// at 48 kHz. Both ears use exactly the same delay, preserving a centered image.
export const CENTER_DELAY_SECONDS = 0.0005;
export const CENTER_GAIN_DB = -21;
export const CENTER_GAIN = 10 ** (CENTER_GAIN_DB / 20);

// Start at azimuth 0°, elevation 0°, exactly 2 m from the listener.
export const DEFAULT_POSITION = Object.freeze({
  x: 0,
  y: 0,
  z: REFERENCE_DISTANCE,
});

/** Half-strength attenuation in dB, unity at 1 m, capped at the head surface. */
export function gainForDistance(distance) {
  return (GAIN_REFERENCE_DISTANCE / Math.max(HEAD_RADIUS, distance)) ** DISTANCE_ROLLOFF_EXPONENT;
}

/** Linear blend of neighboring measured radii; hold the far endpoint beyond it.
 * With centerFade enabled, reserve one extra weight after the measured banks
 * for identical L/R mono, fading in from the closest radius to the origin.
 * Caller supplies ascending distances and scratch storage to avoid audio-thread
 * allocations. Linear weights preserve unity for correlated decoder outputs.
 */
export function writeDistanceWeights(distance, distances, weights, centerFade = false) {
  weights.fill(0);
  if (centerFade && distance < distances[0]) {
    const wet = Math.max(0, distance / distances[0]);
    weights[0] = wet;
    weights[distances.length] = 1 - wet;
    return;
  }
  if (distance <= distances[0] || distances.length === 1) {
    weights[0] = 1;
    return;
  }
  for (let upper = 1; upper < distances.length; upper++) {
    if (distance <= distances[upper]) {
      const blend = (distance - distances[upper - 1]) / (distances[upper] - distances[upper - 1]);
      weights[upper - 1] = 1 - blend;
      weights[upper] = blend;
      return;
    }
  }
  weights[distances.length - 1] = 1;
}

/** Control output peaks after the user's volume setting. */
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
