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
                        if (pSphere.x == 0.0 && pSphere.y == 0.0 && pSphere.z == 0.0) {
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

                        // 1. Surface and near-surface back-face test:
                        // Outward normal is P. Vector towards camera is (C - P).
                        // If dot(P, C - P) < 0, the point faces away from the camera behind the geometric horizon.
                        if (dot(P, C - P) < 0.0) {
                            discard;
                        }

                        // 2. Aerial ray penetration test for elevated flight arcs:
                        // Does the ray from camera C to elevated point P pass through the Earth sphere (radius 256)?
                        vec3 V = P - C;
                        float vSq = dot(V, V);
                        float t = -dot(C, V) / max(vSq, 1e-6);
                        if (t > 0.001 && t < 0.999) {
                            vec3 Q = C + t * V;
                            if (dot(Q, Q) < 65536.0) {
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

