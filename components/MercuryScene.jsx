'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * MercuryScene renders the fixed UI (canvas, vignette, epilogue veil, wordmark,
 * HUD, zone label, credit, custom cursor) and runs the liquid-chrome Three.js
 * scene. The scene logic is a faithful port of the single-file build, adapted
 * to run inside a useEffect with full teardown for React Strict Mode.
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
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 5.6);

    const BG_WARM = new THREE.Color('#0d0a0e');
    const BG_COOL = new THREE.Color('#070a10');
    scene.background = BG_WARM.clone();

    // ── Procedural studio-chrome matcap ─────────────────────────────────────
    function makeMatcap(size = 512) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const R = size / 2;

      const studio = g.createLinearGradient(0, 0, 0, size);
      studio.addColorStop(0.00, '#9fb0ce');
      studio.addColorStop(0.12, '#5c6884');
      studio.addColorStop(0.32, '#262d3b');
      studio.addColorStop(0.44, '#4a556f');
      studio.addColorStop(0.485, '#9fb1d2');
      studio.addColorStop(0.50, '#eaf1ff');
      studio.addColorStop(0.52, '#333b4a');
      studio.addColorStop(0.58, '#181e2b');
      studio.addColorStop(0.80, '#0a0d15');
      studio.addColorStop(1.00, '#030409');
      g.fillStyle = studio;
      g.fillRect(0, 0, size, size);

      const bloom = (x, y, r, color, a) => {
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, color.replace('ALPHA', a));
        rg.addColorStop(1, color.replace('ALPHA', '0'));
        g.fillStyle = rg;
        g.fillRect(0, 0, size, size);
      };

      g.globalCompositeOperation = 'lighter';

      const streak = g.createLinearGradient(0, R * 0.955, 0, R * 1.02);
      streak.addColorStop(0, 'rgba(255,255,255,0)');
      streak.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      streak.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = streak;
      g.fillRect(0, 0, size, size);

      bloom(R * 0.58, R * 0.30, R * 0.55, 'rgba(255,150,205,ALPHA)', '0.34');
      bloom(R * 1.44, R * 0.66, R * 0.62, 'rgba(150,235,255,ALPHA)', '0.34');
      bloom(R * 0.82, R * 1.44, R * 0.60, 'rgba(190,160,255,ALPHA)', '0.32');
      bloom(R * 1.26, R * 1.34, R * 0.50, 'rgba(255,225,160,ALPHA)', '0.26');

      bloom(R * 0.66, R * 0.44, R * 0.30, 'rgba(255,255,255,ALPHA)', '0.85');
      bloom(R * 0.66, R * 0.44, R * 0.10, 'rgba(255,255,255,ALPHA)', '1.0');
      bloom(R * 1.30, R * 1.22, R * 0.26, 'rgba(215,235,255,ALPHA)', '0.55');

      g.globalCompositeOperation = 'source-over';

      const rim = g.createRadialGradient(R, R, R * 0.58, R, R, R);
      rim.addColorStop(0, 'rgba(0,0,0,0)');
      rim.addColorStop(0.80, 'rgba(4,4,8,0.18)');
      rim.addColorStop(1, 'rgba(0,0,4,0.95)');
      g.fillStyle = rim;
      g.fillRect(0, 0, size, size);

      g.globalCompositeOperation = 'destination-in';
      g.beginPath();
      g.arc(R, R, R, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.globalCompositeOperation = 'source-over';

      const tex = new THREE.CanvasTexture(c);      tex.anisotropy = 4;
      tex.needsUpdate = true;
      return tex;
    }
    const matcap = makeMatcap();

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
  float f=0.0, amp=0.5;
  for(int i=0;i<4;i++){ f+=amp*snoise(p); p*=2.02; amp*=0.5; }
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

varying vec3 vViewNormal;
varying float vDisp;
varying vec3 vLocalDir;

float getDisp(vec3 dir){
  float ambScale = mix(1.0, 0.12, uReduced);
  float amb = fbm(dir * 1.6 + vec3(0.0, uTime * 0.18, uTime * 0.10));
  float base = amb * (0.05 + uHeat * 0.30) * ambScale;
  base += fbm(dir * 0.8 - uTime * 0.06) * uHeat * 0.14 * ambScale;

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
  vLocalDir = dir;

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

  vViewNormal = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p0, 1.0);
}`;

    const FRAGMENT = `
uniform sampler2D uMatcap;
uniform float uHeat;
uniform float uTime;
uniform vec3 uTint;
varying vec3 vViewNormal;
varying float vDisp;
varying vec3 vLocalDir;

vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}

void main(){
  vec3 n = normalize(vViewNormal);
  vec2 uv = n.xy * 0.5 + 0.5;
  vec3 col = texture2D(uMatcap, uv).rgb;

  vec3 col2 = texture2D(uMatcap, (n.xy * 0.42 + 0.5)).rgb;
  col = mix(col, col2, 0.22);

  col = mix(col, col * uTint, uHeat * 0.35);
  col += vDisp * 0.35 * vec3(0.9, 0.95, 1.05);

  float fres = pow(1.0 - abs(n.z), 2.8);
  vec3 irid = 0.55 + 0.45 * cos(6.2831 * (fres * 1.3 + vec3(0.0, 0.33, 0.66)) + uTime * 0.25);
  col += fres * irid * 0.32;

  float lum = max(col.r, max(col.g, col.b));
  col += pow(lum, 6.0) * 0.25;

  col = aces(col * 0.98);
  gl_FragColor = vec4(col, 1.0);
}`;

    const uniforms = {
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uReduced: { value: REDUCED ? 1 : 0 },
      uMatcap: { value: matcap },
      uTint: { value: new THREE.Color('#ffd9c0') },
      uRippleTime: { value: new Array(MAX_RIPPLES).fill(-100) },
      uRipplePos: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(1, 0, 0)) },
      uRippleStr: { value: new Array(MAX_RIPPLES).fill(0) },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms });

    // ── Meshes ──────────────────────────────────────────────────────────────
    const blobGeo = new THREE.IcosahedronGeometry(1, 48);
    const blob = new THREE.Mesh(blobGeo, material);
    blob.scale.setScalar(1.5);
    scene.add(blob);

    const dropUniforms = {
      uTime: uniforms.uTime,
      uHeat: { value: 0.55 },
      uReduced: uniforms.uReduced,
      uMatcap: { value: matcap },
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

    const beadUniforms = { uMatcap: { value: matcap }, uTime: uniforms.uTime };
    const beadMaterial = new THREE.ShaderMaterial({
      uniforms: beadUniforms,
      vertexShader: `
        varying vec3 vN;
        void main(){
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMatcap;
        varying vec3 vN;
        vec3 aces(vec3 x){const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
          return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);}
        void main(){
          vec3 n = normalize(vN);
          vec3 col = texture2D(uMatcap, n.xy*0.5+0.5).rgb;
          float rim = pow(1.0 - abs(n.z), 2.5);
          col += rim * 0.35 * vec3(0.7,0.85,1.0);
          gl_FragColor = vec4(aces(col*1.15), 1.0);
        }`,
    });

    const BEADS = [];
    const beadGeo = new THREE.IcosahedronGeometry(1, 4);
    const BEAD_COUNT = IS_TOUCH ? 16 : 34;
    for (let i = 0; i < BEAD_COUNT; i++) {
      const m = new THREE.Mesh(beadGeo, beadMaterial);
      m.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 9, -2 - Math.random() * 6);
      const s = 0.05 + Math.random() * 0.28;
      m.scale.setScalar(s);
      BEADS.push({
        mesh: m, size: s,
        driftX: (Math.random() - 0.5) * 0.12,
        driftY: 0.06 + Math.random() * 0.16,
        swayAmp: 0.2 + Math.random() * 0.5,
        swayPhase: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.5,
      });
      scene.add(m);
    }

    function makeGlow(size = 256) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const gg = cv.getContext('2d');
      const rg = gg.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      rg.addColorStop(0.0, 'rgba(210,228,255,0.9)');
      rg.addColorStop(0.25, 'rgba(150,180,235,0.45)');
      rg.addColorStop(0.6, 'rgba(90,110,170,0.12)');
      rg.addColorStop(1.0, 'rgba(0,0,0,0)');
      gg.fillStyle = rg;
      gg.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(cv);      return tex;
    }
    const glowTex = makeGlow();
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
    );
    glow.position.set(0, 0.3, -3.2);
    glow.scale.setScalar(11);
    glow.renderOrder = -1;
    scene.add(glow);

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

    if (!IS_TOUCH) {
      on(window, 'pointermove', (e) => {
        pointerPx.x = e.clientX; pointerPx.y = e.clientY;
        ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
        ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
        tryRipple(1.0);
      });
      on(window, 'pointerdown', () => tryRipple(1.8));
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
      const top = epilogueSection.offsetTop;
      const start = top - window.innerHeight * 0.8;
      const end = top + window.innerHeight * 0.6;
      const t = Math.min(Math.max((window.scrollY - start) / (end - start), 0), 1);
      epilogueVeil.style.opacity = t;
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
        camera.aspect = w / h;
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
        if (p.y > 5) { p.y = -5; p.x = (Math.random() - 0.5) * 12; }
        bd.mesh.rotation.y += dt * bd.spin;
      }

      glow.scale.setScalar(11 + Math.sin(t * 0.4) * 0.5 + heat * 2.0);

      const bgT = smoothstep(0.35, 0.75, f);
      scene.background.copy(BG_WARM).lerp(BG_COOL, bgT);
      uniforms.uTint.value.setRGB(lerp(1.0, 0.82, bgT), lerp(0.85, 0.9, bgT), lerp(0.75, 1.0, bgT));
      glow.material.color.setRGB(lerp(1.0, 0.82, bgT), lerp(0.92, 0.94, bgT), lerp(0.9, 1.1, bgT));

      const px = (pointerPx.x / window.innerWidth) * 2 - 1;
      const py = (pointerPx.y / window.innerHeight) * 2 - 1;
      const par = REDUCED ? 0.05 : 0.22;
      camTarget.set(px * par, -py * par);
      const camK = 1 - Math.exp(-dt * 3.5);
      camera.position.x = lerp(camera.position.x, camTarget.x, camK);
      camera.position.y = lerp(camera.position.y, camTarget.y, camK);
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

      renderer.render(scene, camera);
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
      matcap.dispose();
      glowTex.dispose();
      renderer.dispose();
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
