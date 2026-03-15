# Changelog

## [0.1.0] — 2026-03-14

Initial release.

- `CausticProjector` — main orchestration class with full render pipeline
- `CausticMaterial` — vertex shader caustic generation via area-ratio technique
- `ReceiverMaterial` — receiver projection with palette, gamma, warp, flicker, iridescence
- `PostProcess` — temporal accumulation, separable Gaussian blur, interference pass
- 9 built-in caster geometries: torus knot, lens, wave sheet, möbius, gyroid, wobbly bubble, ribbon, ripple disc, dented cube
- N-pass chromatic dispersion with radial and tangent-edge modes
- Interactive playground with live parameter controls
