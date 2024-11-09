export default `
// Improved noise function using a noise texture in iChannel0
float noise(vec2 p) {
    return texture2D(iChannel0, p * 0.1).r;
}

// Fractal Brownian Motion function
float fbm(vec2 p) {
    float f = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 50; i++) {
        f += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return f;
}

// Function to compute the Mandelbrot set
float mandelbrot(vec2 c) {
    vec2 z = vec2(0.0);
    const int maxIter = 1000;
    for (int i = 0; i < maxIter; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 4.0) break;
    }
    return float(z) / float(maxIter);
}

// Neon color palette for the Mandelbrot set
vec3 neonPalette(float t) {
    // Bright color palette
    return vec3(0.5 + 0.5 * sin(6.2831 * (t + vec3(0.0, 0.33, 0.66))));
}

// Rotation matrix
mat2 Rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Star function
float Star(vec2 uv, float a, float sparkle) {
    vec2 av1 = abs(uv);
    vec2 av2 = abs(uv * Rot(a));
    vec2 av = min(av1, av2);

    float d = length(uv);
    float star = av1.x * av1.y;
    star = max(star, av2.x * av2.y);
    star = max(0.0, 1.0 - star * 1e3);

    float m = min(5.0, 1e-2 / d);

    return m + pow(star, 4.0) * sparkle;
}

// Hash function
float Hash21(vec2 p) {
    p = fract(p * vec2(123.34, 145.54));
    p += dot(p, p + 45.23);
    return fract(p.x * p.y);
}

// Star layer
vec3 StarLayer(vec2 uv, float t, float sparkle) {
    vec2 gv = fract(uv) - 0.5;
    vec2 id = floor(uv);
    vec3 col = vec3(0.0);

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 offs = vec2(float(x), float(y));
            float n = Hash21(id - offs);
            vec3 N = fract(n * vec3(10.0, 100.0, 1000.0));
            vec2 p = (N.xy - 0.5) * 0.7;

            float brightness = Star(gv - p + offs, n * 6.2831 + t, sparkle);
            vec3 star = brightness * vec3(0.7 + p.x, 0.4, 0.6 + p.y) * N.z * N.z;

            star *= 1.0 + sin((t + n) * 20.0) * smoothstep(
                sin(t * 0.1) * 0.5 + 0.5,
                1.0,
                fract(10.0 * n)
            );

            float d = length(gv + offs);

            col += star * smoothstep(1.5 * sin(t * 0.1), 0.8, d);
        }
    }
    return col;
}

// Adjusted mainImage function to match the expected signature
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Normalized pixel coordinates in the range [-1, 1]
    vec2 uv = (fragCoord - 0.5 * (iResolution.xy * .5)) / (iResolution.y * .5);

    // Time variable
    float t = iTime * 0.1;

    // Space distortion into a fluid non-Euclidean shape
    vec2 distortion = fbm(uv * 3.0 + t) * vec2(0.5, 0.5);
    uv += distortion;

    // Mandelbrot set calculation
    vec2 c = uv * vec2(3.5, 2.0) + vec2(-2.5, -1.0);
    float m = mandelbrot(c);

    // Neon color based on the Mandelbrot set
    vec3 neonColor = neonPalette(m);
    neonColor *= pow(1.0 - m, -30.0); // Neon glow intensity

    // Initialize color
    vec3 col = vec3(0.0);

    // Polar coordinates
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Spiral movement over time
    float spiral = angle + r * -7.0 - t * 0.01 + sin(-t + r * -5.0) * 0.5;
    float arms = sin(spiral * 2.6 * iMouse.x / (iMouse.y + 0.0001)); // Avoid division by zero

    // Cloudy nebula using fbm
    float n = fbm(uv * 5.0 + vec2(t * -0.05, t * -0.3));

    // Nebula intensity and color blending
    float nebulaIntensity = exp(-pow(r * 1.5, 2.0)) * arms * n;
    nebulaIntensity *= pow(1.0 - m, 2.0);
    nebulaIntensity = smoothstep(0.0, 1.0, nebulaIntensity);

    // Pastel pink and gold colors
    vec3 pastelPink = vec3(1.0, 0.7, 0.85);
    vec3 gold = vec3(1.0, 0.85, 0.5);

    // Mix colors like in a painting
    vec3 nebulaColor = mix(pastelPink, gold, n);

    // Mix neon color with nebula color
    nebulaColor = mix(nebulaColor, neonColor, 0.05);

    // Apply nebula color
    col += nebulaIntensity * nebulaColor;

    // Core glow
    float coreGlow = exp(-pow(r * 4.0, 2.0));
    vec3 coreColor = gold;
    col += coreGlow * coreColor;

    // Add star layers
    float sparkle = 1.0;
    vec3 stars = StarLayer(uv * 10.0, t, sparkle);
    col += stars;

    // Final color adjustments
    col = pow(col, vec3(0.4545));

    // Output color
    fragColor = vec4(col, 1.0);
}
`;
