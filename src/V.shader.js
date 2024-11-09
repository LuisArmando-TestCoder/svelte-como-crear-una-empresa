export default `
#define BURST
#define NUM_LAYERS 2
#define ITERATIONS 20

mat2 Rot(float a) {
    float s=sin(a), c=cos(a);
    return mat2(c,-s,s,c);
}

float Star(vec2 uv, float a, float sparkle) {
    vec2 av1 = abs(uv);
    vec2 av2 = abs(uv*Rot(a));
    vec2 av = min(av1, av2);
    
    float d = length(uv);
    float star = av1.x*av1.y;
    star = max(star, av2.x*av2.y);
    star = max(0., 1.-star*1e3);
    
    float m = min(5., 1e-2/d);
    
    return m + pow(star, 4.) * sparkle;
}

float Hash21(vec2 p) {
    p = fract(p * vec2(123.34,145.54));
    p += dot(p, p + 45.23);
    return fract(p.x * p.y);
}

vec3 StarLayer(vec2 uv, float t, float sparkle) {
    vec2 gv = fract(uv) - .5;
    vec2 id = floor(uv);
    vec3 col = vec3(0);
    
    #ifndef BURST
    t = 0.;
    #endif
    
    for(int y = -1; y <= 1; y++) {
        for(int x = -1; x <= 1; x++) {
            vec2 offs = vec2(float(x), float(y));
            float n = Hash21(id - offs);
            vec3 N = fract(n * vec3(10, 100, 1000));
            vec2 p = (N.xy - .5) * .7;
            
            float brightness = Star(gv - p + offs, n * 6.2831 + t, sparkle);
            vec3 star = brightness * vec3(.6 + p.x, .4, .6 + p.y) * N.z * N.z;
            
            star *= 1. + sin((t + n) * 20.) * smoothstep(sin(t) * .5 + .5, 1., fract(10. * n));
            
            float d = length(gv + offs);
            
            col += star * smoothstep(1.5, .8, d);
        }
    }
    return col;
}

float lightCircle(vec2 uv, float radius, vec2 position, float radiusReduction) {
    float d = length(uv - position) * radiusReduction;
    d = smoothstep(d, 0., radius);
    return 1. - d;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    float mouseDown = step(.1, iMouse.z);
    float scale = mix(.05, .005, mouseDown);
    vec2 look = (iMouse.xy / iResolution.xy - .5) * 3. * mouseDown;
    
    float time = iTime / 50. + 15.;
    vec2 res = iResolution.xy;
    vec2 uv = fragCoord.xy / res - vec2(.5) + look;
    uv *= vec2(res.x / res.y, 1.) * 4. * scale;
    vec2 M = iMouse.xy / iResolution.xy;
    
    M *= 10.;
    
    float t = -iTime / 3.;
    
    float twirl = sin(t * 10.);
    twirl *= twirl * twirl * sin(dot(uv, uv));
    uv *= Rot(-t * .02);
    
    uv *= 2. + sin(t * .05);
    
    vec3 col = vec3(0);
    float speed = -.02;
    #ifdef BURST
    speed = .1;
    float bla = sin(t + sin(t + max(sin(t), 0.1) * .5)) * .5 + .5;
    float d = dot(uv, uv);
    
    float a = atan(uv.x, uv.y);
    uv /= d;
    float burst = sin(iTime * .05);
    uv *= burst + .2;
    #endif
    
    float stp = 1.0 / float(NUM_LAYERS);
    
    for(int layer = 0; layer < NUM_LAYERS; layer++) {
        float i = float(layer) * stp;
        float lt = fract(t * speed + i);
        float scale = mix(10., .25, lt);
        float fade = smoothstep(0., .4, lt) * smoothstep(1., .95, lt); 
        vec2 sv = uv * scale + i * 134.53 - M;
        col += StarLayer(sv, t, fade) * fade;
    }
    
    #ifdef BURST
    float burstFade = smoothstep(0., .02, abs(burst));
    float size = .9 * sin(t) + 1.;
    size = max(size, sqrt(size));
    float fade = size / d;
    col *= mix(1., fade, burstFade);
    col += fade * .2 * vec3(1., .5, .1) * bla * burstFade;
    
    t *= 1.5;
    
    a -= M.x * .1;
    float rays = sin(a * 5. + t * 3.) - cos(a * 7. - t);
    rays *= sin(a + t + sin(a * 4.) * 10.) * .5 + .5;
    col += rays * bla * .1 * burstFade;
    col += 1. - burstFade;
    #else
    col *= 4.;
    #endif
    
    float len = dot(uv, uv) * .3 - .4;
    
    vec3 z = sin(time * vec3(.23, .19, .17));
    for (int i = 0; i < ITERATIONS; i++) {
        z += cos(z.zxy + uv.yxy * float(i) * len);
    }
    
    float val = z.r * .06 + .3;
    val -= smoothstep(.01 * cos(iTime), -.03, len * sin(iTime / 100.)) * cos(iTime / 100.) + len * .03 - .4;
    
    float timeSlow = 5.;
    float chosenTime = iTime * timeSlow;
    float radiusReduction = 1.;
    float radius = .1;
    float waveSpeed = 1.;
    float intensityGrowRate = 1.;
    float centralCircleRadius = radius * 2.5;
    float wavingRadius = centralCircleRadius + sin(chosenTime * waveSpeed) / intensityGrowRate;

    float centralCircle = lightCircle(uv, wavingRadius, vec2(0., 0.), radiusReduction);
    float rightCircle = lightCircle(uv, radius, vec2(cos(chosenTime), 0.), radiusReduction);
    float leftCircle = lightCircle(uv, radius, vec2(sin(chosenTime), 0.), radiusReduction);
    float otherRightCircle = lightCircle(uv, radius, vec2(sin(chosenTime + .75), 0.), radiusReduction);
    float otherLeftCircle = lightCircle(uv, radius, vec2(cos(chosenTime + .75), 0.), radiusReduction);

    fragColor = vec4(
        rightCircle + leftCircle + centralCircle + otherLeftCircle * 2.,
        rightCircle + rightCircle + centralCircle + otherRightCircle * 2.,
        leftCircle + leftCircle + centralCircle + otherRightCircle + otherLeftCircle,
        1.
    ) / vec4(
        vec3(max(val, .01)) / tan(col / 2. / tan(iTime / 100.)) * vec3(1., 5., 1.),
        1.
    );
}
`