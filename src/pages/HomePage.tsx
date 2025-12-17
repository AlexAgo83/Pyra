import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Texture,
  Color,
  BufferAttribute,
  Vector3,
  WebGLRenderer,
  RepeatWrapping,
  PCFSoftShadowMap,
} from 'three';

const HomePage = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
      const lakes = Math.max(0, 0.6 - lakeBase) * -10;

      const midDetail = (fbm(x * 0.12, y * 0.12) - 0.5) * 2.6;
      const ripples = Math.sin(x * 0.06) * 0.22 + Math.cos(y * 0.052) * 0.18;

      return broadHills + mountains + lakes + midDetail + ripples;
    };

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 1, 0.1, 150);
    camera.position.set(10, 8, 10);
    camera.lookAt(0, 0, 0);

    const ambient = new AmbientLight(0xffffff, 0.55);
    const directional = new DirectionalLight(0xffffff, 1.15);
    directional.position.set(14, 12, 6);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    scene.add(ambient, directional);

    const groundGeometry = new PlaneGeometry(80, 80, 200, 200);
    const positions = groundGeometry.attributes.position;
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    const heightScale = 3.3;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const height = terrainHeight(x, y) * heightScale;
      positions.setZ(i, height);
      if (height < minHeight) minHeight = height;
      if (height > maxHeight) maxHeight = height;
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
    const renderLoop = () => {
      const time = performance.now() * 0.0002;
      const radius = 12;
      const camX = Math.cos(time) * radius;
      const camZ = Math.sin(time) * radius;
      camera.position.set(camX, 8, camZ);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="canvas-page">
      <div className="canvas-frame" ref={containerRef}>
        <canvas ref={canvasRef} className="canvas-viewport" aria-label="Drawing canvas" />
      </div>
    </div>
  );
};

export default HomePage;
