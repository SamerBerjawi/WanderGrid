import { LayerExtension } from '@deck.gl/core';

/**
 * Hides the parts of deck.gl paths that are behind the 3D globe (deck draws on its own canvas above
 * MapLibre, so nothing else occludes them). Based on components/GlobeHorizonCullExtension.ts, with
 * looser margins near the horizon: deck's globe camera and MapLibre's differ very slightly, and the
 * original's tight thresholds clipped the visible ends of arcs whose airports sit near the edge of
 * the globe (the arc stopped short of its marker).
 *
 * A point is hidden only when it is clearly beyond the horizon:
 * - near the surface: the angle between its normal and the direction to the camera is past 90°
 *   by a small margin;
 * - raised: the line of sight to it passes through a slightly shrunken sphere well before the point.
 */
export class RpGlobeCullExtension extends LayerExtension {
    static defaultProps = {};
    static extensionName = 'RpGlobeCullExtension';

    getShaders() {
        return {
            inject: {
                'vs:#decl': /* glsl */ `
                    out vec3 vRpCull_WorldPos;
                    out vec3 vRpCull_CamPos;
                    out float vRpCull_Mode;
                `,
                'vs:DECKGL_FILTER_GL_POSITION': /* glsl */ `
                    if (project.projectionMode == 2) {
                        vRpCull_Mode = 1.0;
                        vec3 pSphere = geometry.position.xyz;
                        if (dot(pSphere, pSphere) < 1000.0) {
                            pSphere = project_globe_(vec3(geometry.worldPosition.xy, 0.0));
                        }
                        vRpCull_WorldPos = pSphere;
                        vRpCull_CamPos = project.cameraPosition;
                    } else {
                        vRpCull_Mode = 0.0;
                        vRpCull_WorldPos = vec3(0.0);
                        vRpCull_CamPos = vec3(0.0);
                    }
                `,
                'fs:#decl': /* glsl */ `
                    in vec3 vRpCull_WorldPos;
                    in vec3 vRpCull_CamPos;
                    in float vRpCull_Mode;
                `,
                'fs:DECKGL_FILTER_COLOR': /* glsl */ `
                    if (vRpCull_Mode > 0.5) {
                        vec3 P = vRpCull_WorldPos;
                        vec3 C = vRpCull_CamPos;
                        vec3 toCam = C - P;
                        float pLen = length(P);
                        // Facing the camera (or close to the horizon): always visible. A point whose
                        // outward normal points towards the camera cannot be hidden by the sphere.
                        float facing = dot(P / max(pLen, 1e-6), toCam / max(length(toCam), 1e-6));
                        if (facing < -0.06) {
                            if (pLen < 259.0) {
                                // Surface or near-surface and clearly beyond the horizon.
                                discard;
                            }
                            // Raised: hidden only if the line of sight enters the planet (R 250 of 256)
                            // well before reaching the point.
                            vec3 V = P - C;
                            float vSq = dot(V, V);
                            float t = -dot(C, V) / max(vSq, 1e-6);
                            vec3 Q = C + t * V;
                            float R2 = 62500.0;
                            float qSq = dot(Q, Q);
                            if (t > 0.0 && qSq < R2) {
                                float d = sqrt((R2 - qSq) / max(vSq, 1e-6));
                                float tEntry = t - d;
                                if (tEntry > 0.02 && tEntry < 0.98) {
                                    discard;
                                }
                            }
                        }
                    }
                `,
            },
        };
    }
}
