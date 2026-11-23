import { NOISE_GLSL } from './noise.ts';
import { STUDIO_GLSL } from './studio.ts';

/** Touch ripples tracked at once; the shader loops over this many slots. */
export const MAX_RIPPLES = 3;

// Vertex stage of the drop: fbm swell plus decaying touch ripples, with the
// normal rebuilt from two neighbours so reflections bend with the surface.
export const METAL_VERTEX = `
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

// Fragment stage: a true mirror of the studio, with the live cube capture (main
// drop) or a one-bounce reflection of the drop (droplets), Fresnel, warmth and
// a faint thin-film sheen at grazing angles.
export const METAL_FRAGMENT = `
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
