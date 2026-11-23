// The procedural HDR photo studio every metal surface reflects: a dark room lit
// by softboxes, strip lights, coloured gels and tiny hot practicals, evaluated
// analytically per pixel so it is infinitely sharp. The lights are many times
// brighter than white, which is what makes the highlights bloom.
export const STUDIO_GLSL = `
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
