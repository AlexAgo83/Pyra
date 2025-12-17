import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Color,
  BufferAttribute,
  SphereGeometry,
  Vector3,
  Vector2,
  Raycaster,
  WebGLRenderer,
  PCFSoftShadowMap,
  Texture,
  CubeTextureLoader,
  SRGBColorSpace,
  Material,
} from 'three';
import {
  Body,
  Box as CannonBox,
  Heightfield,
  Material as CannonMaterial,
  ContactMaterial,
  Sphere as CannonSphere,
  Vec3,
  World,
} from 'cannon-es';

const HomePage = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fpsRef = useRef<HTMLDivElement | null>(null);
  const orbitRef = useRef(true);
  const freeRef = useRef(false);
  type PhysKind = 'box' | 'ball';
  type PhysEntry = { id: string; body: Body; mesh: Mesh; initial: Vector3; type: PhysKind };

  const physObjectsRef = useRef<PhysEntry[]>([]);
  const resetSceneRef = useRef<() => void>();
  const selectedRef = useRef<PhysEntry | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<{
    id: string;
    type: string;
    position: Vector3;
    velocity: Vector3;
  } | null>(null);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [freeEnabled, setFreeEnabled] = useState(false);
  const [mountainScale, setMountainScale] = useState(1);
  const [lakeScale, setLakeScale] = useState(1);
  const [cameraHeight, setCameraHeight] = useState(260);
  const [gravityScale, setGravityScale] = useState(1);
  const [bounceScale, setBounceScale] = useState(1);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    mountains: true,
    lakes: true,
    camHeight: true,
    gravity: true,
    bounce: true,
  });
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    physObjectsRef.current = [];
    selectedRef.current = null;
    setSelectedInfo(null);
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

    const ballColorFromHeight = (h: number) => {
      const t = clamp01((h - 150) / 600);
      const color = new Color().setHSL(0.58 - t * 0.25, 0.35 + t * 0.25, 0.35 + t * 0.25);
      return color.getHex();
    };

    const terrainHeight = (x: number, y: number) => {
      const broadHills = (fbm(x * 0.015, y * 0.015) - 0.5) * 3.5;

      const mBase = fbm(x * 0.07, y * 0.07);
      const mountains = Math.pow(Math.max(0, mBase - 0.28), 2.35) * 56 * mountainScale;

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
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const textures: Texture[] = [];
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
    textures.push(sky as Texture);
    const camera = new PerspectiveCamera(60, 1, 0.1, 6000);
    camera.position.set(600, 260, 600);
    camera.lookAt(0, 0, 0);

    const ambient = new AmbientLight(0xffffff, 0.55);
    const directional = new DirectionalLight(0xffffff, 1.15);
    directional.position.set(0, 4200, 0);
    directional.target.position.set(0, 0, 0);
    directional.castShadow = true;
    directional.shadow.mapSize.set(4096, 4096);
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 12000;
    directional.shadow.camera.left = -3300;
    directional.shadow.camera.right = 3300;
    directional.shadow.camera.top = 3300;
    directional.shadow.camera.bottom = -3300;
    directional.shadow.bias = -0.0003;
    directional.shadow.normalBias = 0.03;
    directional.shadow.radius = 4;
    scene.add(ambient, directional, directional.target);

    const groundSize = 6400;
    const groundGeometry = new PlaneGeometry(groundSize, groundSize, 320, 320);
    groundGeometry.rotateX(-Math.PI / 2);
    geometries.push(groundGeometry);
    const positions = groundGeometry.attributes.position;
    const heightScale = 3.5;
    const heights: number[] = [];
    let seaLevel = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const height = terrainHeight(x, z) * heightScale;
      heights.push(height);
      if (height < seaLevel) seaLevel = height;
      if (height > maxHeight) maxHeight = height;
      positions.setY(i, height);
    }

    let minHeight = Number.POSITIVE_INFINITY;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
      const adjusted = heights[i] - seaLevel;
      positions.setY(i, adjusted);
      if (adjusted < minHeight) minHeight = adjusted;
      if (adjusted > maxHeight) maxHeight = adjusted;
    }
    minHeight = 0;
    groundGeometry.computeVertexNormals();
    const range = Math.max(0.0001, maxHeight - minHeight);

    const sampleHeight = (x: number, z: number) => terrainHeight(x, z) * heightScale - seaLevel;

    for (let i = 0; i < positions.count; i++) {
      const h = positions.getY(i);
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
    materials.push(groundMaterial);
    const ground = new Mesh(groundGeometry, groundMaterial);
    ground.receiveShadow = true;
    ground.castShadow = false;
    scene.add(ground);

    const baseGravity = -39.28;
    const world = new World({ gravity: new Vec3(0, baseGravity * gravityScale, 0) });
    const groundMat = new CannonMaterial('ground');
    const boxMat = new CannonMaterial('box');
    const ballMat = new CannonMaterial('ball');
    world.defaultContactMaterial.friction = 0.6;
    world.defaultContactMaterial.restitution = 0.2 * bounceScale;
    world.addContactMaterial(
      new ContactMaterial(groundMat, boxMat, { friction: 0.55, restitution: 0.3 * bounceScale })
    );
    world.addContactMaterial(
      new ContactMaterial(groundMat, ballMat, { friction: 0.5, restitution: 0.55 * bounceScale })
    );

    const hfResolution = 64;
    const elementSize = groundSize / hfResolution;
    const halfSize = (hfResolution * elementSize) / 2;
    const matrix: number[][] = [];
    for (let i = 0; i <= hfResolution; i++) {
      const row: number[] = [];
      for (let j = 0; j <= hfResolution; j++) {
        const x = -halfSize + i * elementSize;
        const z = halfSize - j * elementSize;
        row.push(sampleHeight(x, z));
      }
      matrix.push(row);
    }

    const hfShape = new Heightfield(matrix, { elementSize });
    const hfBody = new Body({ mass: 0, material: groundMat });
    hfBody.addShape(hfShape);
    hfBody.position.set(-halfSize, 0, halfSize);
    hfBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(hfBody);

    const physObjects = physObjectsRef.current;
    const focusOn = (_target: Vector3) => {
      // Selection only; camera stays put.
    };

    const spawnItems: Array<{
      id: string;
      type: PhysKind;
      pos: Vector3;
      size?: number;
      radius?: number;
      mass?: number;
    }> = [
      { id: 'box-1', type: 'box', pos: new Vector3(0, 200, 0), size: 50 },
      { id: 'box-2', type: 'box', pos: new Vector3(-200, 260, 120), size: 70 },
      { id: 'ball-1', type: 'ball', pos: new Vector3(180, 240, -150), radius: 40 },
      { id: 'ball-2', type: 'ball', pos: new Vector3(80, 420, 40), radius: 30 },
      { id: 'ball-3', type: 'ball', pos: new Vector3(-140, 460, -60), radius: 35 },
      { id: 'ball-4', type: 'ball', pos: new Vector3(220, 500, 120), radius: 28 },
      { id: 'ball-5', type: 'ball', pos: new Vector3(-60, 540, 180), radius: 26 },
      { id: 'ball-6', type: 'ball', pos: new Vector3(160, 580, -200), radius: 32 },
      { id: 'ball-7', type: 'ball', pos: new Vector3(-260, 620, 40), radius: 30 },
      { id: 'ball-8', type: 'ball', pos: new Vector3(60, 660, 260), radius: 34 },
    ];

    const addBox = (id: string, pos: Vector3, size: number, mass = 20) => {
      const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshStandardMaterial({ color: 0x444955 }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      geometries.push(mesh.geometry as BufferGeometry);
      materials.push(mesh.material);

      const shape = new CannonBox(new Vec3(size / 2, size / 2, size / 2));
      const body = new Body({ mass, material: boxMat, position: new Vec3(pos.x, pos.y, pos.z) });
      body.addShape(shape);
      world.addBody(body);
      physObjects.push({ id, body, mesh, initial: pos.clone(), type: 'box' });
    };

    const addSphere = (id: string, pos: Vector3, radius: number, mass = 12) => {
      const mesh = new Mesh(
        new SphereGeometry(radius, 24, 24),
        new MeshStandardMaterial({ color: ballColorFromHeight(pos.y) })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      geometries.push(mesh.geometry as BufferGeometry);
      materials.push(mesh.material);

      const shape = new CannonSphere(radius);
      const body = new Body({ mass, material: ballMat, position: new Vec3(pos.x, pos.y, pos.z) });
      body.addShape(shape);
      world.addBody(body);
      physObjects.push({ id, body, mesh, initial: pos.clone(), type: 'ball' });
    };

    spawnItems.forEach((item) => {
      if (item.type === 'box' && item.size) {
        addBox(item.id, item.pos, item.size, item.mass ?? 20);
      }
      if (item.type === 'ball' && item.radius) {
        addSphere(item.id, item.pos, item.radius, item.mass ?? 12);
      }
    });

    directional.castShadow = true;

    const raycaster = new Raycaster();
    const pointer = new Vector2();

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
      yaw -= dx * sensitivity;
      pitch -= dy * sensitivity;
      pitch = Math.max(-1.2, Math.min(1.2, pitch));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    const handlePointerDown = (event: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshes = physObjects.map((p) => p.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hit = hits[0].object;
        const found = physObjects.find((p) => p.mesh === hit);
        if (found) {
          selectedRef.current = found;
          setSelectedInfo({
            id: found.id,
            type: found.type,
            position: found.body.position.clone(),
            velocity: found.body.velocity.clone(),
          });
          focusOn(found.body.position.clone());
        }
      }
    };
    canvas.addEventListener('pointerdown', handlePointerDown);

    let animationId = 0;
    let lastTime = performance.now();
    let fpsValue = 0;
    let lastInfoUpdate = performance.now();
    const defaultCam = new Vector3(600, cameraHeight, 600);
    const manualCamPos = defaultCam.clone();
    const baseOrbitRadius = 800;
    const baseOrbitHeight = cameraHeight;
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
        const moveSpeed = delta * 0.2;
        if (movement.forward) manualCamPos.addScaledVector(dir, moveSpeed);
        if (movement.back) manualCamPos.addScaledVector(dir, -moveSpeed);
        if (movement.turnLeft) yaw -= 0.002 * delta * 60;
        if (movement.turnRight) yaw += 0.002 * delta * 60;

        manualCamPos.y = cameraHeight;
        camera.position.copy(manualCamPos);
        const target = manualCamPos.clone().add(dir);
        camera.lookAt(target);
      }

      const fixedTimeStep = 1 / 60;
      world.step(fixedTimeStep, delta / 1000);
      physObjects.forEach(({ body, mesh }) => {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      });
      if (selectedRef.current && now - lastInfoUpdate > 150) {
        lastInfoUpdate = now;
        const sel = selectedRef.current;
        setSelectedInfo({
          id: sel.id,
          type: sel.type,
          position: sel.body.position.clone(),
          velocity: sel.body.velocity.clone(),
        });
      }

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(renderLoop);
    };

    resetSceneRef.current = () => {
      orbitRef.current = true;
      freeRef.current = false;
      manualCamPos.copy(defaultCam);
      setOrbitEnabled(true);
      setFreeEnabled(false);
      yaw = Math.atan2(defaultCam.x, defaultCam.z);
      pitch = Math.atan2(defaultCam.y, new Vector3(defaultCam.x, 0, defaultCam.z).length());
      selectedRef.current = null;
      setSelectedInfo(null);
      physObjects.forEach(({ body, mesh, initial }) => {
        body.position.set(initial.x, initial.y, initial.z);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.quaternion.set(0, 0, 0, 1);
        mesh.position.set(initial.x, initial.y, initial.z);
        mesh.quaternion.set(0, 0, 0, 1);
        if (typeof body.wakeUp === 'function') body.wakeUp();
      });
    };

    renderLoop();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose && t.dispose());
      renderer.dispose();
      resetSceneRef.current = undefined;
    };
    }, [mountainScale, lakeScale, cameraHeight, gravityScale, bounceScale]);

  return (
    <div className="canvas-page">
      <div className="canvas-frame" ref={containerRef}>
        <div className="canvas-hud">
          <div className="fps-chip" ref={fpsRef}>
            --
          </div>
          {selectedInfo && (
            <div className="selection-panel">
              <h4>Selection</h4>
              <p className="info-line">ID: {selectedInfo.id}</p>
              <p className="info-line">Type: {selectedInfo.type}</p>
              <p className="info-line">
                Pos: {selectedInfo.position.x.toFixed(1)}, {selectedInfo.position.y.toFixed(1)},{' '}
                {selectedInfo.position.z.toFixed(1)}
              </p>
              <p className="info-line">
                Vel: {selectedInfo.velocity.x.toFixed(1)}, {selectedInfo.velocity.y.toFixed(1)},{' '}
                {selectedInfo.velocity.z.toFixed(1)}
              </p>
            </div>
          )}
          <div className="hud-controls">
            <div className={`slider-stack ${showControls ? 'visible' : 'hidden'}`}>
              {[
                {
                  key: 'mountains',
                  label: 'Mountains',
                  min: 0.5,
                  max: 3,
                  step: 0.05,
                  value: mountainScale,
                  setter: setMountainScale,
                  format: (v: number) => `${v.toFixed(2)}x`,
                },
                {
                  key: 'lakes',
                  label: 'Ocean depth',
                  min: 0,
                  max: 2,
                  step: 0.05,
                  value: lakeScale,
                  setter: setLakeScale,
                  format: (v: number) => `${v.toFixed(2)}x`,
                },
                {
                  key: 'camHeight',
                  label: 'Camera height',
                  min: 50,
                  max: 500,
                  step: 5,
                  value: cameraHeight,
                  setter: setCameraHeight,
                  format: (v: number) => `${v.toFixed(0)}`,
                },
                {
                  key: 'gravity',
                  label: 'Fall force',
                  min: 0.5,
                  max: 3,
                  step: 0.05,
                  value: gravityScale,
                  setter: setGravityScale,
                  format: (v: number) => `${v.toFixed(2)}x`,
                },
                {
                  key: 'bounce',
                  label: 'Bounce strength',
                  min: 0,
                  max: 2,
                  step: 0.05,
                  value: bounceScale,
                  setter: setBounceScale,
                  format: (v: number) => `${v.toFixed(2)}x`,
                },
              ].map((slider) => (
                <div key={slider.key} className={`slider-control ${collapsed[slider.key] ? 'collapsed' : ''}`}>
                  <div className="slider-header">
                    <label htmlFor={slider.key}>{slider.label}</label>
                    <button
                      className="pill-btn"
                      type="button"
                      onClick={() =>
                        setCollapsed((prev) => ({
                          ...prev,
                          [slider.key]: !prev[slider.key],
                        }))
                      }
                      aria-label={collapsed[slider.key] ? 'Expand' : 'Collapse'}
                    >
                      {collapsed[slider.key] ? '+' : '−'}
                    </button>
                  </div>
                  <div className={`slider-body ${collapsed[slider.key] ? 'is-collapsed' : 'is-open'}`}>
                    {!collapsed[slider.key] && (
                      <>
                        <input
                          id={slider.key}
                          type="range"
                          min={slider.min}
                          max={slider.max}
                          step={slider.step}
                          value={slider.value}
                          onChange={(e) => slider.setter(parseFloat(e.target.value))}
                        />
                        <span className="slider-value">{slider.format(slider.value)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              className={`hud-btn edit-btn ${showControls ? 'is-active' : ''}`}
              type="button"
              onClick={() => setShowControls((v) => !v)}
            >
              Edit
            </button>
            <button
              className="hud-btn mode-btn"
              type="button"
              onClick={() => {
                const nextOrbit = !orbitRef.current;
                orbitRef.current = nextOrbit;
                freeRef.current = !nextOrbit;
                setOrbitEnabled(orbitRef.current);
                setFreeEnabled(freeRef.current);
              }}
            >
              <span>Mode</span>
              <span className="mode-chip">{orbitEnabled ? 'Orbit' : 'Free'}</span>
            </button>
            <button
              className="hud-btn"
              type="button"
              onClick={() => {
                resetSceneRef.current?.();
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
