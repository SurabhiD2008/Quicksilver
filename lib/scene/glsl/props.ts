import { STUDIO_GLSL } from './studio.ts';

// Floating mercury beads: mirror-shaded like the drop, reflecting it back with
// one analytic bounce, and sinking into the room's haze with distance.
export const BEAD_VERTEX = `
        varying vec3 vN;
        varying vec3 vP;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vP = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`;

export const BEAD_FRAGMENT = `
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
        }`;

// The soft backlight halo. Authored as a display-space falloff and inverted
// through the tone curve so it keeps its intended softness after ACES.
export const GLOW_VERTEX = `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const GLOW_FRAGMENT = `
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
          }`;
