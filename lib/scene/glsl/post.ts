// Full-screen passes of the HDR post chain.

export const FS_VERTEX = `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Bright-pass and first downsample: soft-knee threshold, fireflies clamped.
export const PREFILTER_FRAGMENT = `
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
      }`;

export const DOWN_FRAGMENT = `
      uniform sampler2D tSrc; uniform vec2 uTexel;
      varying vec2 vUv;
      void main(){
        vec4 o = uTexel.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0
               + texture2D(tSrc, vUv + o.xy).rgb + texture2D(tSrc, vUv + o.zy).rgb
               + texture2D(tSrc, vUv + o.xw).rgb + texture2D(tSrc, vUv + o.zw).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`;

// Tent upsample of the wider level, added to the sharper one.
export const UP_FRAGMENT = `
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
      }`;

// Final: slight lens fringing toward the corners, bloom, ACES, gamma, grain.
export const FINAL_FRAGMENT = `
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
      }`;
