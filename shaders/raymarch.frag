#ifdef GL_ES
precision highp float;
#endif

#define M_PI 3.141593
#define RAYMARCH_CYCLES 256
#define RAYMARCH_PRECISION 0.0000001

uniform float time;
uniform float depth_stride;
uniform vec2 mouse;
uniform vec2 resolution;
uniform sampler2D depth;

uniform vec3 cutterPosition;// = vec3(0, 0.25, .2);
//uniform float cutterRadius;// = .05;
uniform float cutterRadius;// = .05;

float depth_get(in vec2 uv) {
  return texture2D(depth, uv).x;
}

float solid_plane(vec3 p) {
  return p.y;
}

float solid_sphere(vec3 p, float s) {
  return length(p)-s;
}

float solid_box(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}


float solid_depthmap(vec3 p, float amount) {
  float r = 1.0/2048.0;

  if (abs(p.x) > .5 || abs(p.y) > .5) {
    return RAYMARCH_PRECISION/10.0;
  }

  vec2 pos = floor(p.xy * 2048.0) / 2048.0;
  float depth = depth_get(p.xy + 0.5);

  if (depth == 0.0) {
    return min(amount, RAYMARCH_PRECISION);
  }

  float d = r*10.0 ;//* 2.25;

  return solid_box(
    p - vec3(pos.x, pos.y, 0.1),
    vec3(d, d, depth)
  );
}

float solid_cylinder(vec3 p, vec3 c) {
  return length(p.xz-c.xy)-c.z;
}

float solid_capsule( vec3 p, vec3 a, vec3 b, float r ) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
  return length( pa - ba*h ) - r;
}

float op_union(float d1, float d2) {
  return min(d1, d2);
}

float op_subtract( float d1, float d2 ) {
  return max(-d1, d2);
}

float op_intersect( float d1, float d2 ) {
  return max(d1, d2);
}

vec2 map(in vec3 origin, in vec3 dir, in float amount) {

  vec3 pos = origin + dir * amount;

  if (pos.z < 0.0) {
    return vec2(RAYMARCH_PRECISION * .99, -1.0);
  }

  float box = solid_box(
    pos,
    vec3(.5, .5, .1)
  );

  float cyl = solid_capsule(
    pos - (cutterPosition + vec3(0.0, 0.0, (.1 + cutterRadius))),
    vec3(0.0, 0.01, 0.0),
    vec3(0.0, 0.01, 0.5),
    cutterRadius
  );

  float res;
  res = solid_depthmap(pos, amount);
  res = op_subtract(res, box);
  res = op_union(cyl, res);

  return vec2(res, 10.0);
}

vec3 calcNormal(in vec3 origin, in vec3 dir, in float t) {
  vec3 pos = origin + dir * t;
  vec3 eps = vec3(0.001, 0.0, 0.0);
  vec3 nor = vec3(
      map(origin+eps.xyy, dir, t).x - map(origin-eps.xyy, dir, t).x,
      map(origin+eps.yxy, dir, t).x - map(origin-eps.yxy, dir, t).x,
      map(origin+eps.yyx, dir, t).x - map(origin-eps.yyx, dir, t).x
  );
  return max(eps, normalize(nor));
}

vec3 castRay(in vec3 ro, in vec3 rd, in float maxd) {

  float h=RAYMARCH_PRECISION;
  float t = 0.0;
  float m = -1.0;

  for(int i=0; i<RAYMARCH_CYCLES; i++) {
    vec3 pos = ro + rd * t;
    if(h < RAYMARCH_PRECISION) {
      break;
    }

    if (t>maxd) {
      break;
    }

    vec2 res = map(ro, rd, t);
    h = max(res.x, RAYMARCH_PRECISION);
    h = res.x;
    t += h * .75;//max(h * .25, -h);
    m = res.y;

  }

  if (t>maxd) {
    m=-1.0;
  }

  return vec3(t, m, dot(t, m));
}

vec3 render(in vec3 ro, in vec3 rd) {
  vec3 col = vec3(0.0);
  vec3 res = castRay(ro,rd,5.0);

  float t = res.x;
  float m = res.y;
  vec3 v = max(calcNormal(ro, rd, t), 1.0 / res);
  return vec3(dot(clamp(v, 0.2, smoothstep(0.4, .6, min(m, t))), normalize(res)));

  if(m>-0.5) {

    vec3 pos = ro + t*rd;
    vec3 nor = calcNormal(ro, rd, t);
    //vec3 nor = calcNormal(ro, vec3(-0.05, -.5, 0.0), t);

    col = vec3(0.6) + 2.0*sin(vec3(0.05,0.08,0.10)*(m-1.0));
    //col = vec3(0.5) + 0.2*sin(vec3(0.05,0.08,0.10)*(m-1.0));

    //float ao = calcAO(pos, nor);

    vec3 lig = normalize(vec3(-0.6, 0.7, -0.5));
    float amb = clamp(0.5+0.5*nor.y, 0.0, 1.0);
    float dif = clamp(dot(nor, lig), 0.0, 1.0);
    float bac = clamp(
      dot(nor, normalize(vec3(-lig.x, 0.0, -lig.z))), 0.0, 1.0
    ) * clamp(1.0 - pos.y,0.0,1.0);

    float sh = 1.0;
    // if(dif>0.02) {
    //   sh = softshadow(pos, lig, 0.02, 10.0, 7.0);
    //   dif *= sh;
    // }

    vec3 brdf = vec3(0.0);
    brdf += 0.20*amb*vec3(0.10,0.11,0.13);//*ao;
    brdf += 0.20*bac*vec3(0.15,0.15,0.15);//*ao;
    brdf += 1.20*dif*vec3(1.00,0.90,0.70);

    float pp = clamp(dot(reflect(rd,nor), lig), 0.0, 1.0);
    float spe = sh*pow(pp,16.0);
    float fre = pow(clamp(1.0+dot(nor,rd),0.0,1.0), 2.0);//*ao;

    col = col*brdf + vec3(1.0)*col*spe + 0.2*fre*(0.5+0.5*col);
  }

  col *= exp(-0.0001*t*t);
  return max(1.0 / vec3(res.z), vec3(clamp(col,0.0,0.5)));
}

void main(void)
{
  vec2 q = gl_FragCoord.xy/resolution.xy;
  vec2 p = -1.0+2.0*q;
  p.x *= resolution.x/resolution.y;
  vec2 mo = mouse.xy/resolution.xy;


  // camera
  vec3 ro = vec3(1.0 + sin(6.0 * mo.x), 0.0, 3.0 * mo.y);
  // vec3 ro = vec3(
  //   -1.0+3.2*cos(0.1*time + 6.0*mo.x),
  //   1.0 + 3.0*mo.y,
  //   -1.0 + 3.2*sin(0.1*time + 6.0*mo.x)
  // );

  vec3 ta = vec3(0.0, 0.0, 0.0);//vec3( -0.5, -0.2, 0.5 );

  // camera tx
  vec3 cw = normalize( ta-ro );
  vec3 cp = vec3( 0.0, 0.0, 1.0 );
  vec3 cu = normalize( cross(cw,cp) );
  vec3 cv = normalize( cross(cu,cw) );
  vec3 rd = normalize( p.x*cu + p.y*cv + 2.5*cw );


  vec3 col = render( ro, rd );
  /*
  float qd = depth_get(p);
  if (qd > 0.0) {
     gl_FragColor = vec4(qd, 1.0-qd, qd, 1.0);
  } else {
  */
    // float clen = length(col);
    // if (clen == 0.0) {
    //   gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    // } else {
      gl_FragColor = vec4(sqrt(col), 1.0);
    // }
  //}
}
