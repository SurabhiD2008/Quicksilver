'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * MercuryScene renders the fixed UI (canvas, vignette, epilogue veil, wordmark,
 * frosted header/footer bars, HUD, zone label, credit, custom cursor) and runs the liquid-metal Three.js
 * scene inside a useEffect with full teardown for React Strict Mode.
 *
 * Rendering: the metal is a true mirror. Every surface reflects a procedural
 * HDR photo-studio (softboxes, strip lights, a horizon line) by world-space
 * reflection vector, with Fresnel. The main drop also reflects the droplets and
 * beads through a live cube capture, and they reflect it back analytically.
 * The frame is rendered in linear HDR, then bloomed, tone-mapped (ACES) and
 * finished with a trace of lens fringing and film grain.
 */
export default function MercuryScene() {
  const holderRef = useRef(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    // Fresh canvas per mount so Strict Mode's double-invoke never reuses a
    // WebGL context that was already torn down.
    const canvas = document.createElement('canvas');
    canvas.id = 'stage';
    holder.appendChild(canvas);

    const cleanups = [];
    const on = (target, type, handler, opts) => {
      target.addEventListener(type, handler, opts);
      cleanups.push(() => target.removeEventListener(type, handler, opts));
    };

    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const IS_TOUCH = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // Linear HDR buffers need float render targets; fall back to 8-bit if not.
    const GL2 = renderer.capabilities.isWebGL2;
    const HDR = GL2
      ? renderer.extensions.has('EXT_color_buffer_float')
      : renderer.extensions.has('EXT_color_buffer_half_float') && renderer.extensions.has('OES_texture_half_float_linear');
    const BUF_TYPE = HDR ? THREE.HalfFloatType : THREE.UnsignedByteType;

    // ── Display transform (shared by the final pass and by colour authoring) ─
    // Everything in the scene is linear HDR; the final pass applies ACES + gamma.
    // toScene() inverts that, so a colour authored for the screen (a CSS hex)
    // still lands on exactly that colour after tone-mapping.
    const invAces = (y) => {
      y = Math.min(Math.max(y, 0), 0.999);
      const A = 2.43 * y - 2.51, B = 0.59 * y - 0.03, C = 0.14 * y;
      return (-B - Math.sqrt(Math.max(B * B - 4 * A * C, 0))) / (2 * A);
    };
    const toScene = (v) => invAces(Math.pow(v, 2.2));
    const sceneColor = (hex) => {
      const c = new THREE.Color(hex);
      return c.setRGB(toScene(c.r), toScene(c.g), toScene(c.b));
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 5.6);
    let camDist = 5.6;   // resting camera distance; widened on narrow screens

    const BG_WARM = sceneColor('#0d0a0e');
    const BG_COOL = sceneColor('#070a10');
    scene.background = BG_WARM.clone();

    // ── Procedural HDR studio ───────────────────────────────────────────────
    // What the metal reflects: a dark photo studio lit by softboxes and strip
    // lights, evaluated analytically per pixel (so it is infinitely sharp) in
    // linear HDR — the lights are many times brighter than white, which is what
    // makes the highlights bloom and the chrome read as real metal.
    const envUniforms = { uEnvRot: { value: 0 }, uEnvTilt: { value: 0 } };

    const STUDIO_GLSL = `
uniform float uEnvRot;
uniform float uEnvTilt;

float softbox(vec3 d, vec3 c, vec2 hs, float soft){
  float k = dot(d, c);
  if(k < 0.05) return 0.0;
  vec3 u = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 v = cross(c, u);
  vec2 q = abs(vec2(dot(d, u), dot(d, v)) / k);
  vec2 e = 1.0 - smoothstep(hs - soft, hs + soft, q);
  vec2 n = q / hs;
  return e.x * e.y * (1.0 - 0.22 * dot(n, n));   // diffuser: hotter in the middle
}
float pin(vec3 d, vec3 c, float tight){ return pow(max(dot(d, c), 0.0), tight); }

vec3 studio(vec3 d){
  float cs = cos(uEnvRot), sn = sin(uEnvRot);
  d = vec3(cs * d.x + sn * d.z, d.y, cs * d.z - sn * d.x);
  cs = cos(uEnvTilt); sn = sin(uEnvTilt);
  d = vec3(d.x, cs * d.y + sn * d.z, cs * d.z - sn * d.y);
  float y = d.y;

  // room: soft grey ceiling falling to a near-black floor
  vec3 col = mix(vec3(0.020, 0.022, 0.032), vec3(0.105, 0.120, 0.165), smoothstep(-0.05, 1.0, y));
  col = mix(vec3(0.0045, 0.0045, 0.0075), col, smoothstep(-0.42, 0.03, y));
  // the crisp horizon seam of the cyclorama, with a little haze around it
  col += vec3(0.74, 0.84, 1.0) * (exp(-y * y * 5200.0) * 0.85 + exp(-y * y * 70.0) * 0.05);

  // key softbox (front, high left), cool strip (right), two rim strips behind
  col += vec3(1.00, 0.97, 0.93) * 8.5 * softbox(d, normalize(vec3(0.0, 0.62, 0.78)), vec2(0.50, 0.34), 0.03);
  col += vec3(0.80, 0.92, 1.00) * 4.2 * softbox(d, normalize(vec3(0.86, 0.04, 0.50)), vec2(0.09, 0.72), 0.02);
  col += vec3(0.85, 0.91, 1.00) * 5.0 * softbox(d, normalize(vec3(-0.80, 0.20, -0.56)), vec2(0.20, 0.90), 0.04);
  col += vec3(1.00, 0.84, 0.92) * 4.0 * softbox(d, normalize(vec3(0.74, 0.36, -0.56)), vec2(0.16, 0.80), 0.04);
  // overhead bank
  col += vec3(0.90, 0.95, 1.00) * 2.0 * smoothstep(0.87, 0.97, y);

  // coloured gels — the pink / cyan / violet / gold of the page palette
  col += vec3(1.00, 0.59, 0.80) * 0.34 * pin(d, normalize(vec3(-0.70, 0.30, -0.25)), 5.0);
  col += vec3(0.59, 0.92, 1.00) * 0.34 * pin(d, normalize(vec3(0.80, 0.28, 0.15)), 5.0);
  col += vec3(0.75, 0.63, 1.00) * 0.30 * pin(d, normalize(vec3(-0.25, -0.62, 0.50)), 4.0);
  col += vec3(1.00, 0.88, 0.63) * 0.24 * pin(d, normalize(vec3(0.45, -0.66, 0.30)), 5.0);

  // bare practicals: tiny, very hot — these are the glints
  col += vec3(1.00, 0.98, 0.95) * 60.0 * pin(d, normalize(vec3(0.30, 0.52, 0.80)), 9000.0);
  col += vec3(0.85, 0.93, 1.00) * 45.0 * pin(d, normalize(vec3(-0.62, -0.18, 0.76)), 12000.0);
  col += vec3(1.00, 0.90, 0.96) * 45.0 * pin(d, normalize(vec3(0.10, 0.80, -0.58)), 12000.0);
  return col;
}

// Schlick Fresnel for liquid mercury (bright, faintly cool reflectance).
const vec3 F0 = vec3(0.79, 0.81, 0.85);
vec3 fresnel(float ndv){ return F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0); }

// One-bounce reflection of the main drop (a sphere of radius rad at the
// origin) as seen along ray P + t*R. Returns its colour and coverage.
vec4 dropBounce(vec3 P, vec3 R, float rad){
  float b = dot(P, R);
  float h = b * b - (dot(P, P) - rad * rad);
  if(h <= 0.0 || b >= 0.0) return vec4(0.0);
  vec3 hn = normalize(P + R * (-b - sqrt(h)));
  vec3 r2 = reflect(R, hn);
  float cover = smoothstep(0.0, 0.02 * rad * rad, h);
  return vec4(studio(r2) * fresnel(max(dot(-R, hn), 0.0)), cover);
}`;

    // ── Shaders ─────────────────────────────────────────────────────────────
    const MAX_RIPPLES = 3;

    const NOISE_GLSL = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+1.0*C.xxx; vec3 x2=x0-i2+2.0*C.xxx; vec3 x3=x0-1.0+3.0*C.xxx;
  i=mod(i,289.0);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=1.0/7.0; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){
  // Three octaves with a steep falloff: liquid under surface tension has broad,
  // glassy swells, not fine crumple (which reads as foil in a mirror finish).
  float f=0.0, amp=0.5;
  for(int i=0;i<3;i++){ f+=amp*snoise(p); p*=2.02; amp*=0.36; }
  return f;
}`;

    const VERTEX = `
${NOISE_GLSL}
uniform float uTime;
uniform float uHeat;
uniform float uReduced;
uniform float uRippleTime[${MAX_RIPPLES}];
uniform vec3  uRipplePos[${MAX_RIPPLES}];
uniform float uRippleStr[${MAX_RIPPLES}];

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vDisp;

float getDisp(vec3 dir){
  float ambScale = mix(1.0, 0.12, uReduced);
  // Fine swell stays small; warmth mostly adds broad, slow lobes (one smooth
  // octave), so the molten drop sags and bulges like liquid rather than crumpling.
  float amb = fbm(dir * 0.6 + vec3(0.0, uTime * 0.10, uTime * 0.06));
  float base = amb * (0.06 + uHeat * 0.12) * ambScale;
  base += snoise(dir * 0.42 + vec3(uTime * 0.05, -uTime * 0.035, uTime * 0.03)) * uHeat * 0.26 * ambScale;

  float r = 0.0;
  for(int i=0;i<${MAX_RIPPLES};i++){
    float age = uTime - uRippleTime[i];
    if(uRippleStr[i] > 0.001 && age > 0.0 && age < 2.2){
      float dist = distance(dir, normalize(uRipplePos[i]));
      float decay = exp(-age * 1.9) * (1.0 - age / 2.2);
      float wave  = sin(dist * 16.0 - age * 11.0);
      float fall  = exp(-dist * 3.2);
      r += wave * fall * decay * uRippleStr[i] * 0.20;
    }
  }
  return base + r;
}

void main(){
  vec3 dir = normalize(position);

  float d0 = getDisp(dir);
  vDisp = d0;
  vec3 p0 = dir * (1.0 + d0);

  vec3 t = normalize(cross(dir, abs(dir.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
  vec3 b = normalize(cross(dir, t));
  float eps = 0.02;
  vec3 dirT = normalize(dir + t * eps);
  vec3 dirB = normalize(dir + b * eps);
  vec3 pT = dirT * (1.0 + getDisp(dirT));
  vec3 pB = dirB * (1.0 + getDisp(dirB));
  vec3 n = normalize(cross(pT - p0, pB - p0));
  if(dot(n, dir) < 0.0) n = -n;

  // normalMatrix keeps the normal right when the drop is pressed into a plaque
  // (non-uniform scale); the view rotation is then undone to get world space.
  vec3 vn = normalize(normalMatrix * n);
  vWorldNormal = normalize((vec4(vn, 0.0) * viewMatrix).xyz);
  vec4 wp = modelMatrix * vec4(p0, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

    const FRAGMENT = `
${STUDIO_GLSL}
uniform float uHeat;
uniform float uTime;
uniform vec3 uTint;
uniform float uBlobR;
#ifdef USE_CUBE
uniform samplerCube uCube;
#endif
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vDisp;

void main(){
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 R = reflect(-V, N);

  vec3 col = studio(R);
#ifdef USE_CUBE
  // live capture of the droplets and beads around the drop (premultiplied)
  vec4 live = textureCube(uCube, R);
  col = col * (1.0 - live.a) + live.rgb;
#else
  // droplets carry a reflection of the main drop
  vec4 bounce = dropBounce(vWorldPos, R, uBlobR);
  col = mix(col, bounce.rgb, bounce.a);
#endif
  col *= fresnel(ndv);

  // warmth tints the metal; troughs of the surface catch a little less light
  col *= mix(vec3(1.0), uTint, uHeat * 0.45);
  col *= 1.0 + clamp(vDisp, -0.3, 0.12) * 0.8;

  // thin-film sheen at grazing angles
  float fres = pow(1.0 - ndv, 3.2);
  vec3 irid = 0.55 + 0.45 * cos(6.2831 * (fres * 1.3 + vec3(0.0, 0.33, 0.66)) + uTime * 0.25);
  col += fres * irid * 0.07;

  gl_FragColor = vec4(col, 1.0);
}`;

    const uniforms = {
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uReduced: { value: REDUCED ? 1 : 0 },
      uEnvRot: envUniforms.uEnvRot,
      uEnvTilt: envUniforms.uEnvTilt,
      uBlobR: { value: 0 },
      uCube: { value: null },
      uTint: { value: new THREE.Color('#ffd9c0') },
      uRippleTime: { value: new Array(MAX_RIPPLES).fill(-100) },
      uRipplePos: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(1, 0, 0)) },
      uRippleStr: { value: new Array(MAX_RIPPLES).fill(0) },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, defines: { USE_CUBE: 1 } });

    // ── Meshes ──────────────────────────────────────────────────────────────
    const blobGeo = new THREE.IcosahedronGeometry(1, 48);
    const blob = new THREE.Mesh(blobGeo, material);
    blob.scale.setScalar(1.5);
    scene.add(blob);

    const dropUniforms = {
      uTime: uniforms.uTime,
      uHeat: { value: 0.2 },
      uReduced: uniforms.uReduced,
      uEnvRot: envUniforms.uEnvRot,
      uEnvTilt: envUniforms.uEnvTilt,
      uBlobR: { value: 1.5 },
      uTint: { value: new THREE.Color('#cfe4ff') },
      uRippleTime: { value: new Array(MAX_RIPPLES).fill(-100) },
      uRipplePos: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(1, 0, 0)) },
      uRippleStr: { value: new Array(MAX_RIPPLES).fill(0) },
    };
    const dropMaterial = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: dropUniforms });

    const DROPS = [];
    const DROP_COUNT = 6;
    const dropGeo = new THREE.IcosahedronGeometry(1, 16);
    for (let i = 0; i < DROP_COUNT; i++) {
      const m = new THREE.Mesh(dropGeo, dropMaterial);
      const a = (i / DROP_COUNT) * Math.PI * 2;
      DROPS.push({
        mesh: m, angle: a,
        speed: 0.35 + Math.random() * 0.5,
        radius: 1.5 + Math.random() * 0.5,
        yPhase: Math.random() * Math.PI * 2,
        ySpeed: 0.5 + Math.random() * 0.8,
        baseSize: 0.28 + Math.random() * 0.22,
        tilt: (Math.random() - 0.5) * 0.9,
      });
      m.scale.setScalar(0);
      scene.add(m);
    }

    const beadUniforms = {
      uEnvRot: envUniforms.uEnvRot,
      uEnvTilt: envUniforms.uEnvTilt,
      uBlobR: dropUniforms.uBlobR,
      uHaze: { value: BG_WARM.clone() },
    };
    const beadMaterial = new THREE.ShaderMaterial({
      uniforms: beadUniforms,
      vertexShader: `
        varying vec3 vN;
        varying vec3 vP;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vP = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        ${STUDIO_GLSL}
        uniform float uBlobR;
        uniform vec3 uHaze;
        varying vec3 vN;
        varying vec3 vP;
        void main(){
          vec3 N = normalize(vN);
          vec3 toCam = cameraPosition - vP;
          vec3 V = normalize(toCam);
          float ndv = clamp(dot(N, V), 0.0, 1.0);
          vec3 R = reflect(-V, N);
          vec3 col = studio(R);
          vec4 bounce = dropBounce(vP, R, uBlobR);
          col = mix(col, bounce.rgb, bounce.a);
          col *= fresnel(ndv);
          // distant beads sink into the air of the room
          float haze = smoothstep(2.0, 9.0, -vP.z) * 0.72;
          gl_FragColor = vec4(mix(col, uHaze, haze), 1.0);
        }`,
    });

    const BEADS = [];
    const beadGeo = new THREE.IcosahedronGeometry(1, 4);
    const BEAD_COUNT = IS_TOUCH ? 16 : 34;
    for (let i = 0; i < BEAD_COUNT; i++) {
      const m = new THREE.Mesh(beadGeo, beadMaterial);
      // Most beads hang in the room behind the drop; every fifth one is a small
      // bead in the foreground, between the drop and the lens. With the camera
      // orbiting, the three layers slide against each other and read as depth.
      const near = i % 5 === 4;
      const spanX = near ? 5.5 : 12;
      const spanY = near ? 2.6 : 5;
      m.position.set(
        (Math.random() - 0.5) * spanX,
        (Math.random() - 0.5) * spanY * 1.8,
        near ? 1.9 + Math.random() * 1.5 : -2 - Math.random() * 6,
      );
      const s = near ? 0.035 + Math.random() * 0.05 : 0.05 + Math.random() * 0.28;
      m.scale.setScalar(s);
      BEADS.push({
        mesh: m, size: s, spanX, spanY,
        driftX: (Math.random() - 0.5) * 0.12,
        driftY: 0.06 + Math.random() * 0.16,
        swayAmp: 0.2 + Math.random() * 0.5,
        swayPhase: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.5,
      });
      scene.add(m);
    }

    // Soft backlight halo behind the drop. Authored as a display-space falloff
    // and inverted through the tone curve so it keeps its intended softness.
    const glowUniforms = { uColor: { value: new THREE.Color(1, 1, 1) } };
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: glowUniforms,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 uColor;
          varying vec2 vUv;
          vec3 invAces(vec3 y){
            y = clamp(y, 0.0, 0.999);
            vec3 A = 2.43 * y - 2.51, B = 0.59 * y - 0.03, C = 0.14 * y;
            return (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
          }
          void main(){
            float r = clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
            float f = 1.0 - r;
            vec3 disp = vec3(0.50, 0.60, 0.86) * (0.42 * pow(f, 3.2) + 0.13 * f * f) * uColor;
            gl_FragColor = vec4(invAces(pow(disp, vec3(2.2))), 1.0);
          }`,
      }),
    );
    glow.position.set(0, 0.3, -3.2);
    glow.scale.setScalar(11);
    glow.renderOrder = -1;
    scene.add(glow);

    // ── Live reflections: cube capture from the centre of the drop ──────────
    // Only the droplets and beads are captured (on transparent black), so the
    // studio itself stays analytically sharp and this map can stay small.
    const CUBE_SIZE = IS_TOUCH ? 128 : 256;
    const CUBE_EVERY = IS_TOUCH ? 2 : 1;
    const cubeRT = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, {
      format: THREE.RGBAFormat, type: BUF_TYPE,
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    const cubeCam = new THREE.CubeCamera(0.05, 40, cubeRT);
    scene.add(cubeCam);
    uniforms.uCube.value = cubeRT.texture;

    // ── HDR post chain: scene → bloom pyramid → tone-map + lens finish ──────
    const rtOpts = { format: THREE.RGBAFormat, type: BUF_TYPE, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
    let sceneRT;
    if (GL2 && HDR) {
      sceneRT = new THREE.WebGLMultisampleRenderTarget(4, 4, { ...rtOpts, depthBuffer: true });
      sceneRT.samples = (IS_TOUCH || renderer.getPixelRatio() >= 2) ? 2 : 4;
    } else {
      sceneRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: true });
    }

    const BLOOM_LEVELS = IS_TOUCH ? 4 : 5;
    const bloomDown = [];
    const bloomUp = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bloomDown.push(new THREE.WebGLRenderTarget(4, 4, rtOpts));
      if (i < BLOOM_LEVELS - 1) bloomUp.push(new THREE.WebGLRenderTarget(4, 4, rtOpts));
    }

    const FS_VERT = `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    const fsMat = (fragmentShader, u) => new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader, uniforms: u, depthTest: false, depthWrite: false,
    });

    // Bright-pass + first downsample: soft-knee threshold, fireflies clamped.
    const prefilterMat = fsMat(`
      uniform sampler2D tSrc; uniform vec2 uTexel;
      varying vec2 vUv;
      void main(){
        vec4 o = uTexel.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);
        vec3 c = 0.25 * (min(texture2D(tSrc, vUv + o.xy).rgb, 16.0) + min(texture2D(tSrc, vUv + o.zy).rgb, 16.0)
                       + min(texture2D(tSrc, vUv + o.xw).rgb, 16.0) + min(texture2D(tSrc, vUv + o.zw).rgb, 16.0));
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - 0.55, 0.0, 0.9);
        soft = soft * soft / 1.8;
        float w = max(soft, br - 1.0) / max(br, 1e-4);
        gl_FragColor = vec4(c * w, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });

    const downMat = fsMat(`
      uniform sampler2D tSrc; uniform vec2 uTexel;
      varying vec2 vUv;
      void main(){
        vec4 o = uTexel.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0
               + texture2D(tSrc, vUv + o.xy).rgb + texture2D(tSrc, vUv + o.zy).rgb
               + texture2D(tSrc, vUv + o.xw).rgb + texture2D(tSrc, vUv + o.zw).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });

    // Tent upsample of the wider level, added to the sharper one.
    const upMat = fsMat(`
      uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel;
      varying vec2 vUv;
      void main(){
        vec4 o = uTexel.xyxy * vec4(1.0, 1.0, -1.0, 0.0);
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0
               + (texture2D(tSrc, vUv - o.xw).rgb + texture2D(tSrc, vUv + o.xw).rgb
                + texture2D(tSrc, vUv - o.wy).rgb + texture2D(tSrc, vUv + o.wy).rgb) * 2.0
               + texture2D(tSrc, vUv + o.xy).rgb + texture2D(tSrc, vUv - o.xy).rgb
               + texture2D(tSrc, vUv + o.zy).rgb + texture2D(tSrc, vUv - o.zy).rgb;
        gl_FragColor = vec4(texture2D(tBase, vUv).rgb + c / 16.0, 1.0);
      }`, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } });

    // Final: slight lens fringing toward the corners, bloom, ACES, gamma, grain.
    const finalMat = fsMat(`
      uniform sampler2D tScene; uniform sampler2D tBloom;
      uniform float uBloom; uniform float uTime; uniform vec2 uRes;
      varying vec2 vUv;
      vec3 aces(vec3 x){
        const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
        return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
      }
      float hash(vec2 p){
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main(){
        vec2 c = vUv - 0.5;
        vec2 off = c * dot(c, c) * 0.006;
        vec3 col = vec3(texture2D(tScene, vUv + off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - off).b);
        col += texture2D(tBloom, vUv).rgb * uBloom;
        col = pow(aces(col), vec3(1.0 / 2.2));
        // fine animated grain; also dithers the dark gradients against banding
        vec2 px = floor(vUv * uRes);
        float g = hash(px + fract(uTime) * 61.7) + hash(px + 17.0 + fract(uTime * 1.31) * 47.3) - 1.0;
        col += g * 0.012;
        gl_FragColor = vec4(col, 1.0);
      }`, {
      tScene: { value: null }, tBloom: { value: null },
      uBloom: { value: 0.10 }, uTime: uniforms.uTime, uRes: { value: new THREE.Vector2(1, 1) },
    });

    const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const fsGeo = new THREE.PlaneGeometry(2, 2);
    const fsMesh = new THREE.Mesh(fsGeo, prefilterMat);
    fsMesh.frustumCulled = false;
    const fsScene = new THREE.Scene();
    fsScene.add(fsMesh);
    const blit = (mat, target) => {
      fsMesh.material = mat;
      renderer.setRenderTarget(target);
      renderer.render(fsScene, fsCam);
    };

    function renderFrame(captureCube) {
      if (captureCube) {
        const bg = scene.background;
        scene.background = null;
        blob.visible = false; glow.visible = false;
        cubeCam.update(renderer, scene);
        blob.visible = true; glow.visible = true;
        scene.background = bg;
      }

      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);

      prefilterMat.uniforms.tSrc.value = sceneRT.texture;
      prefilterMat.uniforms.uTexel.value.set(0.5 / bloomDown[0].width, 0.5 / bloomDown[0].height);
      blit(prefilterMat, bloomDown[0]);
      for (let i = 1; i < BLOOM_LEVELS; i++) {
        downMat.uniforms.tSrc.value = bloomDown[i - 1].texture;
        downMat.uniforms.uTexel.value.set(1 / bloomDown[i - 1].width, 1 / bloomDown[i - 1].height);
        blit(downMat, bloomDown[i]);
      }
      let wide = bloomDown[BLOOM_LEVELS - 1];
      for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
        upMat.uniforms.tSrc.value = wide.texture;
        upMat.uniforms.tBase.value = bloomDown[i].texture;
        upMat.uniforms.uTexel.value.set(1 / wide.width, 1 / wide.height);
        blit(upMat, bloomUp[i]);
        wide = bloomUp[i];
      }

      finalMat.uniforms.tScene.value = sceneRT.texture;
      finalMat.uniforms.tBloom.value = wide.texture;
      blit(finalMat, null);
    }

    // ── Interaction — pointer, ripples ──────────────────────────────────────
    const ndc = new THREE.Vector2(0, 0);
    const pointerPx = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const raycaster = new THREE.Raycaster();
    const _rippleSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.5);
    const _rippleHit = new THREE.Vector3();
    let rippleSlot = 0;
    let lastRipple = 0;

    function tryRipple(strength) {
      const now = performance.now();
      if (now - lastRipple < 100) return;
      lastRipple = now;

      raycaster.setFromCamera(ndc, camera);
      _rippleSphere.radius = blob.scale.x;
      if (!raycaster.ray.intersectSphere(_rippleSphere, _rippleHit)) return;

      const local = blob.worldToLocal(_rippleHit.clone()).normalize();
      const slot = rippleSlot % MAX_RIPPLES;
      rippleSlot++;
      uniforms.uRipplePos.value[slot].copy(local);
      uniforms.uRippleTime.value[slot] = uniforms.uTime.value;
      uniforms.uRippleStr.value[slot] = strength;
    }

    const setPointerFromEvent = (e) => {
      pointerPx.x = e.clientX; pointerPx.y = e.clientY;
      ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    // A press/tap always makes a firmer ripple. This runs on every device, so a
    // touch tap disturbs the surface on mobile too — not just a desktop click.
    on(window, 'pointerdown', (e) => { setPointerFromEvent(e); tryRipple(1.8); });

    // Continuous hover ripples + parallax only on true pointer devices, so a
    // touch-drag (which is a scroll) never fights the ripples.
    if (!IS_TOUCH) {
      on(window, 'pointermove', (e) => { setPointerFromEvent(e); tryRipple(1.0); });
    }

    // ── Scroll fraction, anchored to the bottom of Reformation ──────────────
    const epilogueSection = document.getElementById('epilogue');
    const reformationSection = epilogueSection ? epilogueSection.previousElementSibling : null;

    let scrollFrac = 0;
    function updateScroll() {
      if (!reformationSection) return;
      const reformationBottom = reformationSection.offsetTop + reformationSection.offsetHeight;
      const max = reformationBottom - window.innerHeight;
      scrollFrac = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    }
    on(window, 'scroll', updateScroll, { passive: true });
    updateScroll();

    // ── Epilogue reveal (decoupled from scrollFrac) ─────────────────────────
    const epilogueVeil = document.getElementById('epilogue-veil');
    const epilogueFadeEls = document.querySelectorAll(
      '.epilogue-heading, .epilogue-subheading, .epilogue-body, .epilogue-sources, .epilogue-reset-link',
    );
    function updateEpilogue() {
      if (!epilogueSection || !epilogueVeil) return;
      // The veil must finish BEFORE the epilogue copy is in reading position,
      // otherwise the heading is read through a half-transparent blob. It also
      // must not start until the wordmark reveal has had its moment.
      const top = epilogueSection.offsetTop;
      const start = top - window.innerHeight * 0.62;
      const end = top - window.innerHeight * 0.30;
      const t = Math.min(Math.max((window.scrollY - start) / (end - start), 0), 1);
      epilogueVeil.style.opacity = t;
      // Once the pale daylight veil dominates, flip the fixed corner labels
      // (HUD, zone, credit) to a dark, crisp treatment so they stay readable.
      document.body.classList.toggle('is-daylight', t > 0.55);
      const textT = Math.min(Math.max((t - 0.35) / 0.55, 0), 1);
      epilogueFadeEls.forEach((el) => {
        el.style.opacity = textT;
        el.style.transform = 'translateY(' + (16 * (1 - textT)) + 'px)';
      });
    }
    on(window, 'scroll', updateEpilogue, { passive: true });
    updateEpilogue();

    // ── Resize-on-demand ────────────────────────────────────────────────────
    function syncSize() {
      const w = window.innerWidth || document.documentElement.clientWidth || 1280;
      const h = window.innerHeight || document.documentElement.clientHeight || 720;
      const pr = renderer.getPixelRatio();
      if (w > 0 && h > 0 && (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr))) {
        renderer.setSize(w, h, false);
        const bw = Math.floor(w * pr), bh = Math.floor(h * pr);
        sceneRT.setSize(bw, bh);
        for (let i = 0; i < BLOOM_LEVELS; i++) {
          const lw = Math.max(2, bw >> (i + 1)), lh = Math.max(2, bh >> (i + 1));
          bloomDown[i].setSize(lw, lh);
          if (bloomUp[i]) bloomUp[i].setSize(lw, lh);
        }
        finalMat.uniforms.uRes.value.set(bw, bh);
        camera.aspect = w / h;
        // On tall, narrow screens pull the camera back so the whole drop fits
        // the width instead of being cropped by the sides.
        camDist = 5.6 * Math.max(1, 0.82 / camera.aspect);
        camera.updateProjectionMatrix();
      }
    }
    on(window, 'resize', syncSize);
    on(window, 'load', syncSize);
    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(syncSize);
      ro.observe(document.documentElement);
    }
    syncSize();

    // ── Helpers ─────────────────────────────────────────────────────────────
    const smoothstep = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const lerp = (a, b, t) => a + (b - a) * t;

    const elTension = document.getElementById('tension');
    const elTensionBar = document.getElementById('tensionBar');
    const elZone = document.getElementById('zone');
    const elWordmark = document.getElementById('wordmark-wrap');
    const ZONE_NAMES = ['SOLID STATE', 'MOLTEN', 'FRACTURE', 'REFORMATION'];

    // ── Cursor trail ────────────────────────────────────────────────────────
    const cursor = document.getElementById('cursor');
    const cur = { x: pointerPx.x, y: pointerPx.y };
    if (!IS_TOUCH && cursor) {
      on(window, 'pointerout', (e) => { if (!e.relatedTarget) cursor.classList.add('hidden'); });
      on(window, 'pointerover', () => cursor.classList.remove('hidden'));
    }

    // ── Render loop ─────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    const camTarget = new THREE.Vector2(0, 0);
    let rafId = 0;
    let frameNo = 0;

    function frame() {
      syncSize();
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      uniforms.uTime.value = t;

      const f = scrollFrac;

      const rise = smoothstep(0.10, 0.42, f);
      const cool = smoothstep(0.80, 0.99, f);
      const heat = rise * (1.0 - 0.6 * cool);
      const fracture = smoothstep(0.46, 0.62, f) * (1.0 - smoothstep(0.72, 0.90, f));
      const plaque = smoothstep(0.82, 0.97, f);
      const reveal = smoothstep(0.84, 0.98, f);

      uniforms.uHeat.value = heat;

      const shrink = lerp(1.0, 0.34, fracture);
      const flatZ = lerp(1.0, 0.16, plaque);
      const flatXY = lerp(1.0, 1.35, plaque);
      blob.scale.set(1.5 * shrink * flatXY, 1.5 * shrink * flatXY, 1.5 * shrink * flatZ);

      const spin = REDUCED ? 0.03 : 0.12;
      blob.rotation.y += dt * spin * (1 + heat);
      blob.rotation.x = Math.sin(t * 0.12) * 0.12 * (1 - plaque);
      blob.rotation.x = lerp(blob.rotation.x, 0, plaque);
      blob.rotation.y = lerp(blob.rotation.y, 0, plaque * 0.85);
      blob.rotation.z = lerp(0, Math.sin(t * 0.2) * 0.05, 1 - plaque);

      for (const d of DROPS) {
        d.angle += dt * d.speed * (REDUCED ? 0.4 : 1);
        const orbit = d.radius * fracture;
        const y = Math.sin(t * d.ySpeed + d.yPhase) * 0.7 * fracture + d.tilt * fracture;
        d.mesh.position.set(Math.cos(d.angle) * orbit, y, Math.sin(d.angle) * orbit * 0.7);
        d.mesh.scale.setScalar(d.baseSize * fracture);
        d.mesh.rotation.y += dt * 0.6;
        d.mesh.rotation.x += dt * 0.3;
      }

      const beadSpeed = REDUCED ? 0.15 : 1.0;
      for (const bd of BEADS) {
        const p = bd.mesh.position;
        p.y += bd.driftY * dt * beadSpeed;
        p.x += (bd.driftX + Math.sin(t * 0.3 + bd.swayPhase) * bd.swayAmp * 0.06) * dt * beadSpeed;
        if (p.y > bd.spanY) { p.y = -bd.spanY; p.x = (Math.random() - 0.5) * bd.spanX; }
        bd.mesh.rotation.y += dt * bd.spin;
      }

      glow.scale.setScalar(11 + Math.sin(t * 0.4) * 0.5 + heat * 2.0);

      const bgT = smoothstep(0.35, 0.75, f);
      scene.background.copy(BG_WARM).lerp(BG_COOL, bgT);
      uniforms.uTint.value.setRGB(lerp(1.0, 0.82, bgT), lerp(0.85, 0.9, bgT), lerp(0.75, 1.0, bgT));
      glowUniforms.uColor.value.setRGB(lerp(1.0, 0.82, bgT), lerp(0.92, 0.94, bgT), lerp(0.9, 1.1, bgT));
      beadUniforms.uHaze.value.copy(scene.background);

      // The studio swings around the metal as the story advances, so the lights
      // sweep across it — and the key light always sits on the side away from
      // the copy (sections alternate left / right). Droplets and beads see the
      // drop at its true size.
      envUniforms.uEnvRot.value = -0.75 * Math.cos(f * Math.PI * 3) + (REDUCED ? 0 : Math.sin(t * 0.07) * 0.14);
      // As the drop presses flat it faces the lens squarely; tip the studio so
      // the horizon seam clears the wordmark and the name sits on dark mirror,
      // with the lights riding the plaque's rim.
      envUniforms.uEnvTilt.value = plaque * -0.14;
      dropUniforms.uBlobR.value = blob.scale.x * (1 - 0.55 * plaque);

      const px = (pointerPx.x / window.innerWidth) * 2 - 1;
      const py = (pointerPx.y / window.innerHeight) * 2 - 1;
      const par = REDUCED ? 0.05 : 0.36;
      camTarget.set(px * par, -py * par);
      // The camera travels with the story: it orbits around the drop, rises a
      // little and pushes in through the middle acts, and comes back square-on
      // for the plaque and its wordmark. Pointer parallax rides on top.
      const orbitAmt = REDUCED ? 0.25 : 1;
      const yaw = Math.sin(f * Math.PI * 2) * 0.42 * orbitAmt;
      const pitch = Math.sin(f * Math.PI) * 0.13 * orbitAmt * (1 - plaque);
      const dist = camDist * (1 - 0.08 * Math.sin(f * Math.PI) * orbitAmt);
      const camK = 1 - Math.exp(-dt * 3.5);
      camera.position.x = lerp(camera.position.x, Math.sin(yaw) * Math.cos(pitch) * dist + camTarget.x, camK);
      camera.position.y = lerp(camera.position.y, Math.sin(pitch) * dist + camTarget.y, camK);
      camera.position.z = lerp(camera.position.z, Math.cos(yaw) * Math.cos(pitch) * dist, camK);
      camera.lookAt(0, 0, 0);

      if (elTension) elTension.textContent = Math.round((1 - heat) * 100) + '%';
      if (elTensionBar) elTensionBar.style.transform = 'scaleX(' + (1 - heat) + ')';

      const zoneIdx = f < 0.25 ? 0 : f < 0.5 ? 1 : f < 0.75 ? 2 : 3;
      const zoneName = ZONE_NAMES[zoneIdx];
      if (elZone && elZone.dataset.z !== zoneName) {
        elZone.textContent = zoneName;
        elZone.dataset.z = zoneName;
      }
      if (elWordmark) elWordmark.style.opacity = reveal;

      if (!IS_TOUCH && cursor) {
        const curK = REDUCED ? 1 : 1 - Math.exp(-dt * 22);
        cur.x = lerp(cur.x, pointerPx.x, curK);
        cur.y = lerp(cur.y, pointerPx.y, curK);
        cursor.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
      }

      renderFrame(frameNo++ % CUBE_EVERY === 0);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    // ── Teardown ────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      cleanups.forEach((fn) => fn());
      if (ro) ro.disconnect();
      blobGeo.dispose();
      dropGeo.dispose();
      beadGeo.dispose();
      glow.geometry.dispose();
      glow.material.dispose();
      material.dispose();
      dropMaterial.dispose();
      beadMaterial.dispose();
      cubeRT.dispose();
      sceneRT.dispose();
      bloomDown.forEach((rt) => rt.dispose());
      bloomUp.forEach((rt) => rt.dispose());
      [prefilterMat, downMat, upMat, finalMat].forEach((m) => m.dispose());
      fsGeo.dispose();
      renderer.dispose();
      document.body.classList.remove('is-daylight');
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return (
    <>
      {/* WebGL canvas is created imperatively into this holder (see effect). */}
      <div ref={holderRef} aria-hidden="true" />
      <div id="vignette" />
      {/* Epilogue veil: pale daylight backdrop that fades in over the fiction stage */}
      <div id="epilogue-veil" />

      {/* Fixed wordmark, revealed on scroll */}
      <div id="wordmark-wrap"><div id="wordmark">QUICKSILVER</div></div>

      {/* Frosted bars behind the fixed labels, so scrolling copy passes under
          them instead of colliding with the HUD, zone label and credit. */}
      <div id="bar-top" className="chrome-bar" aria-hidden="true" />
      <div id="bar-bottom" className="chrome-bar" aria-hidden="true" />

      {/* HUD */}
      <div id="hud" aria-hidden="true">
        <div className="row"><span>SURFACE&nbsp;TENSION</span><span className="val" id="tension">100%</span></div>
        <div className="bar"><i id="tensionBar" /></div>
      </div>
      <div id="zone" aria-hidden="true">SOLID&nbsp;STATE</div>

      {/* Author credit */}
      <div id="credit">Created by Surabhi Datta</div>

      {/* Custom cursor */}
      <div id="cursor" />
    </>
  );
}
