// Crayon paper, after Duet's crayon theme (github.com/heeseon87/duet, web/src/styles/crayon.css). The paper is a
// bump map lit from the top left, laid over every pixel the way the page's two grain layers are: a light half in
// color-dodge, then a dark half in multiply. Text, fills and the background all take the same grain, fixed to the
// screen, so text scrolls under it. Optional wax streaks can lie on flat fills that are not the background
// (selection, status bars, diff rows), under the grain, as Duet waxes its chips; they ship off (WAX_MAX_LIFT).
// Run it after any cursor shaders so their trails take the grain too.
// PX assumes a Retina (2x) screen; set it to 1.0 on a 1x display or the grain comes out twice as coarse.
//
// cmux leaves the default background out of iChannel0 (rgb 0, alpha 0) and paints it on the window layer, so the
// shader paints it itself and returns opaque pixels. The window layer paints it as sRGB, while this output is read as
// display-p3 (window-colorspace), so the shader converts it first: unconverted, #dad2bf came out as #dbd1bc.

const float PX = 2.0;                       // device pixels per point on a Retina screen
// Duet's paper filter strength. It runs in sRGB (color-interpolation-filters), so no linearRGB conversion.
const float PAPER_FREQ = 0.45;              // feTurbulence baseFrequency, per point
// feDiffuseLighting surfaceScale. Chrome maps it into device pixels, so at deviceScaleFactor 2 the bumps are twice as
// steep per device pixel; reproducing its 2x render from its own height map needed the document's value times PX
// (for the older .2: mean error 0.25 of 255).
const float PAPER_SCALE = 0.16 * PX;
const float PAPER_KD = 1.1547;              // diffuseConstant = 1 / sin(elevation), so flat paper returns lighting-color
const float PAPER_GREY = 128.0 / 255.0;     // lighting-color #808080: flat paper comes out mid grey, then splits in two
// feDistantLight azimuth 225, elevation 60: the top left. SVG's y axis points down, fragCoord's up.
const vec3  LIGHT = vec3(-0.35355, 0.35355, 0.86603);
// Chrome's filter takes a 3x3 Sobel over the device-pixel height map. Eight noise taps per pixel held cmux's GPU at
// 100%, so the slope is the analytic derivative of the first two octaves instead, each weighted so the lit paper
// matches the Sobel's: sd 6.05 of 255, neighbour correlation .67/.18 at 1/2 px against .68/.18. The third octave sits
// past the device Nyquist and the Sobel all but drops it (fitted weight .02).
const float SOBEL_W0 = 1.775;
const float SOBEL_W1 = 0.8;
const float BLOTCH_FREQ = 0.005;
const float BLOTCH_K1 = 0.05;               // feComposite arithmetic: shade * (k1 * blotch + k2)
const float BLOTCH_K2 = 0.975;
const vec2  WAX_FREQ = vec2(0.12, 0.8);     // Duet --wax: long streaks across, short down
const vec3  WAX_RGB = vec3(1.0, 0.996, 0.978);
const float WAX_GAIN = 2.6;                 // Duet --wax: alpha = 2.6 * noise - 1.45
const float WAX_BIAS = -1.45;
// White wax on a dark fill lifts it so far that its streaks read like the light text inside it. Cap the lift at
// what the blue prompt chip (#87a5c8, luma 0.63) gets, so dark fills keep the texture without competing with ink.
// Wax ships off: 0.0 zeroes every streak. Set 0.37 to turn the streaks on.
const float WAX_MAX_LIFT = 0.0;
// A fill is a flat area that is not the background, dark or light, as Duet waxes its dark primary buttons too.
// Flat keeps wax off anti-aliased glyph edges, whose neighbours a couple of pixels away are already a different colour.
const float FILL_REACH = 2.0;
const float SAME = 0.012;
const float NOT_BACKGROUND = 0.03;

vec2 hash2(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    vec2 g = fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
    return g / max(length(g), 1e-4);    // unit gradients, as in the SVG turbulence reference code
}

// One of eight unit gradients, picked by an integer hash of the lattice point: the same unit-length, evenly spread
// gradients as hash2 gives (so the same variance and spectrum), without its three fracts, dots and a normalize.
// Only the blotches use it. On a 6016x3384 screen the three blotch octaves through hash2 took 7 of the shader's 18 ms
// a frame (11 ms with this), and a blotch is hundreds of pixels wide, so which gradients it is built from does not
// show: the lit paper's sd and neighbour correlation stay at 5.7 and .79/.42 (5.7, .78/.41 before). The grain and
// the wax keep hash2, so every bump is where it was.
const vec2 DIRS[8] = vec2[8](vec2(1.0, 0.0), vec2(0.70710678, 0.70710678), vec2(0.0, 1.0), vec2(-0.70710678, 0.70710678),
                             vec2(-1.0, 0.0), vec2(-0.70710678, -0.70710678), vec2(0.0, -1.0), vec2(0.70710678, -0.70710678));
vec2 fastGrad(vec2 p) {
    uvec2 q = uvec2(ivec2(p));
    uint h = q.x * 1597334677u ^ q.y * 3812015801u;
    h *= 1597334677u;
    h ^= h >> 16;
    return DIRS[h >> 29];
}

float blotchNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dot(fastGrad(i), f);
    float b = dot(fastGrad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(fastGrad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(fastGrad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// fractalNoise below, over blotchNoise.
float blotchFractal(vec2 p) {
    float sum = 0.0;
    float amp = 1.0;
    for (int i = 0; i < 3; i++) {
        sum += amp * blotchNoise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return clamp(sum * 0.5 + 0.5, 0.0, 1.0);
}

float gradientNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dot(hash2(i), f);
    float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// feTurbulence type="fractalNoise" numOctaves="3": doubling frequency, halving weight, mapped to 0..1.
float fractalNoise(vec2 p) {
    float sum = 0.0;
    float amp = 1.0;
    for (int i = 0; i < 3; i++) {
        sum += amp * gradientNoise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return clamp(sum * 0.5 + 0.5, 0.0, 1.0);
}

// The derivative of gradientNoise with respect to p.
vec2 gradientNoiseSlope(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    vec2 ga = hash2(i), gb = hash2(i + vec2(1.0, 0.0)), gc = hash2(i + vec2(0.0, 1.0)), gd = hash2(i + vec2(1.0, 1.0));
    float a = dot(ga, f);
    float b = dot(gb, f - vec2(1.0, 0.0));
    float c = dot(gc, f - vec2(0.0, 1.0));
    float d = dot(gd, f - vec2(1.0, 1.0));
    float k = a - b - c + d;
    return ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
         + du * (u.yx * k + vec2(b, c) - a);
}

// feDiffuseLighting over the turbulence, then the blotches. Returns the grey grain value, 0.5 where the paper is flat.
float paperGrain(vec2 fc) {
    // Each octave of fractalNoise adds amp * noise / 2 to the height, and its slope per device pixel is that times its
    // frequency, so both octaves come out as 0.5 * PAPER_FREQ / PX times their noise's own slope.
    vec2 p = fc / PX * PAPER_FREQ;
    vec2 slope = 0.5 * PAPER_FREQ / PX * (SOBEL_W0 * gradientNoiseSlope(p) + SOBEL_W1 * gradientNoiseSlope(2.0 * p));
    vec3 normal = normalize(vec3(-PAPER_SCALE * slope, 1.0));
    float lit = PAPER_KD * max(dot(normal, LIGHT), 0.0);
    float blotch = clamp(2.0 * blotchFractal(fc / PX * BLOTCH_FREQ + 41.0) - 0.5, 0.0, 1.0);
    return PAPER_GREY * lit * (BLOTCH_K1 * blotch + BLOTCH_K2);
}

vec3 srgbToDisplayP3(vec3 c) {
    vec3 lin = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
    vec3 p3 = lin * mat3(0.8226, 0.1775, 0.0, 0.0332, 0.9668, 0.0, 0.0171, 0.0724, 0.9103);
    return mix(p3 * 12.92, 1.055 * pow(p3, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, p3));
}

bool sameColor(vec3 a, vec3 b) {
    return all(lessThan(abs(a - b), vec3(SAME)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 src = texture(iChannel0, uv);
    vec3 color = src.rgb;
    vec2 pt = fragCoord / PX;

    vec2 d = FILL_REACH / iResolution.xy;
    bool fill = src.a > 0.99
        && distance(color, iBackgroundColor) > NOT_BACKGROUND
        && sameColor(color, texture(iChannel0, uv + vec2(d.x, 0.0)).rgb)
        && sameColor(color, texture(iChannel0, uv - vec2(d.x, 0.0)).rgb)
        && sameColor(color, texture(iChannel0, uv + vec2(0.0, d.y)).rgb)
        && sameColor(color, texture(iChannel0, uv - vec2(0.0, d.y)).rgb);
    if (fill) {
        float wax = clamp(WAX_GAIN * fractalNoise(pt * WAX_FREQ + 17.0) + WAX_BIAS, 0.0, 1.0);
        float room = 1.0 - dot(color, vec3(0.2126, 0.7152, 0.0722));
        wax *= min(1.0, WAX_MAX_LIFT / max(room, 1e-3));
        color = mix(color, WAX_RGB, wax);
    }

    // What shows of the default background (1 - alpha, so glyph edges keep their share) goes under the cell first.
    vec3 base = color + srgbToDisplayP3(iBackgroundColor) * (1.0 - src.a);

    // feComponentTransfer splits the grain: 2v - 1 for the light half, 2v for the dark half.
    float v = paperGrain(fragCoord);
    float light = clamp(2.0 * v - 1.0, 0.0, 1.0);
    float dark = clamp(2.0 * v, 0.0, 1.0);
    // color-dodge (body::before), then multiply (body::after) on top of it.
    vec3 dodged = min(base / max(1.0 - light, 1e-4), vec3(1.0));
    fragColor = vec4(dodged * dark, 1.0);
}
