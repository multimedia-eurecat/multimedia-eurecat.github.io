import * as THREE from './vendor/three.module.js';

export const HANDLE_COLOURS = { x: 0xb36851, y: 0x6c8868, z: 0x5c7b96 };
export const HANDLE_HIGHLIGHT = 0xffff00;
export const HANDLE_SHAFT_RADIUS = 0.018;
export const HANDLE_HEAD_RADIUS = 0.068;
export const HANDLE_HEAD_LENGTH = 0.17;
export const handleScale = distance => Math.max(0.55, Math.min(1.4, distance / 2.5));
const CARTESIAN_SHAFT_END = 1.04;

/** Camera-relative colour and opacity fading, shared by both handle designs. */
export class HandleDepthCue {
  constructor() {
    this.uniforms = {
      handleDepthNear: { value: 0 },
      handleDepthFar: { value: 1 },
      handleHazeColour: { value: new THREE.Color(0xf3f2ed).convertSRGBToLinear() },
    };
    this.centre = new THREE.Vector3();
  }

  apply(material, nearOpacity = 1, farOpacity = 0.55) {
    material.transparent = true;
    material.depthTest = true;
    material.depthWrite = false;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms, {
        handleNearOpacity: { value: nearOpacity },
        handleFarOpacity: { value: farOpacity },
      });
      shader.vertexShader = `varying float vHandleDepth;\n${shader.vertexShader}`.replace(
        '#include <project_vertex>', '#include <project_vertex>\nvHandleDepth = -mvPosition.z;',
      );
      shader.fragmentShader = `
        varying float vHandleDepth;
        uniform float handleDepthNear;
        uniform float handleDepthFar;
        uniform vec3 handleHazeColour;
        uniform float handleNearOpacity;
        uniform float handleFarOpacity;
        ${shader.fragmentShader}`.replace('#include <output_fragment>', `
          float handleDepth = smoothstep(handleDepthNear, handleDepthFar, vHandleDepth);
          outgoingLight = mix(outgoingLight, handleHazeColour, handleDepth * 0.5);
          diffuseColor.a *= mix(handleNearOpacity, handleFarOpacity, handleDepth);
          #include <output_fragment>`);
    };
    material.customProgramCacheKey = () => 'handle-depth-cues-v1';
    return material;
  }

  update(camera, worldCentre, radius) {
    camera.updateMatrixWorld();
    this.centre.copy(worldCentre).applyMatrix4(camera.matrixWorldInverse);
    const depth = -this.centre.z;
    this.uniforms.handleDepthNear.value = depth - radius * 0.45;
    this.uniforms.handleDepthFar.value = depth + radius * 0.75;
  }
}

/** Restyle the bundled translation gizmo without changing its drag behavior. */
export function styleCartesianHandles(transform, depthCue) {
  transform.setSize(0.95);
  const gizmo = transform._gizmo;
  const removedMaterials = new Set();
  // Remove both the visible planes and their invisible hit areas. The source
  // ball retains the central picker for dragging freely in the viewing plane.
  for (const group of [gizmo.gizmo.translate, gizmo.picker.translate]) {
    for (const handle of [...group.children]) {
      if (!['XY', 'YZ', 'XZ'].includes(handle.name) && !(group === gizmo.gizmo.translate && handle.name === 'XYZ')) continue;
      group.remove(handle);
      handle.geometry.dispose();
      removedMaterials.add(handle.material);
    }
  }
  gizmo.traverse(handle => removedMaterials.delete(handle.material));
  for (const material of removedMaterials) material.dispose();
  const materials = new Set();
  const palette = new Map([[0xff0000, HANDLE_COLOURS.x], [0x00ff00, HANDLE_COLOURS.y], [0x0000ff, HANDLE_COLOURS.z]]);
  gizmo.traverse(handle => {
    const material = handle.material;
    if (!material?.color || materials.has(material)) return;
    materials.add(material);
    material.depthTest = true;
    const colour = palette.get((material._color || material.color).getHex());
    if (colour === undefined) return;
    material.color.setHex(colour).convertSRGBToLinear();
    // TransformControls caches this colour and restores it after highlighting.
    material._color = material.color.clone();
    depthCue.apply(material);
  });

  const direction = axis => new THREE.Vector3(axis === 'X' ? 1 : 0, axis === 'Y' ? 1 : 0, axis === 'Z' ? 1 : 0);
  const replaceGeometry = (handle, geometry) => {
    handle.geometry.dispose();
    handle.geometry = geometry;
  };
  const worldSizedHandles = [];
  for (const handle of [...gizmo.gizmo.translate.children]) {
    if (!['X', 'Y', 'Z'].includes(handle.name)) continue;
    const parameters = handle.geometry.parameters;
    if (!parameters) continue;
    if (parameters.radiusTop === 0) {
      handle.geometry.computeBoundingBox();
      const centre = handle.geometry.boundingBox.getCenter(new THREE.Vector3());
      const sign = Math.sign(centre[handle.name.toLowerCase()]) || 1;
      const axis = direction(handle.name).multiplyScalar(sign);
      const geometry = new THREE.ConeGeometry(HANDLE_HEAD_RADIUS, HANDLE_HEAD_LENGTH, 16);
      geometry.translate(0, HANDLE_HEAD_LENGTH / 2, 0);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis));
      geometry.translate(axis.x * CARTESIAN_SHAFT_END, axis.y * CARTESIAN_SHAFT_END, axis.z * CARTESIAN_SHAFT_END);
      replaceGeometry(handle, geometry);
      worldSizedHandles.push({ handle, axis, part: 'head' });
    } else if (Number.isFinite(parameters.radiusTop) && parameters.radiusTop === parameters.radiusBottom) {
      const lengthAxis = handle.name.toLowerCase();
      const opposite = handle.clone();
      gizmo.gizmo.translate.add(opposite);
      for (const [shaft, sign] of [[handle, 1], [opposite, -1]]) {
        const axis = direction(handle.name).multiplyScalar(sign);
        const geometry = new THREE.CylinderGeometry(HANDLE_SHAFT_RADIUS, HANDLE_SHAFT_RADIUS, 1, 10);
        geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis));
        // The clone initially shares the original geometry, which is disposed
        // when replacing the first shaft.
        if (shaft === handle) replaceGeometry(shaft, geometry);
        else shaft.geometry = geometry;
        worldSizedHandles.push({ handle: shaft, axis, lengthAxis, part: 'shaft' });
      }
    }
  }
  // Give each arrow a matching hit area, and keep the central target on the ball.
  for (const handle of gizmo.picker.translate.children) {
    if (handle.name === 'XYZ') {
      replaceGeometry(handle, new THREE.SphereGeometry(1, 16, 12));
      worldSizedHandles.push({ handle, part: 'source' });
      continue;
    }
    if (!['X', 'Y', 'Z'].includes(handle.name)) continue;
    handle.geometry.computeBoundingBox();
    const centre = handle.geometry.boundingBox.getCenter(new THREE.Vector3());
    const axis = direction(handle.name).multiplyScalar(Math.sign(centre[handle.name.toLowerCase()]) || 1);
    const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis));
    replaceGeometry(handle, geometry);
    worldSizedHandles.push({ handle, axis, lengthAxis: handle.name.toLowerCase(), part: 'picker' });
  }

  // Native TransformControls scales for a constant on-screen size. Normalize
  // after its update so rendering, culling and raycasting all use world sizes.
  const updateMatrixWorld = gizmo.updateMatrixWorld;
  gizmo.updateMatrixWorld = function (force) {
    updateMatrixWorld.call(this, force);
    if (this.mode !== 'translate' || !transform.object) return;
    // Cartesian handles keep a fixed size, independent of listener distance.
    const scale = 1;
    const radius = transform.object.geometry.parameters.radius || 0.16;
    const gap = radius + 0.035;
    for (const { handle, axis, lengthAxis, part } of worldSizedHandles) {
      handle.position.copy(this.worldPosition);
      handle.scale.setScalar(part === 'source' ? radius : scale);
      if (part === 'shaft' || part === 'picker') {
        const end = (CARTESIAN_SHAFT_END + (part === 'picker' ? HANDLE_HEAD_LENGTH + 0.04 : 0)) * scale;
        handle.position.addScaledVector(axis, (gap + end) / 2);
        handle.scale[lengthAxis] = end - gap;
      }
    }
    THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
  };
}
