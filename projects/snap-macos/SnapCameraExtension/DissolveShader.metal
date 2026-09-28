#include <metal_stdlib>
using namespace metal;

// Matches EffectEngine.DissolveParams field-for-field.
struct DissolveParams {
    float t;         // 0 = fully live, 1 = fully gone (background)
    float threshold; // colour distance that counts as "this is the person"
    float band;      // softness of the mask edge and of the dissolve sweep
};

// Cheap per-pixel pseudo-random value in [0, 1), stable across frames since
// it's a pure function of the pixel coordinate — this is what staggers the
// dissolve into a granular, "dust" look instead of a flat wipe.
inline float hash(uint2 p) {
    uint n = p.x * 1973u + p.y * 9277u + 26699u;
    n = (n << 13u) ^ n;
    n = n * (n * n * 15731u + 789221u) + 1376312589u;
    return float(n & 0x7fffffffu) / float(0x7fffffff);
}

kernel void dissolveComposite(texture2d<float, access::read> live [[texture(0)]],
                               texture2d<float, access::read> bg [[texture(1)]],
                               texture2d<float, access::write> out [[texture(2)]],
                               constant DissolveParams &params [[buffer(0)]],
                               uint2 gid [[thread_position_in_grid]]) {
    if (gid.x >= out.get_width() || gid.y >= out.get_height()) { return; }

    float4 liveColor = live.read(gid);
    float4 bgColor = bg.read(gid);

    // Soft "is this pixel the person" mask: how different is the live
    // frame from the captured empty room here?
    float dist = length(liveColor.rgb - bgColor.rgb);
    float mask = smoothstep(params.threshold - params.band, params.threshold + params.band, dist);

    // Per-pixel staggered dissolve: as t sweeps 0 -> 1, lower-hash pixels
    // flip to "gone" earlier, giving a grainy dispersal instead of a wipe.
    float r = hash(gid);
    float edge = clamp((params.t - r) / max(params.band, 0.001) + 0.5, 0.0, 1.0);
    float alpha = edge * mask;

    // A brief sparkle right as a pixel is about to disappear: brighten it
    // and jitter its source slightly, then let it fade into the background.
    float sparkle = smoothstep(0.0, 0.2, edge) * (1.0 - smoothstep(0.2, 0.45, edge)) * mask;
    // int, not uint, math here: gid is 0 at the frame's edge, and a uint
    // "- 1" at 0 would wrap around to a huge value instead of going negative.
    int jx = int(gid.x) + int(uint(r * 6.0) % 3u) - 1;
    int jy = int(gid.y) + int(uint(hash(gid.yx) * 6.0) % 3u) - 1;
    uint2 jitterCoord = uint2(clamp(jx, 0, int(live.get_width()) - 1), clamp(jy, 0, int(live.get_height()) - 1));
    float4 jitterColor = live.read(jitterCoord);

    float4 blended = mix(liveColor, bgColor, alpha);
    float4 result = mix(blended, jitterColor + float4(0.25, 0.25, 0.28, 0.0), sparkle * 0.6);

    out.write(result, gid);
}
