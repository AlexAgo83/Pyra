import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Color,
  BufferAttribute,
  Vector3,
  WebGLRenderer,
  PCFSoftShadowMap,
} from 'three';

const HomePage = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fpsRef = useRef<HTMLDivElement | null>(null);
  const orbitRef = useRef(true);
  const freeRef = useRef(false);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [freeEnabled, setFreeEnabled] = useState(false);

  useEffect(() => {
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const rand = (x: number, y: number) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    const valueNoise = (x: number, y: number) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const sx = fade(x - x0);
      const sy = fade(y - y0);
      const n00 = rand(x0, y0);
      const n10 = rand(x1, y0);
      const n01 = rand(x0, y1);
      const n11 = rand(x1, y1);
      const ix0 = lerp(n00, n10, sx);
      const ix1 = lerp(n01, n11, sx);
      return lerp(ix0, ix1, sy);
    };

    const fbm = (x: number, y: number) => {
      let value = 0;
      let amplitude = 0.6;
      let frequency = 0.04;
      for (let i = 0; i < 6; i++) {
        value += amplitude * valueNoise(x * frequency, y * frequency);
        frequency *= 2;
        amplitude *= 0.5;
      }
      return value;
    };

    const terrainHeight = (x: number, y: number) => {
      const broadHills = (fbm(x * 0.015, y * 0.015) - 0.5) * 3.5;

      const mBase = fbm(x * 0.07, y * 0.07);
      const mountains = Math.pow(Math.max(0, mBase - 0.33), 2.35) * 17;

      const lakeBase = fbm((x + 150) * 0.045, (y - 120) * 0.045);
      const lakes = Math.max(0, 0.6 - lakeBase) * -6.5;

      const midDetail = (fbm(x * 0.12, y * 0.12) - 0.5) * 2.2;
      const ripples = Math.sin(x * 0.06) * 0.22 + Math.cos(y * 0.052) * 0.18;
      const uplift = 1.2;

      return broadHills + mountains + lakes + midDetail + ripples + uplift;
    };

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 1, 0.1, 400);
    camera.position.set(30, 18, 30);
    camera.lookAt(0, 0, 0);

    const ambient = new AmbientLight(0xffffff, 0.55);
    const directional = new DirectionalLight(0xffffff, 1.15);
    directional.position.set(22, 14, 8);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    scene.add(ambient, directional);

    const groundGeometry = new PlaneGeometry(640, 640, 480, 480);
    const positions = groundGeometry.attributes.position;
    const heightScale = 3.3;
    const heights: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const height = terrainHeight(x, y) * heightScale;
      heights.push(height);
    }

    const sorted = [...heights].sort((a, b) => a - b);
    const seaFraction = 0.15;
    const seaIndex = Math.floor(sorted.length * seaFraction);
    const seaLevel = sorted[Math.min(sorted.length - 1, Math.max(0, seaIndex))];

    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
      const adjusted = heights[i] - seaLevel;
      positions.setZ(i, adjusted);
      if (adjusted < minHeight) minHeight = adjusted;
      if (adjusted > maxHeight) maxHeight = adjusted;
    }
    groundGeometry.computeVertexNormals();
    const range = Math.max(0.0001, maxHeight - minHeight);

    for (let i = 0; i < positions.count; i++) {
      const h = positions.getZ(i);
      const tRaw = clamp01((h - minHeight) / range);
      const tSmooth = tRaw * tRaw * (3 - 2 * tRaw);

      const low = new Color(0x2a74d2);
      const mid = new Color(0xcdd2c8);
      const high = new Color(0xd44c4c);

      let c = new Color();
      if (tSmooth < 0.5) {
        const tt = tSmooth * 2;
        c = low.clone().lerp(mid, tt);
      } else {
        const tt = (tSmooth - 0.5) * 2;
        c = mid.clone().lerp(high, tt);
      }

      const contours = 18;
      const cVal = (tSmooth * contours) % 1;
      const contourStrength = cVal < 0.04 ? 0.18 : 0;
      c = c.multiplyScalar(0.9 - contourStrength);

      colors.push(c.r, c.g, c.b);
    }

    groundGeometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));

    const groundMaterial = new MeshStandardMaterial({
      color: 0xe6eef5,
      roughness: 0.8,
      metalness: 0.08,
      vertexColors: true,
    });
    const ground = new Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    directional.castShadow = true;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();

    let animationId = 0;
    let lastTime = performance.now();
    let fpsValue = 0;
    const defaultCam = new Vector3(30, 18, 30);
    const manualCamPos = defaultCam.clone();
    const baseOrbitRadius = 55;
    const baseOrbitHeight = 22;

    const handleMouseMove = (event: MouseEvent) => {
      if (!freeRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      const theta = nx * Math.PI * 1.8;
      const radius = baseOrbitRadius * 1.1;
      const camX = Math.cos(theta) * radius;
      const camZ = Math.sin(theta) * radius;
      const camY = baseOrbitHeight + Math.max(-8, Math.min(12, -ny * 24));
      manualCamPos.set(camX, camY, camZ);
    };

    const moveCameraOnPlane = (forward: number, strafe: number) => {
      const dir = new Vector3().subVectors(new Vector3(0, 0, 0), manualCamPos);
      dir.y = 0;
      if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
      dir.normalize();
      const right = new Vector3().crossVectors(dir, new Vector3(0, 1, 0)).normalize();
      manualCamPos.addScaledVector(dir, forward);
      manualCamPos.addScaledVector(right, strafe);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        freeRef.current = false;
        setFreeEnabled(false);
        orbitRef.current = true;
        setOrbitEnabled(true);
        manualCamPos.copy(defaultCam);
      }
      const move = 4;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        orbitRef.current = false;
        setOrbitEnabled(false);
        if (event.key === 'ArrowUp') moveCameraOnPlane(move, 0);
        if (event.key === 'ArrowDown') moveCameraOnPlane(-move, 0);
        if (event.key === 'ArrowLeft') moveCameraOnPlane(0, -move);
        if (event.key === 'ArrowRight') moveCameraOnPlane(0, move);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    const renderLoop = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;
      const currentFps = delta > 0 ? 1000 / delta : 0;
      fpsValue = fpsValue * 0.9 + currentFps * 0.1;
      if (fpsRef.current) {
        fpsRef.current.textContent = `${fpsValue.toFixed(0)} fps`;
      }

      if (orbitRef.current) {
        const time = now * 0.00018;
        const radius = baseOrbitRadius;
        const camX = Math.cos(time) * radius;
        const camZ = Math.sin(time) * radius;
        camera.position.set(camX, baseOrbitHeight, camZ);
        camera.lookAt(0, 0, 0);
      } else {
        camera.position.copy(manualCamPos);
        camera.lookAt(0, 0, 0);
      }

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="canvas-page">
      <div className="canvas-frame" ref={containerRef}>
        <div className="canvas-hud">
          <div className="fps-chip" ref={fpsRef}>
            --
          </div>
          <div className="hud-controls">
            <button
              className="hud-btn"
              type="button"
              onClick={() => {
                orbitRef.current = !orbitRef.current;
                if (orbitRef.current) freeRef.current = false;
                setOrbitEnabled(orbitRef.current);
                setFreeEnabled(freeRef.current);
              }}
            >
              Orbit: {orbitEnabled ? 'On' : 'Off'}
            </button>
            <button
              className="hud-btn"
              type="button"
              onClick={() => {
                freeRef.current = !freeRef.current;
                if (freeRef.current) orbitRef.current = false;
                setFreeEnabled(freeRef.current);
                setOrbitEnabled(orbitRef.current);
              }}
            >
              Free view: {freeEnabled ? 'On' : 'Off'}
            </button>
            <button
              className="hud-btn"
              type="button"
              onClick={() => {
                orbitRef.current = true;
                freeRef.current = false;
                manualCamPos.copy(defaultCam);
                setOrbitEnabled(true);
                setFreeEnabled(false);
              }}
            >
              Reset
            </button>
          </div>
        </div>
        <canvas ref={canvasRef} className="canvas-viewport" aria-label="Drawing canvas" />
      </div>
    </div>
  );
};

export default HomePage;
