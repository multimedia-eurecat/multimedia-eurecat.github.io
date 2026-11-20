import { MAX_DISTANCE, constrainCartesian, toCartesian, toSpherical } from '../coordinates.js';
import { HANDLE_COLOURS, HANDLE_HIGHLIGHT, HANDLE_HEAD_RADIUS, HANDLE_HEAD_LENGTH, HANDLE_SHAFT_RADIUS } from '../handle-appearance.js';

function assert(condition, message) { if (!condition) throw new Error(message); }
function close(a, b, message, tolerance = 1e-7) { assert(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`); }

export function runCartesianBoundaryChecks(widget) {
  const original = { position: widget.getPosition(), mode: widget.coordinateSystem };
  const axes = ['x', 'y', 'z'];
  const initial = { x: 2, y: 1, z: 3 };
  let cases = 0;
  const check = (position, axis, sign) => {
    const others = axes.filter(key => key !== axis);
    close(position[axis], sign * Math.sqrt(MAX_DISTANCE ** 2 - others.reduce((sum, key) => sum + initial[key] ** 2, 0)), 'Moving axis stops at the spherical boundary');
    for (const key of others) close(position[key], initial[key], 'Boundary clipping preserves the other axes');
    close(Math.hypot(...Object.values(position)), MAX_DISTANCE, 'Cartesian and spherical limits agree');
  };
  try {
    widget.setCoordinateSystem('cartesian');
    for (const axis of axes) for (const sign of [-1, 1]) {
      const target = { ...initial, [axis]: sign * 100 };
      check(constrainCartesian(target, initial), axis, sign);
      widget.setPosition(initial);
      widget.setPosition({ [axis]: sign * 100 });
      check(widget.getPosition(), axis, sign);
      widget.setPosition(initial);
      const slider = widget.shadowRoot.querySelector(`[data-axis="${axis}"]`);
      slider.min = -MAX_DISTANCE;
      slider.max = MAX_DISTANCE;
      slider.value = sign * MAX_DISTANCE;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      check(widget.getPosition(), axis, sign);
      widget.setPosition(initial);
      const view = widget._scene;
      view.source.position.set(target.x, target.y, target.z);
      view._objectChanged();
      check(widget.getPosition(), axis, sign);
      view._objectChanged();
      check(widget.getPosition(), axis, sign);
      widget.setPosition({ [axis]: initial[axis] });
      for (const key of axes) close(widget.getPosition()[key], initial[key], 'Moving back inside restores the requested position');
      cases++;
    }
    const direction = { x: 10, y: -5, z: 20 };
    const clipped = constrainCartesian(direction, initial);
    const fractions = axes.map(axis => (clipped[axis] - initial[axis]) / (direction[axis] - initial[axis]));
    fractions.forEach(fraction => close(fraction, fractions[0], 'Free dragging stops along its movement path'));
    close(Math.hypot(...Object.values(clipped)), MAX_DISTANCE, 'Free dragging obeys the same radius');
    return { cases, axisClipping: true, sliders: true, scene: true, freeDragPath: true };
  } finally {
    widget.setPosition(original.position);
    widget.setCoordinateSystem(original.mode);
  }
}

export function runSphericalChecks(widget) {
  const original = widget.getPosition();
  const mode = widget.coordinateSystem;
  let cases = 0;
  for (const azimuth of [-180, -125, 0, 45, 179]) {
    for (const elevation of [-90, -60, 0, 35, 90]) {
      const spherical = { azimuth, elevation, distance: 3.25 };
      const point = toCartesian(spherical);
      const roundTrip = toCartesian(toSpherical(point, spherical));
      for (const axis of ['x', 'y', 'z']) close(point[axis], roundTrip[axis], 'Coordinate round trip');
      widget.setSphericalPosition(spherical);
      const before = widget.getPosition();
      for (const nextMode of ['cartesian', 'spherical']) {
        widget.setCoordinateSystem(nextMode);
        for (const axis of ['x', 'y', 'z']) close(before[axis], widget.getPosition()[axis], 'Mode switch preserves position');
      }
      const controller = widget._scene.spherical;
      for (const { key, curve } of controller.curves) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const pointOnCurve = curve.getPoint(t);
          const tangent = curve.getTangent(t).normalize();
          if (key === 'distance') {
            close(Math.abs(pointOnCurve.clone().normalize().dot(tangent)), 1, 'Distance arrow is radial', 1e-5);
          } else {
            close(pointOnCurve.length(), spherical.distance, 'Angular handle lies on the sphere');
            close(pointOnCurve.clone().normalize().dot(tangent), 0, 'Angular handle is tangent to the sphere', 1e-3);
          }
        }
      }
      cases++;
    }
  }
  widget.setSphericalPosition({ azimuth: 75, elevation: 90, distance: 0 });
  widget.setSphericalPosition({ distance: 2 });
  close(widget.getSphericalPosition().azimuth, 75, 'Origin retains the chosen direction');
  widget.setSphericalPosition({ elevation: 30 });
  close(widget.getSphericalPosition().distance, 2, 'Leaving a pole keeps the radius');
  widget.setSphericalPosition({ distance: MAX_DISTANCE });
  widget.setSphericalPosition({ azimuth: -140, elevation: -75 });
  close(Math.hypot(...Object.values(widget.getPosition())), MAX_DISTANCE, 'Boundary rotation keeps the radius');
  widget.setSphericalPosition({ azimuth: 30, elevation: 20, distance: 2 });
  const input = widget.shadowRoot.querySelector('[data-axis="azimuth"]');
  input.value = '65';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  close(widget.getSphericalPosition().azimuth, 65, 'Spherical slider changes azimuth');
  close(widget.getSphericalPosition().elevation, 20, 'Azimuth slider preserves elevation');
  close(widget.getSphericalPosition().distance, 2, 'Azimuth slider preserves radius');
  widget.setSphericalPosition({ azimuth: 180 });
  close(Number(input.value), 180, 'Positive azimuth endpoint stays at the right edge');
  widget.setPosition(original);
  widget.setCoordinateSystem(mode);
  return { cases, roundTrips: true, modeSwitching: true, tangentGeometry: true, originAndPoles: true, slider: true };
}

export function runDepthCueChecks(widget) {
  const view = widget._scene;
  const original = { spherical: widget.getSphericalPosition(), mode: widget.coordinateSystem, camera: view.camera.position.clone(), target: view.controls.target.clone() };
  const fadeAt = (z) => {
    const point = view.content.localToWorld(view.source.position.clone().set(0, 0, z)).applyMatrix4(view.camera.matrixWorldInverse);
    const uniforms = view.handleDepthCue.uniforms;
    return Math.max(0, Math.min(1, (-point.z - uniforms.handleDepthNear.value) / (uniforms.handleDepthFar.value - uniforms.handleDepthNear.value)));
  };
  try {
    for (const mode of ['spherical', 'cartesian']) {
      widget.setCoordinateSystem(mode);
      widget.setSphericalPosition({ azimuth: 0, elevation: 0, distance: 3 });
      view.controls.target.set(0, 0, 0);
      view.camera.position.set(0, 1, 9);
      view.controls.update();
      close(fadeAt(3), 0, 'Near side retains full colour');
      close(fadeAt(-3), 1, 'Far side reaches the haze');
      const centreFade = fadeAt(0);
      widget.setSphericalPosition({ azimuth: 180 });
      close(fadeAt(0), centreFade, 'Moving the source around the listener does not move the fade reference');
      close(fadeAt(3), 0, 'Foreground stays clear when the source moves behind the listener');
      close(fadeAt(-3), 1, 'Background stays faded when the source moves behind the listener');
      view.camera.position.set(0, 1, -9);
      view.controls.update();
      close(fadeAt(3), 1, 'Depth cue follows camera orbit');
      close(fadeAt(-3), 0, 'Opposite side becomes foreground');
      view.camera.position.set(0, 2, -18);
      view.controls.update();
      close(fadeAt(3), 1, 'Depth cue survives zooming out');
    }
    widget.setCoordinateSystem('spherical');
    widget.setSphericalPosition({ azimuth: 0 });
    assert(Object.values(view.spherical.materials).every(material => material.depthTest), 'Handles respect solid-object occlusion');
    view.camera.position.set(0, 0, -9);
    view.controls.update();
    view.content.updateWorldMatrix(true, true);
    const point = view.source.getWorldPosition(view.source.position.clone()).project(view.camera);
    const bounds = view.renderer.domElement.getBoundingClientRect();
    const hit = view.spherical._pick({ clientX: bounds.left + (point.x + 1) * bounds.width / 2, clientY: bounds.top + (1 - point.y) * bounds.height / 2 });
    assert(hit !== 'surface', 'The listener blocks picking a source hidden directly behind it');
    return { cameraRelativeFade: true, sharedReference: true, listenerCentred: true, zoom: true, occlusion: true };
  } finally {
    widget.setSphericalPosition(original.spherical);
    widget.setCoordinateSystem(original.mode);
    view.camera.position.copy(original.camera);
    view.controls.target.copy(original.target);
    view.controls.update();
  }
}

// Find a genuinely hittable handle in screen space, including foreshortened arcs.
export function dragStart(widget, dimension) {
  const view = widget._scene;
  const controller = view.spherical;
  const canvas = view.renderer.domElement;
  canvas.scrollIntoView({ block: 'center' });
  view.content.updateWorldMatrix(true, true);
  view.camera.updateMatrixWorld();
  const bounds = canvas.getBoundingClientRect();
  const project = point => {
    const screen = view.content.localToWorld(point.clone()).project(view.camera);
    return { x: bounds.left + (screen.x + 1) * bounds.width / 2, y: bounds.top + (1 - screen.y) * bounds.height / 2 };
  };
  const candidates = dimension === 'surface' ? [view.source.position.clone()]
    : controller.curves.filter(curve => curve.key === dimension).flatMap(({ curve }) => [0.95, 0.7, 0.5, 0.3, 0.05].map(t => curve.getPoint(t)));
  for (const candidate of candidates) {
    const point = project(candidate);
    if (point.x < bounds.left || point.x > bounds.right || point.y < Math.max(75, bounds.top) || point.y > bounds.bottom) continue;
    if (controller._pick({ clientX: point.x, clientY: point.y }) === dimension) {
      const derivative = controller._screenDerivative(dimension === 'surface' ? 'azimuth' : dimension);
      return { ...point, derivative: { x: derivative.x, y: derivative.y }, before: widget.getSphericalPosition() };
    }
  }
  throw new Error(`No visible ${dimension} handle found`);
}

export function checkDrag(widget, before, dimension) {
  const after = widget.getSphericalPosition();
  for (const key of ['azimuth', 'elevation', 'distance']) {
    if (dimension === key || (dimension === 'surface' && key !== 'distance')) continue;
    close(after[key], before[key], `${dimension} drag preserves ${key}`);
  }
  assert(dimension === 'surface'
    ? Math.abs(after.azimuth - before.azimuth) > 0.1 && Math.abs(after.elevation - before.elevation) > 0.1
    : Math.abs(after[dimension] - before[dimension]) > 0.01, `${dimension} drag actually changes its dimension`);
  close(Math.hypot(...Object.values(widget.getPosition())), after.distance, 'Cartesian and spherical radius agree');
  assert(!widget._scene.spherical.drag && widget._scene.controls.enabled, 'Pointer release restores camera controls');
  return { dimension, before, after };
}

export function checkSphericalHighlight(widget, dimension) {
  const controls = widget._scene.spherical;
  const selected = dimension || null;
  assert(controls.hovered === selected, 'Hover identifies the intended spherical dimension');
  const palette = { azimuth: HANDLE_COLOURS.x, elevation: HANDLE_COLOURS.y, distance: HANDLE_COLOURS.z };
  for (const [key, material] of Object.entries(controls.materials)) {
    const highlighted = key === selected || (selected === 'surface' && key !== 'distance');
    const colour = highlighted ? material.color.getHex() : material.color.clone().convertLinearToSRGB().getHex();
    assert(colour === (highlighted ? HANDLE_HIGHLIGHT : palette[key]), 'Only the affected dimensions turn yellow');
  }
}

export function cartesianHandlePoint(widget, axis) {
  const view = widget._scene;
  const canvas = view.renderer.domElement;
  canvas.scrollIntoView({ block: 'center' });
  view._draw();
  const bounds = canvas.getBoundingClientRect();
  const handles = view.transform._gizmo.gizmo.translate.children.filter(handle => handle.name === axis);
  assert(view.transform.size > 0.85 && handles.some(handle => handle.geometry.parameters.radiusTop > 0.0075), 'Cartesian arrows are larger and thicker');
  assert(handles.every(handle => handle.material._color.clone().convertLinearToSRGB().getHex() === HANDLE_COLOURS[axis.toLowerCase()]), 'Cartesian axes use the shared muted palette');
  for (const handle of handles.filter(handle => handle.visible && handle.geometry.type === 'ConeGeometry')) {
    handle.geometry.computeBoundingBox();
    const point = handle.geometry.boundingBox.getCenter(view.source.position.clone());
    const dimension = axis.toLowerCase();
    point[dimension] = point[dimension] > 0 ? handle.geometry.boundingBox.max[dimension] - 0.01 : handle.geometry.boundingBox.min[dimension] + 0.01;
    point.applyMatrix4(handle.matrixWorld).project(view.camera);
    const x = bounds.left + (point.x + 1) * bounds.width / 2;
    const y = bounds.top + (1 - point.y) * bounds.height / 2;
    if (x < bounds.left || x > bounds.right || y < Math.max(75, bounds.top) || y > bounds.bottom) continue;
    view.transform.pointerHover({ x: point.x, y: point.y, button: 0 });
    if (view.transform.axis === axis) return { x, y, before: widget.getPosition() };
  }
  throw new Error(`No visible ${axis} Cartesian arrow found`);
}

export function checkMatchingHandleSizes(widget) {
  const view = widget._scene;
  const original = { position: widget.getPosition(), mode: widget.coordinateSystem, camera: view.camera.position.clone(), target: view.controls.target.clone() };
  let worldGeometry;
  let cases = 0;
  try {
    for (const distance of [0, 0.2, 1, 2.5, 6, 7]) {
      for (const cameraGap of [1.5, 5, 12]) {
        widget.setCoordinateSystem('spherical');
        widget.setSphericalPosition({ azimuth: 35, elevation: 20, distance });
        // Keep the source in view while changing the camera distance.
        view.controls.target.set(0, 0, 0);
        const direction = view.source.getWorldPosition(view.source.position.clone()).normalize();
        if (!direction.lengthSq()) direction.set(0.5, 0.25, 1).normalize();
        view.camera.position.copy(direction).multiplyScalar(distance + cameraGap);
        view.controls.update();
        widget.setCoordinateSystem('cartesian');
        view._draw();
        const handles = view.transform._gizmo.gizmo.translate.children.filter(handle => handle.visible && ['X', 'Y', 'Z'].includes(handle.name));
        for (const handle of handles) {
          if (handle.geometry.type === 'ConeGeometry') {
            close(handle.geometry.parameters.radius * handle.scale.x, HANDLE_HEAD_RADIUS, 'Cartesian head width stays fixed');
            close(handle.geometry.parameters.height * handle.scale.x, HANDLE_HEAD_LENGTH, 'Cartesian head length stays fixed');
          } else {
            for (const axis of ['x', 'y', 'z'].filter(axis => axis !== handle.name.toLowerCase())) {
              close(handle.geometry.parameters.radiusTop * handle.scale[axis], HANDLE_SHAFT_RADIUS, 'Cartesian shaft width stays fixed');
            }
          }
        }
        const geometry = [...view.transform._gizmo.gizmo.translate.children, ...view.transform._gizmo.picker.translate.children]
          .flatMap(handle => handle.matrixWorld.elements.map((value, index) =>
            index >= 12 && index <= 14 ? value - view.transform.worldPosition.getComponent(index - 12) : value));
        if (worldGeometry) geometry.forEach((value, index) => close(value, worldGeometry[index], 'Zoom and listener distance preserve arrow and picker dimensions'));
        worldGeometry = geometry;
        cases++;
      }
    }
    return { cases, cameraScalingCompensated: true, worldSizesStable: true, listenerDistanceIndependent: true };
  } finally {
    widget.setPosition(original.position);
    widget.setCoordinateSystem(original.mode);
    view.camera.position.copy(original.camera);
    view.controls.target.copy(original.target);
    view.controls.update();
  }
}
