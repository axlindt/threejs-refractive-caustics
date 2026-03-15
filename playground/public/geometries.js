
// 0: twisted torus knot
const geoKnot = new THREE.TorusKnotGeometry(0.38, 0.13, 240, 36, 2, 3);
(() => {
  const pos = geoKnot.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const twist = y * 1.2;
    pos.setXYZ(i, x*Math.cos(twist)-z*Math.sin(twist), y, x*Math.sin(twist)+z*Math.cos(twist));
  }
  pos.needsUpdate = true;
  geoKnot.computeVertexNormals();
})();

// 1: lens
const geoLens = (() => {
  const geo = new THREE.SphereGeometry(1.2, 128, 64);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    pos.setXYZ(i, x, y * 0.12, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
})();

// 2: crumpled sheet
const geoCrumple = (() => {
  const geo = new THREE.PlaneGeometry(2.4, 2.4, 96, 96);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const z = 0.28 * Math.sin(x * 3.8) * Math.cos(y * 3.1)
            + 0.16 * Math.sin(x * 7.2 + 1.0)
            + 0.10 * Math.cos(y * 5.5 + 2.0)
            + 0.07 * Math.sin((x+y) * 9.0);
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.rotateX(-Math.PI / 2);
  return geo;
})();

// 3: möbius
const geoMobius = (() => {
  const R = 0.82, w = 0.34, segsU = 300, segsV = 32;
  const verts = [], indices = [];
  for (let j = 0; j <= segsV; j++) {
    for (let i = 0; i <= segsU; i++) {
      const u = (i / segsU) * Math.PI * 4; // 0 → 4π to close
      const v = (j / segsV - 0.5) * w;
      const x = (R + v * Math.cos(u * 0.5)) * Math.cos(u);
      const y = (R + v * Math.cos(u * 0.5)) * Math.sin(u);
      const z = v * Math.sin(u * 0.5);
      verts.push(x, z, y);
    }
  }
  for (let j = 0; j < segsV; j++) {
    for (let i = 0; i < segsU; i++) {
      const a = j*(segsU+1)+i, b = a+1, c = a+(segsU+1), d = c+1;
      indices.push(a,b,d, a,d,c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
})()
// 4: gyroid
const geoGyroid = (() => {
  const verts = [], indices = [];
  const uSegs = 180, vSegs = 60;
  for (let j = 0; j <= vSegs; j++) {
    for (let i = 0; i <= uSegs; i++) {
      const u = (i / uSegs) * Math.PI * 2;
      const v = (j / vSegs) * Math.PI * 2;
      const R = 0.65, r = 0.28;
      const amp = 0.18;
      const x = (R + r * Math.cos(v)) * Math.cos(u) + amp * Math.sin(2*u) * Math.cos(3*v);
      const y = (R + r * Math.cos(v)) * Math.sin(u) + amp * Math.cos(3*u) * Math.sin(2*v);
      const z = r * Math.sin(v) + amp * Math.sin(3*u + v);
      verts.push(x, z, y);
    }
  }
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j*(uSegs+1)+i, b = a+1, c = a+(uSegs+1), d = c+1;
      indices.push(a,b,d, a,d,c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
})();

// 5: bubble
const geoBubble = (() => {
  const geo = new THREE.SphereGeometry(0.92, 96, 80);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 0.06 * Math.sin(x * 5.1 + y * 3.7)
            + 0.04 * Math.cos(y * 6.3 + z * 4.1)
            + 0.03 * Math.sin(z * 7.2 + x * 2.9);
    const len = Math.sqrt(x*x+y*y+z*z);
    pos.setXYZ(i, x*(1+n/len), y*(1+n/len), z*(1+n/len));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
})();

// 6: ribbon
const geoRibbon = (() => {
  const segs = 240, width = 0.44, thickness = 0.055, turns = 2, radius = 0.78;
  const verts = [], indices = [];
  // 4 rows: front-left, front-right, back-left, back-right
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const angle = t * Math.PI * 2;
    const twist = t * Math.PI * turns * 2;
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;
    // tangent and normal in the ring plane
    const tx = -Math.sin(angle), ty = Math.cos(angle);
    // width direction (twisted)
    const wx = Math.cos(twist)*tx,  wy = Math.cos(twist)*ty,  wz = Math.sin(twist)*width*0.5;
    // thickness direction (perpendicular to width, twisted)
    const hx = -Math.sin(twist)*tx*thickness, hy = -Math.sin(twist)*ty*thickness, hz = Math.cos(twist)*thickness;
    // front face (offset +h), back face (offset -h)
    verts.push(cx + wx - hx,  wz - hz, cy + wy - hy);   // front left
    verts.push(cx - wx - hx, -wz - hz, cy - wy - hy);   // front right
    verts.push(cx + wx + hx,  wz + hz, cy + wy + hy);   // back left
    verts.push(cx - wx + hx, -wz + hz, cy - wy + hy);   // back right
  }
  for (let i = 0; i < segs; i++) {
    const o = i*4;
    const a=o,b=o+1,c=o+2,d=o+3;
    const A=o+4,B=o+5,C=o+6,D=o+7;
    // front face
    indices.push(a,b,B, a,B,A);
    // back face
    indices.push(c,D,d, c,C,D);
    // left edge
    indices.push(a,C,c, a,A,C);
    // right edge
    indices.push(b,d,D, b,D,B);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
})();


// 7: ripple disc
const geoRipple = (() => {
  const rings = 80, segs = 100;
  const verts = [], indices = [];
  // centre vertex
  verts.push(0, 0, 0);
  for (let ri = 1; ri <= rings; ri++) {
    const r = (ri / rings) * 1.1;
    const z = 0.13 * Math.sin(r * 14.0) * Math.exp(-r * 1.1);
    for (let si = 0; si < segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      verts.push(r * Math.cos(a), z, r * Math.sin(a));
    }
  }
  // inner ring around centre
  for (let si = 0; si < segs; si++) {
    const a = si, b = (si+1) % segs;
    indices.push(0, 1+a, 1+b);
  }
  for (let ri = 1; ri < rings; ri++) {
    const rowA = 1 + (ri-1)*segs;
    const rowB = 1 + ri*segs;
    for (let si = 0; si < segs; si++) {
      const a = rowA + si, b = rowA + (si+1)%segs;
      const c = rowB + si, d = rowB + (si+1)%segs;
      indices.push(a,b,d, a,d,c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
})();


// 8: dented cube
const geoStar = (() => {
  const geo = new THREE.BoxGeometry(1.4, 1.4, 1.4, 48, 48, 48);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    if (ax >= ay && ax >= az) {
      const d = Math.sqrt(y*y + z*z) / 0.7;
      pos.setX(i, x - Math.sign(x) * 0.22 * Math.max(0, 1 - d*d));
    } else if (ay >= ax && ay >= az) {
      const d = Math.sqrt(x*x + z*z) / 0.7;
      pos.setY(i, y - Math.sign(y) * 0.22 * Math.max(0, 1 - d*d));
    } else {
      const d = Math.sqrt(x*x + y*y) / 0.7;
      pos.setZ(i, z - Math.sign(z) * 0.22 * Math.max(0, 1 - d*d));
    }
    const twist = pos.getY(i) * 0.3;
    const cx = pos.getX(i), cz = pos.getZ(i);
    pos.setX(i, cx * Math.cos(twist) - cz * Math.sin(twist));
    pos.setZ(i, cx * Math.sin(twist) + cz * Math.cos(twist));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
})()
// 9: flat plane — ideal for pool caustics with wave displacement
const geoFlat = (() => {
  const geo = new THREE.PlaneGeometry(2.2, 2.2, 128, 128);
  geo.rotateX(-Math.PI / 2);
  return geo;
})();

const casterGeos = [geoKnot, geoLens, geoCrumple, geoMobius, geoGyroid, geoBubble, geoRibbon, geoRipple, geoStar, geoFlat];
