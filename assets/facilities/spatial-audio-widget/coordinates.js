// Azimuth: 0° in front, +90° to the listener's right. Elevation: +90° above.
export const MAX_DISTANCE = 7;
const radians = Math.PI / 180;

export function wrapAzimuth(value) {
  const angle = ((value + 180) % 360 + 360) % 360 - 180;
  // Keep the slider's positive endpoint at the right edge instead of jumping left.
  return angle === -180 && value > 0 ? 180 : angle;
}

export function toCartesian({ azimuth, elevation, distance }) {
  const horizontal = distance * Math.cos(elevation * radians);
  return {
    x: horizontal * Math.sin(azimuth * radians),
    y: distance * Math.sin(elevation * radians),
    z: horizontal * Math.cos(azimuth * radians),
  };
}

export function toSpherical({ x, y, z }, previous = { azimuth: 0, elevation: 0 }) {
  const distance = Math.hypot(x, y, z);
  if (distance < 1e-10) return { azimuth: previous.azimuth, elevation: previous.elevation, distance: 0 };
  return {
    azimuth: Math.hypot(x, z) < 1e-10 ? previous.azimuth : wrapAzimuth(Math.atan2(x, z) / radians),
    elevation: Math.atan2(y, Math.hypot(x, z)) / radians,
    distance,
  };
}

export function constrainSpherical(position) {
  for (const key of ['azimuth', 'elevation', 'distance']) {
    if (!Number.isFinite(position[key])) throw new TypeError('Spherical coordinates must be finite numbers.');
  }
  return {
    azimuth: wrapAzimuth(position.azimuth),
    elevation: Math.max(-90, Math.min(90, position.elevation)),
    distance: Math.max(0, Math.min(MAX_DISTANCE, position.distance)),
  };
}

export function constrainCartesian(position, previous) {
  const axes = ['x', 'y', 'z'];
  for (const key of axes) {
    if (!Number.isFinite(position[key])) throw new TypeError('Position coordinates must be finite numbers.');
  }
  const distance = Math.hypot(position.x, position.y, position.z);
  if (distance <= MAX_DISTANCE) return { ...position };
  if (!previous) {
    const scale = MAX_DISTANCE / distance;
    return Object.fromEntries(axes.map(axis => [axis, position[axis] * scale]));
  }

  // Stop along the requested movement at the sphere's boundary. Radially
  // normalizing the target would also change coordinates the user isn't moving.
  const start = constrainCartesian(previous);
  const delta = axes.map(axis => position[axis] - start[axis]);
  const length = Math.hypot(...delta);
  if (!length) return start;
  const direction = delta.map(value => value / length);
  const projection = axes.reduce((sum, axis, index) => sum + start[axis] * direction[index], 0);
  const remaining = Math.max(0, MAX_DISTANCE ** 2 - axes.reduce((sum, axis) => sum + start[axis] ** 2, 0));
  const root = Math.sqrt(projection ** 2 + remaining);
  const travel = projection > 0 ? remaining / (root + projection) : root - projection;
  const fraction = Math.max(0, Math.min(1, travel / length));
  return Object.fromEntries(axes.map((axis, index) => [axis, start[axis] + delta[index] * fraction]));
}
