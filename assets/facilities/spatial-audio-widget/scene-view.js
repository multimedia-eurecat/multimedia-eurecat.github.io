import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { TransformControls } from './vendor/TransformControls.js';
import { SphericalControls } from './spherical-controls.js';
import { constrainCartesian, constrainSpherical, toCartesian, toSpherical } from './coordinates.js';
import { styleCartesianHandles, HandleDepthCue, HANDLE_COLOURS } from './handle-appearance.js';
import { DEFAULT_POSITION } from './distance-model.js';

const REFERENCE_Y = 0;
const AXES = ['x', 'y', 'z'];

/** A self-contained visual source position, in metres: +x right, +y up, +z front. */
export class SceneView {
  constructor(container, { position = DEFAULT_POSITION, onChange } = {}) {
    this.container = container;
    this.onChange = onChange;
    this.disposed = false;
    this.coordinateSystem = 'cartesian';
    this.sphericalPosition = toSpherical(position);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf3f2ed);
    // Mirror only the displayed X axis. Local source coordinates and emitted
    // positions stay unchanged, so the audio keeps its existing directions.
    this.content = new THREE.Group();
    this.content.scale.x = -1;
    this.scene.add(this.content);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive 3D sound source. Drag the axis handles to move the orange sphere. Arrow keys move left, right, forward and back; Shift and up or down move vertically. Drag the background to orbit; scroll to zoom.');
    container.appendChild(canvas);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb3aca0, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 0.85);
    light.position.set(3, 7, 5);
    this.scene.add(light);

    const referencePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, 9.6),
      new THREE.MeshBasicMaterial({ color: 0xe6e4dc, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    );
    referencePlane.rotation.x = -Math.PI / 2;
    referencePlane.position.y = REFERENCE_Y - 0.005;
    this.content.add(referencePlane);

    const grid = new THREE.GridHelper(9, 18, 0xbdbab0, 0xd3d0c7);
    grid.position.y = REFERENCE_Y;
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    this.content.add(grid);
    this._addListener();
    this._addLabel('FRONT', 0, REFERENCE_Y, 4.65);
    this._addLabel('BACK', 0, REFERENCE_Y, -4.65);
    this._addLabel('LEFT', -4.65, REFERENCE_Y, 0);
    this._addLabel('RIGHT', 4.65, REFERENCE_Y, 0);
    // Keep the vertical labels inside the default camera framing.
    this._addLabel('TOP', 0, REFERENCE_Y + 3.5, 0);
    this._addLabel('BOTTOM', 0, REFERENCE_Y - 3.5, 0);

    this.source = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xe88c2b, roughness: 0.35, metalness: 0.08 }),
    );
    this.content.add(this.source);
    this.sourceLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xbb8a51, transparent: true, opacity: 0.6 }),
    );
    this.content.add(this.sourceLine);
    this.projectionLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xa39a88, transparent: true, opacity: 0.55, dashSize: 0.08, gapSize: 0.06 }),
    );
    this.content.add(this.projectionLine);
    this.projection = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.14, 32),
      new THREE.MeshBasicMaterial({ color: 0xbb8a51, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    this.projection.rotation.x = -Math.PI / 2;
    this.content.add(this.projection);
    this.axisGuides = Object.fromEntries(['x', 'z'].map(axis => [axis, new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: new THREE.Color(HANDLE_COLOURS[axis]).convertSRGBToLinear(), transparent: true, opacity: 0.55, depthWrite: false, dashSize: 0.08, gapSize: 0.06 }),
    )]));
    for (const guide of Object.values(this.axisGuides)) this.content.add(guide);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 25;
    this.controls.maxPolarAngle = Math.PI * 0.91;
    this.controls.enablePan = false;
    this._render = () => this._draw();
    this.controls.addEventListener('change', this._render);

    this.transform = new TransformControls(this.camera, canvas);
    this.transform.setMode('translate');
    this.transform.setSpace('world');
    this.handleDepthCue = new HandleDepthCue();
    styleCartesianHandles(this.transform, this.handleDepthCue);
    this.transform.attach(this.source);
    this._updateCartesianCursor = () => {
      if (this.coordinateSystem !== 'cartesian') return;
      canvas.style.cursor = this.transform.dragging ? 'grabbing' : this.transform.axis ? 'grab' : '';
    };
    this._dragChanged = (event) => {
      this.controls.enabled = !event.value;
      this._updateCartesianCursor();
    };
    this._pointerLeave = () => {
      if (this.coordinateSystem !== 'cartesian' || this.transform.dragging) return;
      this.transform.axis = null;
      canvas.style.cursor = '';
    };
    canvas.addEventListener('pointerleave', this._pointerLeave);
    this._objectChanged = () => {
      this._clampPosition(this.source.position, toCartesian(this.sphericalPosition));
      this.sphericalPosition = toSpherical(this.source.position, this.sphericalPosition);
      this._updateGuides();
      this._draw();
      this._emitPosition();
    };
    this.transform.addEventListener('dragging-changed', this._dragChanged);
    this.transform.addEventListener('axis-changed', this._updateCartesianCursor);
    this.transform.addEventListener('objectChange', this._objectChanged);
    this.transform.addEventListener('change', this._render);
    // Controls already use world positions; keep them outside the reflection.
    // Their parent-scale handling maps dragging back to local source positions.
    this.scene.add(this.transform);

    this.spherical = new SphericalControls({
      camera: this.camera, element: canvas, parent: this.content, source: this.source,
      depthCue: this.handleDepthCue,
      occluders: this.content.children.filter(object => object.isMesh && object !== this.source && !object.material.transparent),
      onDragging: dragging => { this.controls.enabled = !dragging; },
      onChange: position => this._moveSpherical(position),
      onRender: this._render,
    });

    this._keyDown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (this.coordinateSystem === 'spherical') {
        const next = { ...this.sphericalPosition };
        const angle = event.altKey ? 0.25 : 2;
        const distance = event.altKey ? 0.01 : 0.05;
        if (event.key === 'ArrowLeft') next.azimuth -= angle;
        if (event.key === 'ArrowRight') next.azimuth += angle;
        if (event.key === 'ArrowUp') next[event.shiftKey ? 'distance' : 'elevation'] += event.shiftKey ? distance : angle;
        if (event.key === 'ArrowDown') next[event.shiftKey ? 'distance' : 'elevation'] -= event.shiftKey ? distance : angle;
        this._moveSpherical(constrainSpherical(next));
        return;
      }
      const step = event.altKey ? 0.01 : 0.05;
      if (event.key === 'ArrowLeft') this.source.position.x -= step;
      if (event.key === 'ArrowRight') this.source.position.x += step;
      if (event.key === 'ArrowUp') this.source.position[event.shiftKey ? 'y' : 'z'] += step;
      if (event.key === 'ArrowDown') this.source.position[event.shiftKey ? 'y' : 'z'] -= step;
      this._objectChanged();
    };
    canvas.addEventListener('keydown', this._keyDown);
    this._focusCanvas = event => { this._pointerId = event.pointerId; canvas.focus({ preventScroll: true }); };
    canvas.addEventListener('pointerdown', this._focusCanvas);

    // The bundled TransformControls handles pointerup, but not pointercancel.
    this._cancelDrag = (event) => {
      this.transform.pointerUp({ button: 0 });
      canvas.removeEventListener('pointermove', this.transform._onPointerMove);
      this.controls.enabled = true;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      this._draw();
    };
    canvas.addEventListener('pointercancel', this._cancelDrag);

    this._resize = () => {
      if (this.disposed) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      if (width === this._width && height === this._height) return;
      this._width = width;
      this._height = height;
      this.camera.aspect = width / height;
      // Preserve the horizontal field of view when embedded in a narrow column.
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(24)) / Math.min(1, this.camera.aspect)));
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
      this._draw();
    };
    // Canvas sizing can affect flex layout; update it after the observer's delivery.
    this.resizeObserver = new ResizeObserver(() => {
      if (this._resizeFrame != null) return;
      this._resizeFrame = requestAnimationFrame(() => {
        this._resizeFrame = null;
        this._resize();
      });
    });
    this.resizeObserver.observe(container);
    this.setPosition(position);
    this.resetCamera();
    this._resize();
  }

  _addListener() {
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0x6b756e, roughness: 0.8 });
    const earMaterial = new THREE.MeshStandardMaterial({ color: 0x8a9289, roughness: 0.8 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 20), headMaterial);
    head.scale.set(0.82, 1.16, 1);
    this.content.add(head);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), earMaterial);
      ear.position.set(side * 0.18, -0.015, 0);
      ear.scale.set(0.55, 1, 0.65);
      this.content.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 12), headMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.015, 0.22);
    this.content.add(nose);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), earMaterial);
    shoulders.position.set(0, -0.37, 0);
    shoulders.scale.set(1.6, 0.42, 0.8);
    this.content.add(shoulders);
  }

  _addLabel(text, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    context.font = '500 40px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#817e73';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, depthTest: false, transparent: true, opacity: 0.9 }));
    label.position.set(x, y, z);
    label.scale.set(1.55, 0.29, 1);
    this.content.add(label);
  }

  _clampPosition(position, previous) {
    const bounded = constrainCartesian(Object.fromEntries(AXES.map(axis => [axis, Number.isFinite(position[axis]) ? position[axis] : 0])), previous);
    position.set(bounded.x, bounded.y, bounded.z);
  }

  _updateGuides() {
    const { x, y, z } = this.source.position;
    const sourceVertices = this.sourceLine.geometry.attributes.position;
    sourceVertices.setXYZ(1, x, y, z);
    sourceVertices.needsUpdate = true;
    this.sourceLine.geometry.computeBoundingSphere();
    const projectionVertices = this.projectionLine.geometry.attributes.position;
    projectionVertices.setXYZ(0, x, y, z);
    projectionVertices.setXYZ(1, x, REFERENCE_Y, z);
    projectionVertices.needsUpdate = true;
    this.projectionLine.geometry.computeBoundingSphere();
    this.projectionLine.computeLineDistances();
    const guideY = REFERENCE_Y + 0.01;
    this.projection.position.set(x, guideY, z);
    for (const [axis, guide] of Object.entries(this.axisGuides)) {
      const vertices = guide.geometry.attributes.position;
      vertices.setXYZ(0, x, guideY, z);
      vertices.setXYZ(1, axis === 'x' ? 0 : x, guideY, axis === 'z' ? 0 : z);
      vertices.needsUpdate = true;
      guide.geometry.computeBoundingSphere();
      guide.computeLineDistances();
    }
    this.spherical?.update(this.sphericalPosition);
  }

  _emitPosition() {
    const { x, y, z } = this.source.position;
    this.onChange?.({ x, y, z });
  }

  _moveSpherical(position) {
    this.sphericalPosition = { ...position };
    const point = toCartesian(position);
    this.source.position.set(point.x, point.y, point.z);
    this._updateGuides();
    this._draw();
    this.onChange?.(point, position);
  }

  setCoordinateSystem(mode) {
    const canvas = this.renderer.domElement;
    this.transform.pointerUp({ button: 0 });
    canvas.removeEventListener('pointermove', this.transform._onPointerMove);
    if (this._pointerId !== undefined && canvas.hasPointerCapture(this._pointerId)) canvas.releasePointerCapture(this._pointerId);
    this.coordinateSystem = mode;
    for (const guide of [this.projection, this.projectionLine, ...Object.values(this.axisGuides)]) {
      guide.visible = mode === 'cartesian';
    }
    this.transform.enabled = this.transform.visible = mode === 'cartesian';
    this.spherical.setEnabled(mode === 'spherical');
    this.controls.enabled = true;
    canvas.setAttribute('aria-label', mode === 'spherical'
      ? 'Interactive spherical sound source. Drag the curved azimuth and elevation handles or the radial distance arrow. Drag the sphere to change angles at a fixed distance. Arrow keys change angles; Shift and up or down change distance. Drag the background to orbit; scroll to zoom.'
      : 'Interactive Cartesian sound source. Drag the axis handles to move the orange sphere. Arrow keys move left, right, forward and back; Shift and up or down move vertically. Drag the background to orbit; scroll to zoom.');
    this._draw();
  }

  _draw() {
    if (!this.disposed) {
      // Both modes use the same camera depth measured around the listener.
      this.spherical?.updateDepthCue();
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Update the displayed position without emitting another position change. */
  setPosition(position, spherical) {
    if (this.disposed) return;
    for (const axis of AXES) this.source.position[axis] = position[axis];
    this._clampPosition(this.source.position);
    this.sphericalPosition = spherical ? { ...spherical } : toSpherical(this.source.position, this.sphericalPosition);
    this._updateGuides();
    this._draw();
  }

  resetCamera() {
    if (this.disposed) return;
    this.camera.position.set(6.2, 4.6, 7.4);
    this.controls.target.set(0, -0.3, 0);
    this.controls.update();
    this._draw();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this._resizeFrame);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('keydown', this._keyDown);
    canvas.removeEventListener('pointerdown', this._focusCanvas);
    canvas.removeEventListener('pointercancel', this._cancelDrag);
    canvas.removeEventListener('pointerleave', this._pointerLeave);
    this.spherical.dispose();
    this.controls.removeEventListener('change', this._render);
    this.controls.dispose();
    this.transform.removeEventListener('dragging-changed', this._dragChanged);
    this.transform.removeEventListener('axis-changed', this._updateCartesianCursor);
    this.transform.removeEventListener('objectChange', this._objectChanged);
    this.transform.removeEventListener('change', this._render);
    this.transform.detach();
    this.scene.remove(this.transform);
    this.transform.dispose();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        materials.add(material);
        if (material.map) textures.add(material.map);
      }
    });
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
