import { LayerExtension } from '@deck.gl/core';

/**
 * GlobeHorizonCullExtension
 *
 * Hardware-accelerated horizon occlusion for Deck.gl layers on 3D Globe viewports.
 * In MapLibre + Deck.gl overlaid mode (interleaved: false), Deck.gl renders into
 * its own WebGL canvas on top of MapLibre.
 *
 * Without horizon occlusion, routes, pins, and markers on the opposite side
 * of the Earth are drawn straight through the globe onto the screen, causing
 * the 3D globe to appear transparent.
 *
 * This extension injects GLSL into the vertex and fragment pipelines:
 * - Computes surface normal at geometry position in globe space (pSphere)
 * - Computes vector to camera (cameraPosition - pSphere)
 * - If dot(pSphere, cameraPosition - pSphere) < 0, the geometry is behind the
 *   geometric horizon (on the far side of the planet) and is cleanly discarded.
 * - Flat Mercator projection (projectionMode != 2) bypasses culling automatically.
 */
export class GlobeHorizonCullExtension extends LayerExtension {
    static defaultProps = {};
    static extensionName = 'GlobeHorizonCullExtension';

    getShaders() {
        return {
            inject: {
                'vs:#decl': /* glsl */ `
                    out vec3 vGlobeHorizon_WorldPos;
                    out vec3 vGlobeHorizon_CamPos;
                    out float vGlobeHorizon_Mode;
                `,
                'vs:DECKGL_FILTER_GL_POSITION': /* glsl */ `
                    // Check if current viewport projection mode is Globe (2)
                    if (project.projectionMode == 2) {
                        vGlobeHorizon_Mode = 1.0;
                        vec3 pSphere = geometry.position.xyz;
                        // Billboard layers (ScatterplotLayer quad, TextLayer glyphs) have local offsets near origin (|p| < 10.0).
                        // Real globe surface vertices have |p| ~ 256.0 (dot >= 60000.0).
                        if (dot(pSphere, pSphere) < 1000.0) {
                            pSphere = project_globe_(vec3(geometry.worldPosition.xy, 0.0));
                        }
                        vGlobeHorizon_WorldPos = pSphere;
                        vGlobeHorizon_CamPos = project.cameraPosition;
                    } else {
                        vGlobeHorizon_Mode = 0.0;
                        vGlobeHorizon_WorldPos = vec3(0.0);
                        vGlobeHorizon_CamPos = vec3(0.0);
                    }
                `,
                'fs:#decl': /* glsl */ `
                    in vec3 vGlobeHorizon_WorldPos;
                    in vec3 vGlobeHorizon_CamPos;
                    in float vGlobeHorizon_Mode;
                `,
                'fs:DECKGL_FILTER_COLOR': /* glsl */ `
                    if (vGlobeHorizon_Mode > 0.5) {
                        vec3 P = vGlobeHorizon_WorldPos;
                        vec3 C = vGlobeHorizon_CamPos;
                        vec3 V = P - C;
                        float vSq = dot(V, V);

                        // Earth sphere radius squared in Deck.gl globe space (R = 256.0)
                        // Use 255.0^2 = 65025.0 to provide numerical tolerance for surface vertices
                        float R2 = 65025.0;

                        // 1. Ray-Sphere penetration test:
                        // Does the line of sight from camera C to point P punch through the planet?
                        float t = -dot(C, V) / max(vSq, 1e-6);
                        if (t > 0.0) {
                            vec3 Q = C + t * V;
                            float qSq = dot(Q, Q);
                            if (qSq < R2) {
                                float d = sqrt((R2 - qSq) / max(vSq, 1e-6));
                                float tEntry = t - d;
                                // If the ray enters the Earth sphere before reaching point P, P is on the far side
                                if (tEntry > 0.005 && tEntry < 0.995) {
                                    discard;
                                }
                            }
                        }

                        // 2. Surface horizon test (strictly for ground/near-ground points where |P| <= 258.0):
                        // Elevated flight arcs (|P| > 258.0) are NOT surface points and are governed solely by ray-sphere test above.
                        float pSq = dot(P, P);
                        if (pSq < 66564.0) { // 258.0^2
                            if (dot(P, -V) < -2.0) {
                                discard;
                            }
                        }
                    }
                `
            }
        };
    }
}

export const globeHorizonCullExtension = new GlobeHorizonCullExtension();

