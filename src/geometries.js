import * as THREE from 'three';

export function torusKnotGeometry() {
  const geo = new THREE.TorusKnotGeometry(0.38, 0.13, 180, 24, 2, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),t=y*1.2;
    pos.setXYZ(i, x*Math.cos(t)-z*Math.sin(t), y, x*Math.sin(t)+z*Math.cos(t));
  }
  pos.needsUpdate=true; geo.computeVertexNormals(); return geo;
}

export function lensGeometry() {
  const geo = new THREE.SphereGeometry(1.2,64,32);
  const pos = geo.attributes.position;
  for (let i=0;i<pos.count;i++) pos.setY(i, pos.getY(i)*0.12);
  pos.needsUpdate=true; geo.computeVertexNormals(); return geo;
}

export function waveSheetGeometry() {
  const geo = new THREE.PlaneGeometry(2.4,2.4,64,64);
  const pos = geo.attributes.position;
  for (let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i);
    pos.setZ(i, 0.28*Math.sin(x*3.8)*Math.cos(y*3.1)+0.16*Math.sin(x*7.2+1)+0.10*Math.cos(y*5.5+2)+0.07*Math.sin((x+y)*9));
  }
  pos.needsUpdate=true; geo.computeVertexNormals(); geo.rotateX(-Math.PI/2); return geo;
}

export function mobiusGeometry() {
  const R=0.82,w=0.34,sU=300,sV=16; const verts=[],idx=[];
  for (let j=0;j<=sV;j++) for (let i=0;i<=sU;i++) {
    const u=(i/sU)*Math.PI*4,v=(j/sV-0.5)*w;
    verts.push((R+v*Math.cos(u*.5))*Math.cos(u), v*Math.sin(u*.5), (R+v*Math.cos(u*.5))*Math.sin(u));
  }
  for (let j=0;j<sV;j++) for (let i=0;i<sU;i++) {
    const a=j*(sU+1)+i,b=a+1,c=a+(sU+1),d=c+1; idx.push(a,b,d,a,d,c);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}

export function gyroidGeometry() {
  const sU=120,sV=30,R=0.65,r=0.28,amp=0.18; const verts=[],idx=[];
  for (let j=0;j<=sV;j++) for (let i=0;i<=sU;i++) {
    const u=(i/sU)*Math.PI*2,v=(j/sV)*Math.PI*2;
    verts.push((R+r*Math.cos(v))*Math.cos(u)+amp*Math.sin(2*u)*Math.cos(3*v),
               r*Math.sin(v)+amp*Math.sin(3*u+v),
               (R+r*Math.cos(v))*Math.sin(u)+amp*Math.cos(3*u)*Math.sin(2*v));
  }
  for (let j=0;j<sV;j++) for (let i=0;i<sU;i++) {
    const a=j*(sU+1)+i,b=a+1,c=a+(sU+1),d=c+1; idx.push(a,b,d,a,d,c);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}

export function wobblyBubbleGeometry() {
  const geo=new THREE.SphereGeometry(0.92,80,60);
  const pos=geo.attributes.position;
  for (let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const n=0.06*Math.sin(x*5.1+y*3.7)+0.04*Math.cos(y*6.3+z*4.1)+0.03*Math.sin(z*7.2+x*2.9);
    const l=Math.sqrt(x*x+y*y+z*z);
    pos.setXYZ(i,x*(1+n/l),y*(1+n/l),z*(1+n/l));
  }
  pos.needsUpdate=true; geo.computeVertexNormals(); return geo;
}

export function ribbonGeometry() {
  const segs=160,w=0.44,th=0.055,turns=2,R=0.78; const verts=[],idx=[];
  for (let i=0;i<=segs;i++) {
    const t=i/segs,a=t*Math.PI*2,tw=t*Math.PI*turns*2;
    const cx=Math.cos(a)*R,cy=Math.sin(a)*R,tx=-Math.sin(a),ty=Math.cos(a);
    const wx=Math.cos(tw)*tx,wy=Math.cos(tw)*ty,wz=Math.sin(tw)*w*.5;
    const hx=-Math.sin(tw)*tx*th,hy=-Math.sin(tw)*ty*th,hz=Math.cos(tw)*th;
    verts.push(cx+wx-hx,wz-hz,cy+wy-hy, cx-wx-hx,-wz-hz,cy-wy-hy,
               cx+wx+hx,wz+hz,cy+wy+hy, cx-wx+hx,-wz+hz,cy-wy+hy);
  }
  for (let i=0;i<segs;i++) {
    const o=i*4,a=o,b=o+1,c=o+2,d=o+3,A=o+4,B=o+5,C=o+6,D=o+7;
    idx.push(a,b,B,a,B,A, c,D,d,c,C,D, a,C,c,a,A,C, b,d,D,b,D,B);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}

export function rippleDiscGeometry() {
  const rings=60,segs=80; const verts=[0,0,0],idx=[];
  for (let ri=1;ri<=rings;ri++) {
    const r=(ri/rings)*1.1,z=0.13*Math.sin(r*14)*Math.exp(-r*1.1);
    for (let si=0;si<segs;si++) { const a=(si/segs)*Math.PI*2; verts.push(r*Math.cos(a),z,r*Math.sin(a)); }
  }
  for (let si=0;si<segs;si++) idx.push(0,1+si,1+(si+1)%segs);
  for (let ri=1;ri<rings;ri++) {
    const rA=1+(ri-1)*segs,rB=1+ri*segs;
    for (let si=0;si<segs;si++) { const a=rA+si,b=rA+(si+1)%segs,c=rB+si,d=rB+(si+1)%segs; idx.push(a,b,d,a,d,c); }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}

export function dentedCubeGeometry() {
  const geo=new THREE.BoxGeometry(1.4,1.4,1.4,32,32,32);
  const pos=geo.attributes.position;
  for (let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const ax=Math.abs(x),ay=Math.abs(y),az=Math.abs(z);
    if (ax>=ay&&ax>=az) pos.setX(i,x-Math.sign(x)*0.22*Math.max(0,1-(y*y+z*z)/0.49));
    else if (ay>=ax&&ay>=az) pos.setY(i,y-Math.sign(y)*0.22*Math.max(0,1-(x*x+z*z)/0.49));
    else pos.setZ(i,z-Math.sign(z)*0.22*Math.max(0,1-(x*x+y*y)/0.49));
    const tw=pos.getY(i)*0.3,cx=pos.getX(i),cz=pos.getZ(i);
    pos.setX(i,cx*Math.cos(tw)-cz*Math.sin(tw)); pos.setZ(i,cx*Math.sin(tw)+cz*Math.cos(tw));
  }
  pos.needsUpdate=true; geo.computeVertexNormals(); return geo;
}

export const geometries = {
  'torus knot':    torusKnotGeometry,
  'lens':          lensGeometry,
  'wave sheet':    waveSheetGeometry,
  'möbius':        mobiusGeometry,
  'gyroid':        gyroidGeometry,
  'wobbly bubble': wobblyBubbleGeometry,
  'ribbon':        ribbonGeometry,
  'ripple disc':   rippleDiscGeometry,
  'dented cube':   dentedCubeGeometry,
};
