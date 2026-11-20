import * as THREE from './vendor/three.module.js';
import { constrainSpherical, toCartesian } from './coordinates.js';
import { HANDLE_COLOURS, HANDLE_HIGHLIGHT, HANDLE_SHAFT_RADIUS, HANDLE_HEAD_RADIUS, HANDLE_HEAD_LENGTH, handleScale, HandleDepthCue } from './handle-appearance.js';

const colours = { azimuth: HANDLE_COLOURS.x, elevation: HANDLE_COLOURS.y, distance: HANDLE_COLOURS.z };
const vector = (position) => new THREE.Vector3(position.x, position.y, position.z);

class SurfaceArc extends THREE.Curve {
  constructor(pointAt) { super(); this.pointAt = pointAt; }
  getPoint(t, target = new THREE.Vector3()) { return target.copy(this.pointAt(t)); }
}

/** Listener-centred spherical handles. Geometry lives in the source's local frame. */
export class SphericalControls {
  constructor({ camera, element, parent, source, occluders = [], onChange, onDragging, onRender, depthCue = new HandleDepthCue() }) {
    Object.assign(this, { camera, element, parent, source, occluders, onChange, onDragging, onRender });
    this.group = new THREE.Group();
    this.group.name = 'spherical-controls';
    parent.add(this.group);
    this.enabled = false;
    this.group.visible = false;
    this.raycaster = new THREE.Raycaster();
    this.depthCue = depthCue;
    this.depthUniforms = this.depthCue.uniforms;
    this.depthCentre = this.depthCue.centre;
    this.materials = Object.fromEntries(Object.entries(colours).map(([key, colour]) => [key,
      this.depthCue.apply(new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).convertSRGBToLinear(), transparent: true, depthWrite: false })),
    ]));
    this.pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.guideMaterial = this.depthCue.apply(new THREE.LineBasicMaterial({ color: new THREE.Color(0x87958b).convertSRGBToLinear(), transparent: true, depthWrite: false }), 0.32, 0.06);
    this.events = new AbortController();
    const options = { signal: this.events.signal, capture: true };
    element.addEventListener('pointerdown', event => this._pointerDown(event), options);
    element.addEventListener('pointermove', event => this._pointerMove(event), options);
    element.addEventListener('pointerup', event => this._pointerUp(event), options);
    element.addEventListener('pointercancel', event => this._pointerUp(event), options);
    element.addEventListener('lostpointercapture', event => this._pointerUp(event), options);
    element.addEventListener('pointerleave', () => {
      if (this.enabled && !this.drag) { element.style.cursor = ''; this._setHovered(null); }
    }, options);
  }

  updateDepthCue() {
    if (!this.position) return;
    this.parent.updateWorldMatrix(true, false);
    this.depthCue.update(this.camera, this.depthCentre.setFromMatrixPosition(this.parent.matrixWorld), Math.max(0.5, this.position.distance));
  }

  setEnabled(enabled) {
    this.cancel();
    this.enabled = enabled;
    this.group.visible = enabled;
    this.element.style.cursor = '';
    if (enabled && this.position) this.update(this.position);
  }

  update(position) {
    this.position = { ...position };
    if (!this.enabled) return;
    // Rebuild the small gizmo, disposing replaced GPU buffers on every update.
    this.group.traverse(object => object.geometry?.dispose());
    this.group.clear();
    this.pickers = [];
    this.curves = [];
    const { distance, elevation } = position;
    const scale = handleScale(distance);
    const normal = vector(toCartesian({ ...position, distance: 1 }));
    const point = vector(toCartesian(position));
    this._segment('distance', new SurfaceArc(t => point.clone().addScaledVector(normal, (0.24 + t * 0.8) * scale)), scale);
    if (distance < 0.08) return;

    const extent = Math.min(48, 70 * scale / distance);
    const gap = Math.min(extent * 0.7, 13 * scale / distance);
    const addArc = (key, start, end) => {
      if (end - start < 0.5) return;
      const curve = new SurfaceArc(t => vector(toCartesian({ ...position, [key]: position[key] + start + t * (end - start) })));
      // Keep only the arrowhead at the end furthest from the source ball.
      this._segment(key, curve, scale, end <= 0 ? 0 : 1);
    };
    if (Math.abs(Math.cos(elevation * Math.PI / 180)) > 0.025) {
      const horizontalExtent = Math.min(65, extent / Math.max(0.3, Math.cos(elevation * Math.PI / 180)));
      addArc('azimuth', -horizontalExtent, -gap);
      addArc('azimuth', gap, horizontalExtent);
    }
    addArc('elevation', Math.max(-extent, -90 - elevation), -gap);
    addArc('elevation', gap, Math.min(extent, 90 - elevation));

    for (const key of ['azimuth', 'elevation']) {
      const points = Array.from({ length: 97 }, (_, index) => vector(toCartesian({ ...position, [key]: position[key] + index * 360 / 96 })));
      this.group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), this.guideMaterial));
    }
  }

  _segment(key, curve, scale, headEnd = 1) {
    this.curves.push({ key, curve });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, HANDLE_SHAFT_RADIUS * scale, 6, false), this.materials[key]);
    tube.renderOrder = 10;
    this.group.add(tube);
    const picker = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.09 * scale, 6, false), this.pickMaterial);
    picker.userData.dimension = key;
    this.pickers.push(picker);
    this.group.add(picker);
    const head = new THREE.Mesh(new THREE.ConeGeometry(HANDLE_HEAD_RADIUS * scale, HANDLE_HEAD_LENGTH * scale, 12), this.materials[key]);
    const direction = curve.getTangent(headEnd).multiplyScalar(headEnd === 0 ? -1 : 1).normalize();
    head.position.copy(curve.getPoint(headEnd));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    head.userData.dimension = key;
    head.renderOrder = 10;
    this.pickers.push(head);
    this.group.add(head);
  }

  _pick(event) {
    const bounds = this.element.getBoundingClientRect();
    this.parent.updateWorldMatrix(true, true);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), this.camera);
    const blockedAt = this.raycaster.intersectObjects(this.occluders, false)[0]?.distance ?? Infinity;
    const sourceHit = this.raycaster.intersectObject(this.source)[0];
    if (sourceHit && sourceHit.distance < blockedAt) return 'surface';
    return this.raycaster.intersectObjects(this.pickers, false).find(hit => hit.distance < blockedAt)?.object.userData.dimension;
  }

  _setHovered(dimension) {
    const hovered = dimension === 'surface' || Object.hasOwn(this.materials, dimension) ? dimension : null;
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    for (const [key, material] of Object.entries(this.materials)) {
      const highlighted = key === hovered || (hovered === 'surface' && key !== 'distance');
      material.color.setHex(highlighted ? HANDLE_HIGHLIGHT : colours[key]).convertSRGBToLinear();
    }
    this.onRender?.();
  }

  _project(point) {
    const bounds = this.element.getBoundingClientRect();
    const projected = this.parent.localToWorld(point.clone()).project(this.camera);
    return new THREE.Vector2((projected.x + 1) * bounds.width / 2, (1 - projected.y) * bounds.height / 2);
  }

  _screenDerivative(dimension) {
    const step = dimension === 'distance' ? 0.01 : 0.1;
    const next = { ...this.position, [dimension]: this.position[dimension] + step };
    return this._project(vector(toCartesian(next))).sub(this._project(vector(toCartesian(this.position)))).divideScalar(step);
  }

  _pointerDown(event) {
    if (!this.enabled || this.drag || event.button !== 0 || event.isPrimary === false) return;
    const dimension = this._pick(event);
    if (!dimension) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.element.focus({ preventScroll: true });
    this._setHovered(dimension);
    this.onDragging(true);
    const derivative = this._screenDerivative(dimension === 'surface' ? 'azimuth' : dimension);
    // When an axis points towards the camera, its screen projection degenerates.
    if (derivative.lengthSq() < 0.04) derivative.set(0, dimension === 'distance' ? -65 : -3);
    this.drag = { pointerId: event.pointerId, dimension, x: event.clientX, y: event.clientY, position: { ...this.position }, derivative };
    this.element.setPointerCapture(event.pointerId);
    this.element.style.cursor = 'grabbing';
  }

  _pointerMove(event) {
    if (!this.enabled) return;
    if (!this.drag) {
      if (event.pointerType !== 'touch') {
        const dimension = this._pick(event);
        this.element.style.cursor = dimension ? 'grab' : '';
        this._setHovered(dimension);
      }
      return;
    }
    const drag = this.drag;
    if (event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const delta = new THREE.Vector2(event.clientX - drag.x, event.clientY - drag.y);
    const next = { ...drag.position };
    if (drag.dimension === 'surface') {
      const sensitivity = 180 / Math.max(240, this.element.clientHeight);
      next.azimuth += delta.x * sensitivity * (Math.sign(drag.derivative.x) || 1);
      next.elevation -= delta.y * sensitivity;
    } else {
      next[drag.dimension] += delta.dot(drag.derivative) / drag.derivative.lengthSq();
    }
    this.onChange(constrainSpherical(next));
  }

  _pointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancel();
  }

  cancel() {
    this._setHovered(null);
    if (!this.drag) return;
    const { pointerId } = this.drag;
    this.drag = null;
    if (this.element.hasPointerCapture(pointerId)) this.element.releasePointerCapture(pointerId);
    this.element.style.cursor = '';
    this.onDragging(false);
  }

  dispose() {
    this.cancel();
    this.events.abort();
    this.group.traverse(object => object.geometry?.dispose());
    this.group.removeFromParent();
    this.group.clear();
    for (const material of Object.values(this.materials)) material.dispose();
    this.pickMaterial.dispose();
    this.guideMaterial.dispose();
  }
}
