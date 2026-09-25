import { useEffect, useRef, type FC } from 'react';
import type { Map } from 'maplibre-gl';
import { getEffectiveBasemap } from '../types/mapAppearance';

interface GlobeAtmosphericBackgroundProps {
    map: Map | null;
    isGlobe: boolean;
    enabled?: boolean;
    isDark?: boolean;
    basemap?: string;
}

interface CelestialObject {
    ra: number;   // Right Ascension (radians)
    dec: number;  // Declination (radians)
    mag: number;  // Brightness (0.1 to 1.0)
    size: number; // Star radius (pixels)
    colorDark: string;
    colorLight: string;
    twinkleSpeed: number;
    phase: number;
}

interface DeepSkyObject {
    ra: number;
    dec: number;
    radius: number;
    colorDark: string;
    colorLight: string;
    type: 'nebula' | 'galaxy';
    tilt?: number;
}

// Deterministic Pseudo-Random Number Generator for stable star positions
function createPRNG(seed: number) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

export const GlobeAtmosphericBackground: FC<GlobeAtmosphericBackgroundProps> = ({
    map,
    isGlobe,
    enabled = true,
    isDark = true,
    basemap
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animFrameRef = useRef<number | null>(null);

    // Pre-generate stable celestial catalogue once
    const celestialCatalogue = useRef<{
        stars: CelestialObject[];
        deepSky: DeepSkyObject[];
    } | null>(null);

    if (!celestialCatalogue.current) {
        const rand = createPRNG(4242);
        const stars: CelestialObject[] = [];

        // Spectral color palettes for Dark vs Light modes
        const colorsDark = [
            '#e0f2fe', // O/B: luminous blue-white
            '#f8fafc', // A: crisp pure white
            '#fef08a', // G: warm solar gold
            '#fed7aa', // K: amber giant
            '#fecdd3'  // M: soft rose/red dwarf
        ];

        const colorsLight = [
            '#475569', // Slate
            '#334155', // Charcoal
            '#64748b', // Steel
            '#b45309', // Amber-bronze
            '#0284c7'  // Cyan-sapphire
        ];

        // 550 realistic stars distributed across celestial sphere
        for (let i = 0; i < 550; i++) {
            const ra = rand() * Math.PI * 2;
            const dec = Math.asin(rand() * 2 - 1); // Area-uniform spherical distribution
            const mag = Math.pow(rand(), 2.4) * 0.85 + 0.15; // Realistic stellar magnitude curve
            const size = mag > 0.8 ? 1.5 + rand() * 0.8 : mag > 0.5 ? 1.0 + rand() * 0.4 : 0.6 + rand() * 0.3;
            const colorIdx = Math.floor(rand() * colorsDark.length);
            const colorDark = colorsDark[colorIdx];
            const colorLight = colorsLight[colorIdx];
            const twinkleSpeed = 0.5 + rand() * 2.0;
            const phase = rand() * Math.PI * 2;

            stars.push({ ra, dec, mag, size, colorDark, colorLight, twinkleSpeed, phase });
        }

        // Deep sky objects: Milky Way core wisps & distant galaxies
        const deepSky: DeepSkyObject[] = [
            // Milky way galactic dust lane nodes
            { ra: 4.8, dec: -0.45, radius: 90, colorDark: 'rgba(99, 102, 241, 0.04)', colorLight: 'rgba(99, 102, 241, 0.02)', type: 'nebula' },
            { ra: 5.1, dec: -0.35, radius: 120, colorDark: 'rgba(168, 85, 247, 0.035)', colorLight: 'rgba(168, 85, 247, 0.02)', type: 'nebula' },
            { ra: 5.4, dec: -0.15, radius: 85, colorDark: 'rgba(56, 189, 248, 0.035)', colorLight: 'rgba(56, 189, 248, 0.02)', type: 'nebula' },
            { ra: 5.8, dec: 0.15, radius: 100, colorDark: 'rgba(139, 92, 246, 0.03)', colorLight: 'rgba(139, 92, 246, 0.015)', type: 'nebula' },
            { ra: 1.8, dec: 0.65, radius: 110, colorDark: 'rgba(59, 130, 246, 0.025)', colorLight: 'rgba(59, 130, 246, 0.015)', type: 'nebula' },
            // Distant spiral galaxies
            { ra: 0.72, dec: 0.71, radius: 15, colorDark: 'rgba(254, 240, 138, 0.25)', colorLight: 'rgba(217, 119, 6, 0.18)', type: 'galaxy', tilt: 0.65 },
            { ra: 3.45, dec: -0.82, radius: 12, colorDark: 'rgba(224, 231, 255, 0.22)', colorLight: 'rgba(79, 70, 229, 0.15)', type: 'galaxy', tilt: -0.4 }
        ];

        celestialCatalogue.current = { stars, deepSky };
    }

    useEffect(() => {
        if (!isGlobe || !enabled) {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        let isRunning = true;

        // Resolve active basemap palette
        const effectiveLayer = getEffectiveBasemap(basemap, isDark);

        const render = (time: number) => {
            if (!isRunning) return;

            const dpr = window.devicePixelRatio || 1;
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;

            if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
                canvas.width = width * dpr;
                canvas.height = height * dpr;
            }

            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, width, height);

            // 1. Basemap-Aligned Space Background Gradient
            const bgGrad = ctx.createRadialGradient(
                width * 0.5, height * 0.5, Math.min(width, height) * 0.15,
                width * 0.5, height * 0.5, Math.max(width, height) * 0.85
            );

            if (isDark) {
                switch (effectiveLayer) {
                    case 'satellite':
                        // Deep true space vacuum for realistic satellite views
                        bgGrad.addColorStop(0, '#020307');
                        bgGrad.addColorStop(0.5, '#010204');
                        bgGrad.addColorStop(1, '#000102');
                        break;
                    case 'citylights':
                        // Deep nocturnal midnight navy / indigo
                        bgGrad.addColorStop(0, '#04081c');
                        bgGrad.addColorStop(0.5, '#020412');
                        bgGrad.addColorStop(1, '#010209');
                        break;
                    case 'ocean':
                        // Deep abyssal oceanic midnight
                        bgGrad.addColorStop(0, '#020b18');
                        bgGrad.addColorStop(0.5, '#010710');
                        bgGrad.addColorStop(1, '#01040a');
                        break;
                    case 'snow':
                        // Crisp glacial slate cosmos
                        bgGrad.addColorStop(0, '#060a14');
                        bgGrad.addColorStop(0.5, '#03050c');
                        bgGrad.addColorStop(1, '#010206');
                        break;
                    case 'vibrant':
                        // Warm cosmic bronze/carbon
                        bgGrad.addColorStop(0, '#09080e');
                        bgGrad.addColorStop(0.5, '#040307');
                        bgGrad.addColorStop(1, '#020104');
                        break;
                    case 'onyx':
                    default:
                        // Sleek carbon onyx
                        bgGrad.addColorStop(0, '#05070e');
                        bgGrad.addColorStop(0.5, '#020409');
                        bgGrad.addColorStop(1, '#010205');
                        break;
                }
            } else {
                // Ethereal, high-end Light Mode celestial sky dome
                switch (effectiveLayer) {
                    case 'vibrant':
                        // Warm alabaster / parchment sky
                        bgGrad.addColorStop(0, '#fdfbf7');
                        bgGrad.addColorStop(0.5, '#f4eee4');
                        bgGrad.addColorStop(1, '#e7ded2');
                        break;
                    case 'ocean':
                        // Maritime seafoam & pale ocean sky
                        bgGrad.addColorStop(0, '#f0f9ff');
                        bgGrad.addColorStop(0.5, '#e0f2fe');
                        bgGrad.addColorStop(1, '#cfe5f9');
                        break;
                    case 'snow':
                    default:
                        // Pure arctic platinum / cloud-white
                        bgGrad.addColorStop(0, '#f8fafc');
                        bgGrad.addColorStop(0.5, '#edf2f7');
                        bgGrad.addColorStop(1, '#dfe6ed');
                        break;
                }
            }

            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, width, height);

            if (!map) {
                ctx.restore();
                animFrameRef.current = requestAnimationFrame(render);
                return;
            }

            // Retrieve camera and transform metrics from MapLibre
            const center = map.getCenter();
            const pitchDeg = map.getPitch();
            const bearingDeg = map.getBearing();
            const zoom = map.getZoom();

            const lngRad = (center.lng * Math.PI) / 180;
            const latRad = (center.lat * Math.PI) / 180;
            const pitchRad = (pitchDeg * Math.PI) / 180;
            const bearingRad = (bearingDeg * Math.PI) / 180;

            // Perspective camera constants
            const fovRad = 36.87 * (Math.PI / 180); // MapLibre default FOV: 36.87°
            const halfFovTan = Math.tan(fovRad / 2);
            const focalLength = (0.5 * height) / halfFovTan;

            const cx = width / 2;
            const cy = height / 2;

            // Projected globe center on screen
            let gx = cx;
            let gy = cy;
            try {
                const projectedCenter = map.project(center);
                if (projectedCenter && Number.isFinite(projectedCenter.x)) {
                    gx = projectedCenter.x;
                    gy = projectedCenter.y;
                }
            } catch (e) {
                // fallback to cx, cy
            }

            // Calculate exact apparent screen radius of the globe
            const worldSize = 512 * Math.pow(2, zoom);
            const globeRadiusWorld = worldSize / (2 * Math.PI) / Math.max(Math.cos(latRad), 0.1);
            const distCameraToCenter = focalLength + globeRadiusWorld;
            const radDiffSq = Math.max(distCameraToCenter * distCameraToCenter - globeRadiusWorld * globeRadiusWorld, 1);
            const screenRadius = focalLength * (globeRadiusWorld / Math.sqrt(radDiffSq));

            // Camera View Rotation Matrix
            // Rotates fixed celestial coordinates (ra, dec) into camera perspective coordinates
            const cosLng = Math.cos(lngRad);
            const sinLng = Math.sin(lngRad);
            const cosLat = Math.cos(latRad);
            const sinLat = Math.sin(latRad);
            const cosB = Math.cos(bearingRad);
            const sinB = Math.sin(bearingRad);
            const cosP = Math.cos(pitchRad);
            const sinP = Math.sin(pitchRad);

            // Project celestial unit vector to camera screen coordinates
            const projectCelestial = (x0: number, y0: number, z0: number) => {
                // Step 1: Rotate around polar Y axis by longitude
                const x1 = x0 * cosLng - z0 * sinLng;
                const y1 = y0;
                const z1 = x0 * sinLng + z0 * cosLng;

                // Step 2: Rotate around X axis by latitude
                const x2 = x1;
                const y2 = y1 * cosLat - z1 * sinLat;
                const z2 = y1 * sinLat + z1 * cosLat;

                // Step 3: Rotate around Z axis by bearing
                const x3 = x2 * cosB + y2 * sinB;
                const y3 = -x2 * sinB + y2 * cosB;
                const z3 = z2;

                // Step 4: Rotate around X axis by pitch
                const xc = x3;
                const yc = y3 * cosP + z3 * sinP;
                const zc = -y3 * sinP + z3 * cosP;

                // In front of camera check (zc > 0.02)
                if (zc <= 0.02) return null;

                const sx = cx + (xc / zc) * focalLength;
                const sy = cy - (yc / zc) * focalLength;
                return { sx, sy, zc };
            };

            const tSeconds = time * 0.001;

            // 2. Render Deep Sky Objects (Milky Way clouds & distant galaxies)
            if (celestialCatalogue.current) {
                for (const dso of celestialCatalogue.current.deepSky) {
                    const x0 = Math.cos(dso.dec) * Math.sin(dso.ra);
                    const y0 = Math.sin(dso.dec);
                    const z0 = Math.cos(dso.dec) * Math.cos(dso.ra);

                    const pt = projectCelestial(x0, y0, z0);
                    if (!pt) continue;

                    const color = isDark ? dso.colorDark : dso.colorLight;

                    if (dso.type === 'nebula') {
                        const nebGrad = ctx.createRadialGradient(pt.sx, pt.sy, 0, pt.sx, pt.sy, dso.radius);
                        nebGrad.addColorStop(0, color);
                        nebGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = nebGrad;
                        ctx.beginPath();
                        ctx.arc(pt.sx, pt.sy, dso.radius, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (dso.type === 'galaxy') {
                        ctx.save();
                        ctx.translate(pt.sx, pt.sy);
                        ctx.rotate(dso.tilt || 0.4);
                        ctx.scale(2.2, 0.7);
                        const galGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, dso.radius);
                        galGrad.addColorStop(0, color);
                        galGrad.addColorStop(0.35, isDark ? 'rgba(199, 210, 254, 0.08)' : 'rgba(99, 102, 241, 0.06)');
                        galGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.fillStyle = galGrad;
                        ctx.beginPath();
                        ctx.arc(0, 0, dso.radius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                }

                // 3. Render Celestial Starfield (Realistic twinkling stars)
                for (const star of celestialCatalogue.current.stars) {
                    const x0 = Math.cos(star.dec) * Math.sin(star.ra);
                    const y0 = Math.sin(star.dec);
                    const z0 = Math.cos(star.dec) * Math.cos(star.ra);

                    const pt = projectCelestial(x0, y0, z0);
                    if (!pt) continue;

                    // Skip stars off-screen
                    if (pt.sx < -10 || pt.sx > width + 10 || pt.sy < -10 || pt.sy > height + 10) continue;

                    // Subtle natural twinkle
                    const twinkle = 0.85 + 0.15 * Math.sin(tSeconds * star.twinkleSpeed + star.phase);
                    const baseAlpha = isDark ? star.mag * 0.9 : star.mag * 0.45;
                    const currentAlpha = baseAlpha * twinkle;

                    ctx.fillStyle = isDark ? star.colorDark : star.colorLight;
                    ctx.globalAlpha = Math.max(0.08, Math.min(0.95, currentAlpha));

                    ctx.beginPath();
                    ctx.arc(pt.sx, pt.sy, isDark ? star.size : star.size * 0.9, 0, Math.PI * 2);
                    ctx.fill();

                    // Bright landmark stars receive subtle diffraction sparkle
                    if (star.mag > 0.88 && star.size >= 1.7) {
                        ctx.strokeStyle = isDark ? star.colorDark : star.colorLight;
                        ctx.globalAlpha = currentAlpha * 0.25;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(pt.sx - star.size * 2.5, pt.sy);
                        ctx.lineTo(pt.sx + star.size * 2.5, pt.sy);
                        ctx.moveTo(pt.sx, pt.sy - star.size * 2.5);
                        ctx.lineTo(pt.sx, pt.sy + star.size * 2.5);
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = 1.0;
            }

            // 4. Render The Sun (Distant celestial light source & subtle corona)
            const sunRa = (215 * Math.PI) / 180;
            const sunDec = (18 * Math.PI) / 180;
            const sunX0 = Math.cos(sunDec) * Math.sin(sunRa);
            const sunY0 = Math.sin(sunDec);
            const sunZ0 = Math.cos(sunDec) * Math.cos(sunRa);

            const sunPt = projectCelestial(sunX0, sunY0, sunZ0);
            if (sunPt) {
                const distToGlobe = Math.hypot(sunPt.sx - gx, sunPt.sy - gy);
                const isBehindGlobe = distToGlobe < screenRadius * 0.96;

                if (!isBehindGlobe) {
                    // Soft, subtle outer solar corona
                    const outerCorona = ctx.createRadialGradient(sunPt.sx, sunPt.sy, 5, sunPt.sx, sunPt.sy, 85);
                    if (isDark) {
                        outerCorona.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
                        outerCorona.addColorStop(0.25, 'rgba(251, 146, 60, 0.10)');
                        outerCorona.addColorStop(0.6, 'rgba(234, 88, 12, 0.03)');
                        outerCorona.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    } else {
                        outerCorona.addColorStop(0, 'rgba(251, 191, 36, 0.22)');
                        outerCorona.addColorStop(0.3, 'rgba(245, 158, 11, 0.08)');
                        outerCorona.addColorStop(0.7, 'rgba(217, 119, 6, 0.02)');
                        outerCorona.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    }
                    ctx.fillStyle = outerCorona;
                    ctx.beginPath();
                    ctx.arc(sunPt.sx, sunPt.sy, 85, 0, Math.PI * 2);
                    ctx.fill();

                    // Refined solar core
                    const innerCore = ctx.createRadialGradient(sunPt.sx, sunPt.sy, 0, sunPt.sx, sunPt.sy, 11);
                    innerCore.addColorStop(0, '#ffffff');
                    innerCore.addColorStop(0.4, isDark ? '#fef08a' : '#fde047');
                    innerCore.addColorStop(0.85, isDark ? '#f59e0b' : '#d97706');
                    innerCore.addColorStop(1, 'rgba(245, 158, 11, 0)');
                    ctx.fillStyle = innerCore;
                    ctx.beginPath();
                    ctx.arc(sunPt.sx, sunPt.sy, 11, 0, Math.PI * 2);
                    ctx.fill();

                    // Subtle solar rays
                    ctx.strokeStyle = isDark ? 'rgba(254, 240, 138, 0.16)' : 'rgba(245, 158, 11, 0.14)';
                    ctx.lineWidth = 0.7;
                    ctx.beginPath();
                    ctx.moveTo(sunPt.sx - 26, sunPt.sy - 26);
                    ctx.lineTo(sunPt.sx + 26, sunPt.sy + 26);
                    ctx.moveTo(sunPt.sx - 26, sunPt.sy + 26);
                    ctx.lineTo(sunPt.sx + 26, sunPt.sy - 26);
                    ctx.stroke();
                }
            }

            // 5. Subtle Atmospheric Rayleigh Scattering Limb Glow (Earth Halo)
            // Delicate, whisper-subtle and tightly bound to the globe silhouette
            if (screenRadius > 10 && screenRadius < Math.max(width, height) * 2.5) {
                const atmosphereFade = Math.max(0, Math.min(1.0, 1.0 - (zoom - 3.2) / 2.2));

                if (atmosphereFade > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = atmosphereFade;

                    // Asymmetric solar illumination vector
                    let lightAngle = -Math.PI / 4;
                    if (sunPt) {
                        lightAngle = Math.atan2(sunPt.sy - gy, sunPt.sx - gx);
                    }
                    const lightOffsetX = Math.cos(lightAngle) * (screenRadius * 0.012);
                    const lightOffsetY = Math.sin(lightAngle) * (screenRadius * 0.012);

                    // Outer Atmospheric Glow (Subtle & Tight)
                    const outerHalo = ctx.createRadialGradient(
                        gx + lightOffsetX, gy + lightOffsetY, screenRadius * 0.99,
                        gx, gy, screenRadius * 1.10
                    );

                    if (isDark) {
                        // Basemap-tailored subtle glow
                        if (effectiveLayer === 'ocean') {
                            outerHalo.addColorStop(0, 'rgba(34, 211, 238, 0.18)');
                            outerHalo.addColorStop(0.3, 'rgba(14, 165, 233, 0.08)');
                            outerHalo.addColorStop(0.7, 'rgba(30, 58, 138, 0.02)');
                        } else if (effectiveLayer === 'vibrant') {
                            outerHalo.addColorStop(0, 'rgba(251, 191, 36, 0.16)');
                            outerHalo.addColorStop(0.3, 'rgba(56, 189, 248, 0.08)');
                            outerHalo.addColorStop(0.7, 'rgba(99, 102, 241, 0.02)');
                        } else if (effectiveLayer === 'citylights') {
                            outerHalo.addColorStop(0, 'rgba(96, 165, 250, 0.20)');
                            outerHalo.addColorStop(0.35, 'rgba(139, 92, 246, 0.08)');
                            outerHalo.addColorStop(0.7, 'rgba(30, 27, 75, 0.02)');
                        } else {
                            outerHalo.addColorStop(0, 'rgba(56, 189, 248, 0.20)');
                            outerHalo.addColorStop(0.3, 'rgba(96, 165, 250, 0.09)');
                            outerHalo.addColorStop(0.7, 'rgba(99, 102, 241, 0.02)');
                        }
                        outerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    } else {
                        // Light mode ethereal sky halo
                        if (effectiveLayer === 'vibrant') {
                            outerHalo.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
                            outerHalo.addColorStop(0.35, 'rgba(56, 189, 248, 0.07)');
                        } else {
                            outerHalo.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
                            outerHalo.addColorStop(0.35, 'rgba(96, 165, 250, 0.07)');
                        }
                        outerHalo.addColorStop(0.7, 'rgba(147, 197, 253, 0.02)');
                        outerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    }

                    ctx.fillStyle = outerHalo;
                    ctx.beginPath();
                    ctx.arc(gx, gy, screenRadius * 1.10, 0, Math.PI * 2);
                    ctx.fill();

                    // Stratospheric Rim (Razor-thin luminous filament)
                    const rimGlow = ctx.createRadialGradient(
                        gx + lightOffsetX * 0.4, gy + lightOffsetY * 0.4, screenRadius * 0.995,
                        gx, gy, screenRadius * 1.035
                    );
                    if (isDark) {
                        rimGlow.addColorStop(0, 'rgba(186, 230, 253, 0.26)');
                        rimGlow.addColorStop(0.4, 'rgba(56, 189, 248, 0.16)');
                        rimGlow.addColorStop(0.85, 'rgba(37, 99, 235, 0.04)');
                        rimGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    } else {
                        rimGlow.addColorStop(0, 'rgba(125, 211, 252, 0.22)');
                        rimGlow.addColorStop(0.4, 'rgba(56, 189, 248, 0.14)');
                        rimGlow.addColorStop(0.85, 'rgba(2, 132, 199, 0.03)');
                        rimGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    }

                    ctx.fillStyle = rimGlow;
                    ctx.beginPath();
                    ctx.arc(gx, gy, screenRadius * 1.035, 0, Math.PI * 2);
                    ctx.fill();

                    // Solid ocean backing disk directly behind globe tiles
                    let oceanBacking = isDark ? '#040714' : '#edf2f7';
                    if (isDark) {
                        if (effectiveLayer === 'ocean') oceanBacking = '#020d1c';
                        else if (effectiveLayer === 'satellite') oceanBacking = '#01040a';
                        else if (effectiveLayer === 'citylights') oceanBacking = '#020617';
                        else if (effectiveLayer === 'vibrant') oceanBacking = '#0a0910';
                    } else {
                        if (effectiveLayer === 'ocean') oceanBacking = '#bae6fd';
                        else if (effectiveLayer === 'vibrant') oceanBacking = '#e8ded2';
                    }

                    ctx.fillStyle = oceanBacking;
                    ctx.beginPath();
                    ctx.arc(gx, gy, screenRadius * 0.995, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.restore();
                }
            }

            ctx.restore();
            animFrameRef.current = requestAnimationFrame(render);
        };

        animFrameRef.current = requestAnimationFrame(render);

        return () => {
            isRunning = false;
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
        };
    }, [map, isGlobe, enabled, isDark, basemap]);

    const isVisible = isGlobe && enabled;

    return (
        <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500 ${
                isVisible ? 'opacity-100 z-0' : 'opacity-0 -z-10'
            }`}
            style={{ width: '100%', height: '100%' }}
        />
    );
};

export default GlobeAtmosphericBackground;
