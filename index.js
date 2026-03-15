/**
 * threejs-refractive-caustics
 *
 * Physically-inspired caustic light patterns for Three.js.
 * GPU ray-marching caustic projection with N-pass chromatic dispersion,
 * temporal accumulation, Gaussian blur, and a screen-space glass shader.
 *
 * @see https://github.com/YOUR_USERNAME/threejs-refractive-caustics
 */

export { CausticProjector }  from './src/CausticProjector.js';
export { CausticMaterial }   from './src/CausticMaterial.js';
export { ReceiverMaterial }  from './src/ReceiverMaterial.js';
export { PostProcess }       from './src/PostProcess.js';
export {
  torusKnotGeometry,
  lensGeometry,
  waveSheetGeometry,
  mobiusGeometry,
  gyroidGeometry,
  wobblyBubbleGeometry,
  ribbonGeometry,
  rippleDiscGeometry,
  dentedCubeGeometry,
  geometries,
} from './src/geometries.js';
