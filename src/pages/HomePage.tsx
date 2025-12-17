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
  Texture,
  CubeTextureLoader,
  SRGBColorSpace,
} from 'three';

const HomePage = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fpsRef = useRef<HTMLDivElement | null>(null);
  const orbitRef = useRef(true);
  const freeRef = useRef(false);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [freeEnabled, setFreeEnabled] = useState(false);
  const [mountainScale, setMountainScale] = useState(1);
  const [lakeScale, setLakeScale] = useState(1);

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
      const mountains = Math.pow(Math.max(0, mBase - 0.28), 2.35) * 28 * mountainScale;

      const lakeBase = fbm((x + 150) * 0.045, (y - 120) * 0.045);
      const lakes = Math.max(0, 0.6 - lakeBase) * -1 * lakeScale;

      const midDetail = (fbm(x * 0.12, y * 0.12) - 0.5) * 3.2;
      const ripples = Math.sin(x * 0.06) * 0.26 + Math.cos(y * 0.052) * 0.22;
      const uplift = 10;

      return broadHills + mountains + lakes + midDetail + ripples + uplift;
    };

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const scene = new Scene();
    const sky = new CubeTextureLoader().setCrossOrigin('anonymous').load(
      [
        'https://raw.githubusercontent.com/mrdoob/three.js/r165/examples/textures/cube/skyboxsun25deg/px.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/r165/examples/textures/cube/skyboxsun25deg/nx.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/r165/examples/textures/cube/skyboxsun25deg/py.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/r165/examples/textures/cube/skyboxsun25deg/ny.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/r165/examples/textures/cube/skyboxsun25deg/pz.jpg',
        'https://raw.githubusercontent.com/mrdoob/three.js/r165/examples/textures/cube/skyboxsun25deg/nz.jpg',
      ],
      () => {
        sky.encoding = SRGBColorSpace;
        scene.background = sky as Texture;
      }
    );
    const camera = new PerspectiveCamera(60, 1, 0.1, 6000);
    camera.position.set(600, 260, 600);
    camera.lookAt(0, 0, 0);

    const ambient = new AmbientLight(0xffffff, 0.55);
    const directional = new DirectionalLight(0xffffff, 1.15);
    directional.position.set(22, 14, 8);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    scene.add(ambient, directional);

    const groundGeometry = new PlaneGeometry(3200, 3200, 320, 320);
    const positions = groundGeometry.attributes.position;
    const heightScale = 3.5;
    const heights: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const height = terrainHeight(x, y) * heightScale;
      heights.push(height);
    }

    const seaLevel = Math.min(...heights);

    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
      const adjusted = heights[i] - seaLevel;
      positions.setZ(i, adjusted);
      if (adjusted < minHeight) minHeight = adjusted;
      if (adjusted > maxHeight) maxHeight = adjusted;
    }
    minHeight = 0;
    groundGeometry.computeVertexNormals();
    const range = Math.max(0.0001, maxHeight - minHeight);

    const sampleHeight = (x: number, z: number) => terrainHeight(x, z) * heightScale - seaLevel;

    for (let i = 0; i < positions.count; i++) {
      const h = positions.getZ(i);
      const tRaw = clamp01((h - minHeight) / range);
      const tSmooth = tRaw * tRaw * (3 - 2 * tRaw);
      const bands = 12;
      const tBand = Math.floor(tSmooth * bands) / bands;

      const low = new Color(0x9ccf9f);
      const mid = new Color(0xd8daca);
      const high = new Color(0xd44c4c);

      let c = new Color();
      if (tBand < 0.5) {
        const tt = tBand * 2;
        c = low.clone().lerp(mid, tt);
      } else {
        const tt = (tBand - 0.5) * 2;
        c = mid.clone().lerp(high, tt);
      }

      const contours = 14;
      const cVal = (tBand * contours) % 1;
      const contourStrength = cVal < 0.04 ? 0.2 : 0;
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        freeRef.current = false;
        setFreeEnabled(false);
        orbitRef.current = true;
        setOrbitEnabled(true);
        manualCamPos.copy(defaultCam);
        yaw = Math.atan2(defaultCam.x, defaultCam.z);
        pitch = Math.atan2(defaultCam.y, new Vector3(defaultCam.x, 0, defaultCam.z).length());
      }
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') movement.forward = true;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') movement.back = true;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') movement.turnLeft = true;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') movement.turnRight = true;
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') movement.forward = false;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') movement.back = false;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') movement.turnLeft = false;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') movement.turnRight = false;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!freeRef.current) {
        mouseInit = false;
        return;
      }
      if (!mouseInit) {
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        mouseInit = true;
        return;
      }
      const dx = event.clientX - lastMouseX;
      const dy = event.clientY - lastMouseY;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      const sensitivity = 0.0025;
      yaw += dx * sensitivity;
      pitch -= dy * sensitivity;
      pitch = Math.max(-1.2, Math.min(1.2, pitch));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);

    let animationId = 0;
    let lastTime = performance.now();
    let fpsValue = 0;
    const defaultCam = new Vector3(600, 260, 600);
    const manualCamPos = defaultCam.clone();
    const baseOrbitRadius = 800;
    const baseOrbitHeight = 260;
    let yaw = Math.atan2(defaultCam.x, defaultCam.z);
    let pitch = Math.atan2(defaultCam.y, new Vector3(defaultCam.x, 0, defaultCam.z).length());
    const movement = { forward: false, back: false, turnLeft: false, turnRight: false };
    let lastMouseX = 0;
    let lastMouseY = 0;
    let mouseInit = false;

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
        const dir = new Vector3(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch)
        ).normalize();
        const right = new Vector3().crossVectors(dir, new Vector3(0, 1, 0)).normalize();
        const moveSpeed = delta * 0.2;
        if (movement.forward) manualCamPos.addScaledVector(dir, moveSpeed);
        if (movement.back) manualCamPos.addScaledVector(dir, -moveSpeed);
        if (movement.turnLeft) yaw -= 0.002 * delta * 60;
        if (movement.turnRight) yaw += 0.002 * delta * 60;

        camera.position.copy(manualCamPos);
        const target = manualCamPos.clone().add(dir);
        camera.lookAt(target);
      }

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      renderer.dispose();
    };
  }, [mountainScale, lakeScale]);

  return (
    <div className="canvas-page">
      <div className="canvas-frame" ref={containerRef}>
        <div className="canvas-hud">
          <div className="fps-chip" ref={fpsRef}>
            --
          </div>
          <div className="hud-controls">
            <div className="slider-control">
              <label htmlFor="mountains">Mountains</label>
              <input
                id="mountains"
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={mountainScale}
                onChange={(e) => setMountainScale(parseFloat(e.target.value))}
              />
              <span className="slider-value">{mountainScale.toFixed(2)}x</span>
            </div>
            <div className="slider-control">
              <label htmlFor="lakes">Ocean depth</label>
              <input
                id="lakes"
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={lakeScale}
                onChange={(e) => setLakeScale(parseFloat(e.target.value))}
              />
              <span className="slider-value">{lakeScale.toFixed(2)}x</span>
            </div>
            <button
              className="hud-btn"
              type="button"
              onClick={() => {
                orbitRef.current = !orbitRef.current;
                if (orbitRef.current) {
                  freeRef.current = false;
                  setFreeEnabled(false);
                } else {
                  freeRef.current = true;
                  setFreeEnabled(true);
                }
                setOrbitEnabled(orbitRef.current);
              }}
            >
              Orbit: {orbitEnabled ? 'On' : 'Off'}
            </button>
            <button
              className="hud-btn"
              type="button"
              onClick={() => {
                freeRef.current = !freeRef.current;
                orbitRef.current = !freeRef.current;
                setFreeEnabled(freeRef.current);
                setOrbitEnabled(orbitRef.current);
              }}
            >
              Free: {freeEnabled ? 'On' : 'Off'}
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
                yaw = Math.atan2(defaultCam.x, defaultCam.z);
                pitch = Math.atan2(defaultCam.y, new Vector3(defaultCam.x, 0, defaultCam.z).length());
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
