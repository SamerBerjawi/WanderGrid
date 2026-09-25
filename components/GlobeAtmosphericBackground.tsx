import { useEffect, useRef, type FC } from 'react';
import type { Map } from 'maplibre-gl';

interface GlobeAtmosphericBackgroundProps {
    map: Map | null;
    isGlobe: boolean;
    isDark?: boolean;
}

interface CelestialObject {
    ra: number;   // Right Ascension (radians)
    dec: number;  // Declination (radians)
    mag: number;  // Brightness (0.1 to 1.0)
    size: number; // Star radius (pixels)
    color: string;
    twinkleSpeed: number;
    phase: number;
}

interface DeepSkyObject {
    ra: number;
    dec: number;
    radius: number;
    color: string;
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

export const GlobeAtmosphericBackground: React.FC<GlobeAtmosphericBackgroundProps> = ({
    map,
    isGlobe,
    isDark = true
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

        // Spectral color palettes
        const colors = [
            '#e0f2fe', // O/B: luminous blue-white
            '#f8fafc', // A: crisp pure white
            '#fef08a', // G: warm solar gold
            '#fed7aa', // K: amber giant
            '#fecdd3'  // M: soft rose/red dwarf
        ];

        // 550 realistic stars distributed across celestial sphere
        for (let i = 0; i < 550; i++) {
            const ra = rand() * Math.PI * 2;
            const dec = Math.asin(rand() * 2 - 1); // Area-uniform spherical distribution
            const mag = Math.pow(rand(), 2.4) * 0.85 + 0.15; // Realistic stellar magnitude curve
            const size = mag > 0.8 ? 1.6 + rand() * 0.9 : mag > 0.5 ? 1.1 + rand() * 0.4 : 0.6 + rand() * 0.4;
            const color = colors[Math.floor(rand() * colors.length)];
            const twinkleSpeed = 0.5 + rand() * 2.0;
            const phase = rand() * Math.PI * 2;

            stars.push({ ra, dec, mag, size, color, twinkleSpeed, phase });
        }

        // Deep sky objects: Milky Way core wisps & distant galaxies
        const deepSky: DeepSkyObject[] = [
            // Milky way galactic dust lane nodes
            { ra: 4.8, dec: -0.45, radius: 90, color: 'rgba(99, 102, 241, 0.05)', type: 'nebula' },
            { ra: 5.1, dec: -0.35, radius: 120, color: 'rgba(168, 85, 247, 0.04)', type: 'nebula' },
            { ra: 5.4, dec: -0.15, radius: 85, color: 'rgba(56, 189, 248, 0.04)', type: 'nebula' },
            { ra: 5.8, dec: 0.15, radius: 100, color: 'rgba(139, 92, 246, 0.035)', type: 'nebula' },
            { ra: 1.8, dec: 0.65, radius: 110, color: 'rgba(59, 130, 246, 0.03)', type: 'nebula' },
            // Distant spiral galaxies
            { ra: 0.72, dec: 0.71, radius: 16, color: 'rgba(254, 240, 138, 0.35)', type: 'galaxy', tilt: 0.65 },
            { ra: 3.45, dec: -0.82, radius: 12, color: 'rgba(224, 231, 255, 0.3)', type: 'galaxy', tilt: -0.4 }
        ];

        celestialCatalogue.current = { stars, deepSky };
    }

    useEffect(() => {
        if (!isGlobe) {
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

            // 1. Deep Space Cosmic Background
            const bgGrad = ctx.createRadialGradient(
                width * 0.5, height * 0.5, Math.min(width, height) * 0.2,
                width * 0.5, height * 0.5, Math.max(width, height) * 0.85
            );
            if (isDark) {
                bgGrad.addColorStop(0, '#040714');
                bgGrad.addColorStop(0.5, '#02040b');
                bgGrad.addColorStop(1, '#010206');
            } else {
                bgGrad.addColorStop(0, '#060a18');
                bgGrad.addColorStop(0.5, '#03050e');
                bgGrad.addColorStop(1, '#010207');
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

                    if (dso.type === 'nebula') {
                        const nebGrad = ctx.createRadialGradient(pt.sx, pt.sy, 0, pt.sx, pt.sy, dso.radius);
                        nebGrad.addColorStop(0, dso.color);
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
                        galGrad.addColorStop(0, dso.color);
                        galGrad.addColorStop(0.3, 'rgba(199, 210, 254, 0.12)');
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
                    const twinkle = 0.8 + 0.2 * Math.sin(tSeconds * star.twinkleSpeed + star.phase);
                    const currentAlpha = star.mag * twinkle;

                    ctx.fillStyle = star.color;
                    ctx.globalAlpha = Math.max(0.1, Math.min(1.0, currentAlpha));

                    ctx.beginPath();
                    ctx.arc(pt.sx, pt.sy, star.size, 0, Math.PI * 2);
                    ctx.fill();

                    // Bright landmark stars receive subtle diffraction sparkle
                    if (star.mag > 0.85 && star.size >= 1.8) {
                        ctx.strokeStyle = star.color;
                        ctx.globalAlpha = currentAlpha * 0.35;
                        ctx.lineWidth = 0.6;
                        ctx.beginPath();
                        ctx.moveTo(pt.sx - star.size * 2.8, pt.sy);
                        ctx.lineTo(pt.sx + star.size * 2.8, pt.sy);
                        ctx.moveTo(pt.sx, pt.sy - star.size * 2.8);
                        ctx.lineTo(pt.sx, pt.sy + star.size * 2.8);
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = 1.0;
            }

            // 4. Render The Sun (Distant celestial light source & corona)
            // Sun coordinates: RA = 215°, Dec = 18°
            const sunRa = (215 * Math.PI) / 180;
            const sunDec = (18 * Math.PI) / 180;
            const sunX0 = Math.cos(sunDec) * Math.sin(sunRa);
            const sunY0 = Math.sin(sunDec);
            const sunZ0 = Math.cos(sunDec) * Math.cos(sunRa);

            const sunPt = projectCelestial(sunX0, sunY0, sunZ0);
            if (sunPt) {
                const distToGlobe = Math.hypot(sunPt.sx - gx, sunPt.sy - gy);
                const isBehindGlobe = distToGlobe < screenRadius * 0.96;

                // Only draw Sun when not completely eclipsed by the Earth
                if (!isBehindGlobe) {
                    // Soft expansive outer solar corona
                    const outerCorona = ctx.createRadialGradient(sunPt.sx, sunPt.sy, 6, sunPt.sx, sunPt.sy, 110);
                    outerCorona.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
                    outerCorona.addColorStop(0.2, 'rgba(251, 146, 60, 0.18)');
                    outerCorona.addColorStop(0.5, 'rgba(234, 88, 12, 0.06)');
                    outerCorona.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = outerCorona;
                    ctx.beginPath();
                    ctx.arc(sunPt.sx, sunPt.sy, 110, 0, Math.PI * 2);
                    ctx.fill();

                    // Brilliant inner core
                    const innerCore = ctx.createRadialGradient(sunPt.sx, sunPt.sy, 0, sunPt.sx, sunPt.sy, 14);
                    innerCore.addColorStop(0, '#ffffff');
                    innerCore.addColorStop(0.4, '#fef08a');
                    innerCore.addColorStop(0.8, '#f59e0b');
                    innerCore.addColorStop(1, 'rgba(245, 158, 11, 0)');
                    ctx.fillStyle = innerCore;
                    ctx.beginPath();
                    ctx.arc(sunPt.sx, sunPt.sy, 14, 0, Math.PI * 2);
                    ctx.fill();

                    // Subtle solar flare rays
                    ctx.strokeStyle = 'rgba(254, 240, 138, 0.22)';
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.moveTo(sunPt.sx - 35, sunPt.sy - 35);
                    ctx.lineTo(sunPt.sx + 35, sunPt.sy + 35);
                    ctx.moveTo(sunPt.sx - 35, sunPt.sy + 35);
                    ctx.lineTo(sunPt.sx + 35, sunPt.sy - 35);
                    ctx.stroke();
                }
            }

            // 5. Atmospheric Rayleigh Scattering Limb Glow (Earth Halo)
            // Rendered right at the globe's screen circle
            if (screenRadius > 10 && screenRadius < Math.max(width, height) * 2.5) {
                // Smooth atmospheric scale factor based on zoom (fades as user zooms deep into cities)
                const atmosphereFade = Math.max(0, Math.min(1.0, 1.0 - (zoom - 3.2) / 2.2));

                if (atmosphereFade > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = atmosphereFade;

                    // Asymmetric solar illumination vector
                    let lightAngle = -Math.PI / 4;
                    if (sunPt) {
                        lightAngle = Math.atan2(sunPt.sy - gy, sunPt.sx - gx);
                    }
                    const lightOffsetX = Math.cos(lightAngle) * (screenRadius * 0.015);
                    const lightOffsetY = Math.sin(lightAngle) * (screenRadius * 0.015);

                    // Outer Atmospheric Glow
                    const outerHalo = ctx.createRadialGradient(
                        gx + lightOffsetX, gy + lightOffsetY, screenRadius * 0.98,
                        gx, gy, screenRadius * 1.18
                    );
                    outerHalo.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
                    outerHalo.addColorStop(0.2, 'rgba(96, 165, 250, 0.22)');
                    outerHalo.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)');
                    outerHalo.addColorStop(0.85, 'rgba(14, 165, 233, 0.02)');
                    outerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');

                    ctx.fillStyle = outerHalo;
                    ctx.beginPath();
                    ctx.arc(gx, gy, screenRadius * 1.18, 0, Math.PI * 2);
                    ctx.fill();

                    // Sharp Stratospheric Luminous Blue Rim
                    const rimGlow = ctx.createRadialGradient(
                        gx + lightOffsetX * 0.5, gy + lightOffsetY * 0.5, screenRadius * 0.99,
                        gx, gy, screenRadius * 1.05
                    );
                    rimGlow.addColorStop(0, 'rgba(186, 230, 253, 0.5)');
                    rimGlow.addColorStop(0.35, 'rgba(56, 189, 248, 0.35)');
                    rimGlow.addColorStop(0.8, 'rgba(37, 99, 235, 0.12)');
                    rimGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

                    ctx.fillStyle = rimGlow;
                    ctx.beginPath();
                    ctx.arc(gx, gy, screenRadius * 1.05, 0, Math.PI * 2);
                    ctx.fill();

                    // Solid ocean backing disk directly behind globe tiles to prevent see-through
                    ctx.fillStyle = isDark ? '#040714' : '#0a1128';
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
    }, [map, isGlobe, isDark]);

    return (
        <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-700 ${
                isGlobe ? 'opacity-100 z-0' : 'opacity-0 -z-10'
            }`}
            style={{ width: '100%', height: '100%' }}
        />
    );
};

export default GlobeAtmosphericBackground;
