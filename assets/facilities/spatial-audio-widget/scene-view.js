import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { TransformControls } from './vendor/TransformControls.js';

const FLOOR_Y = -1.5;
const AXES = ['x', 'y', 'z'];

/** A self-contained visual source position, in metres: +x right, +y up, +z front. */
export class SceneView {
  constructor(container, { position = { x: 0, y: 0, z: 1.5 }, onChange } = {}) {
    this.container = container;
    this.onChange = onChange;
    this.disposed = false;
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

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, 9.6),
      new THREE.MeshBasicMaterial({ color: 0xe6e4dc, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y - 0.005;
    this.content.add(floor);

    const grid = new THREE.GridHelper(9, 18, 0xbdbab0, 0xd3d0c7);
    grid.position.y = FLOOR_Y;
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    this.content.add(grid);
    this._addListener();
    this._addLabel('FRONT', 0, FLOOR_Y + 0.04, 4.65);
    this._addLabel('BACK', 0, FLOOR_Y + 0.04, -4.65);
    this._addLabel('LEFT', -4.65, FLOOR_Y + 0.04, 0);
    this._addLabel('RIGHT', 4.65, FLOOR_Y + 0.04, 0);

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
    this.transform.setSize(0.85);
    this.transform.attach(this.source);
    this._dragChanged = (event) => { this.controls.enabled = !event.value; };
    this._objectChanged = () => {
      this._clampPosition(this.source.position);
      this._updateGuides();
      this._draw();
      this._emitPosition();
    };
    this.transform.addEventListener('dragging-changed', this._dragChanged);
    this.transform.addEventListener('objectChange', this._objectChanged);
    this.transform.addEventListener('change', this._render);
    // Controls already use world positions; keep them outside the reflection.
    // Their parent-scale handling maps dragging back to local source positions.
    this.scene.add(this.transform);

    this._keyDown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.altKey ? 0.01 : 0.05;
      if (event.key === 'ArrowLeft') this.source.position.x -= step;
      if (event.key === 'ArrowRight') this.source.position.x += step;
      if (event.key === 'ArrowUp') this.source.position[event.shiftKey ? 'y' : 'z'] += step;
      if (event.key === 'ArrowDown') this.source.position[event.shiftKey ? 'y' : 'z'] -= step;
      this._objectChanged();
    };
    canvas.addEventListener('keydown', this._keyDown);
    this._focusCanvas = () => canvas.focus({ preventScroll: true });
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
      this.camera.aspect = width / height;
      // Preserve the horizontal field of view when embedded in a narrow column.
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(24)) / Math.min(1, this.camera.aspect)));
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
      this._draw();
    };
    this.resizeObserver = new ResizeObserver(this._resize);
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

  _clampPosition(position) {
    for (const axis of AXES) {
      const value = Number(position[axis]);
      position[axis] = Number.isFinite(value) ? THREE.MathUtils.clamp(value, -4, 4) : 0;
    }
  }

  _updateGuides() {
    const { x, y, z } = this.source.position;
    const sourceVertices = this.sourceLine.geometry.attributes.position;
    sourceVertices.setXYZ(1, x, y, z);
    sourceVertices.needsUpdate = true;
    this.sourceLine.geometry.computeBoundingSphere();
    const projectionVertices = this.projectionLine.geometry.attributes.position;
    projectionVertices.setXYZ(0, x, y, z);
    projectionVertices.setXYZ(1, x, FLOOR_Y, z);
    projectionVertices.needsUpdate = true;
    this.projectionLine.geometry.computeBoundingSphere();
    this.projectionLine.computeLineDistances();
    this.projection.position.set(x, FLOOR_Y + 0.01, z);
  }

  _emitPosition() {
    const { x, y, z } = this.source.position;
    this.onChange?.({ x, y, z });
  }

  _draw() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  /** Update the displayed position without emitting another position change. */
  setPosition(position) {
    if (this.disposed) return;
    for (const axis of AXES) this.source.position[axis] = position[axis];
    this._clampPosition(this.source.position);
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
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('keydown', this._keyDown);
    canvas.removeEventListener('pointerdown', this._focusCanvas);
    canvas.removeEventListener('pointercancel', this._cancelDrag);
    this.controls.removeEventListener('change', this._render);
    this.controls.dispose();
    this.transform.removeEventListener('dragging-changed', this._dragChanged);
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
