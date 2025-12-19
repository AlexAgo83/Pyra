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
  DoubleSide,
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

const BASE_GRAVITY = -39.28 * 2;

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
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const manualCamRef = useRef<Vector3>(new Vector3());
  const orbitTargetRef = useRef<Vector3>(new Vector3(0, 0, 0));
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const orbitHeightRef = useRef(260);
  const [orbitOn, setOrbitOn] = useState(true);
  const orbitSpeedRef = useRef(1);
  const followRef = useRef<PhysEntry | null>(null);
  const followOffsetRef = useRef<Vector3 | null>(null);
  const [chunkInfo, setChunkInfo] = useState<{ cx: number; cz: number }>({ cx: 0, cz: 0 });
  const [mountainScale, setMountainScale] = useState(1);
  const [lakeScale, setLakeScale] = useState(1);
  const [cameraHeight, setCameraHeight] = useState(260);
  const cameraHeightRef = useRef(260);
  const [gravityScale, setGravityScale] = useState(1);
  const [bounceScale, setBounceScale] = useState(1);
  const [orbitSpeed, setOrbitSpeed] = useState(1);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    mountains: true,
    lakes: true,
    camHeight: true,
    gravity: true,
    bounce: true,
    orbitSpeed: true,
  });
  const [showControls, setShowControls] = useState(false);
  const worldRef = useRef<World | null>(null);
  const contactRefs = useRef<{
    defaultContact: ContactMaterial | null;
    groundBox: ContactMaterial | null;
    groundBall: ContactMaterial | null;
  }>({
    defaultContact: null,
    groundBox: null,
    groundBall: null,
  });
  const toThree = (v: Vec3) => new Vector3(v.x, v.y, v.z);
  const focusCameraOn = (sel: PhysEntry | null, opts: { follow?: boolean } = {}) => {
    const cam = cameraRef.current;
    if (!sel || !cam) return;
    const target = toThree(sel.body.position);
    const offset = manualCamRef.current.clone().sub(target);
    if (offset.lengthSq() < 1e-3) {
      offset.set(600, cameraHeightRef.current, 600);
    }
    if (opts.follow) {
      followRef.current = sel;
      followOffsetRef.current = offset.clone();
    } else {
      followRef.current = null;
      followOffsetRef.current = null;
    }
    orbitTargetRef.current.copy(target);
    manualCamRef.current.copy(target).add(offset);
    manualCamRef.current.y = cameraHeightRef.current;
    const dir = target.clone().sub(manualCamRef.current).normalize();
    yawRef.current = Math.atan2(dir.x, dir.z);
    pitchRef.current = Math.asin(dir.y);
    cam.position.copy(manualCamRef.current);
    cam.lookAt(target);
  };

  useEffect(() => {
    orbitSpeedRef.current = orbitSpeed;
  }, [orbitSpeed]);

  useEffect(() => {
    physObjectsRef.current = [];
    selectedRef.current = null;
    setSelectedInfo(null);
    followRef.current = null;
    followOffsetRef.current = null;
    orbitHeightRef.current = cameraHeightRef.current;
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
      const mountains = Math.pow(Math.max(0, mBase - 0.28), 2.35) * 112 * mountainScale;

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
    const sky = new CubeTextureLoader()
      .setPath('/textures/skyboxsun25deg/')
      .load(['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'], () => {
        sky.colorSpace = SRGBColorSpace;
        scene.background = sky;
      });
    textures.push(sky as Texture);
    const camera = new PerspectiveCamera(60, 1, 0.1, 6000);
    camera.position.set(600, 260, 600);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    orbitTargetRef.current.set(0, 0, 0);

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

    const world = new World({ gravity: new Vec3(0, BASE_GRAVITY * gravityScale, 0) });
    worldRef.current = world;
    const groundMat = new CannonMaterial('ground');
    const boxMat = new CannonMaterial('box');
    const ballMat = new CannonMaterial('ball');
    const defaultContact = world.defaultContactMaterial;
    defaultContact.friction = 0.6;
    defaultContact.restitution = 0.2 * bounceScale;
    const groundBox = new ContactMaterial(groundMat, boxMat, { friction: 0.55, restitution: 0.3 * bounceScale });
    const groundBall = new ContactMaterial(groundMat, ballMat, { friction: 0.5, restitution: 0.55 * bounceScale });
    world.addContactMaterial(groundBox);
    world.addContactMaterial(groundBall);
    contactRefs.current = { defaultContact, groundBox, groundBall };

    const heightScale = 3.5;
    const sampleTerrainExtents = () => {
      let minH = Number.POSITIVE_INFINITY;
      let maxH = Number.NEGATIVE_INFINITY;
      const span = 3200;
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps; j++) {
          const x = -span / 2 + (i / steps) * span;
          const z = -span / 2 + (j / steps) * span;
          const h = terrainHeight(x, z) * heightScale;
          if (h < minH) minH = h;
          if (h > maxH) maxH = h;
        }
      }
      return { minH, maxH };
    };

    const { minH: seaLevel, maxH: maxTerrain } = sampleTerrainExtents();
    const globalHeightRange = Math.max(0.0001, maxTerrain - seaLevel);
    const sampleHeight = (x: number, z: number) => terrainHeight(x, z) * heightScale - seaLevel;

    type Chunk = {
      cx: number;
      cz: number;
      mesh: Mesh;
      body: Body;
    };

    const chunkSize = 800;
    const chunkResolution = 64;
    const chunkHalf = chunkSize / 2;
    const elementSize = chunkSize / chunkResolution;
    const chunkRadius = 2;
    const chunkMap = new Map<string, Chunk>();
    const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
    let lastChunkX = Number.NaN;
    let lastChunkZ = Number.NaN;

    const createChunk = (cx: number, cz: number) => {
      const key = chunkKey(cx, cz);
      if (chunkMap.has(key)) return;

      const grid = chunkResolution + 1;
      const vertexHeights: number[] = [];
      const normals = new Float32Array((chunkResolution + 1) * (chunkResolution + 1) * 3);
      const colors: number[] = [];
      const geometry = new PlaneGeometry(chunkSize, chunkSize, chunkResolution, chunkResolution);
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position as BufferAttribute;
      const matrix: number[][] = [];

      for (let i = 0; i <= chunkResolution; i++) {
        const row: number[] = [];
        for (let j = 0; j <= chunkResolution; j++) {
          const x = -chunkHalf + i * elementSize;
          const z = -chunkHalf + j * elementSize;
          const worldX = cx * chunkSize + x;
          const worldZ = cz * chunkSize + z;
          const h = sampleHeight(worldX, worldZ);
          row.push(h);
          const idx = j * grid + i;
          positions.setX(idx, x);
          positions.setZ(idx, z);
          positions.setY(idx, h);
          vertexHeights.push(h);
        }
        matrix.push(row);
      }

      const normal = new Vector3();
      const sampleNormal = (worldX: number, worldZ: number) => {
        const eps = elementSize;
        const hL = sampleHeight(worldX - eps, worldZ);
        const hR = sampleHeight(worldX + eps, worldZ);
        const hD = sampleHeight(worldX, worldZ - eps);
        const hU = sampleHeight(worldX, worldZ + eps);
        normal.set(hL - hR, 2 * eps, hD - hU).normalize();
        return normal;
      };

      for (let i = 0; i <= chunkResolution; i++) {
        for (let j = 0; j <= chunkResolution; j++) {
          const idx = j * grid + i;
          const x = positions.getX(idx);
          const z = positions.getZ(idx);
          const worldX = cx * chunkSize + x;
          const worldZ = cz * chunkSize + z;
          const n = sampleNormal(worldX, worldZ);
          normals[idx * 3 + 0] = n.x;
          normals[idx * 3 + 1] = n.y;
          normals[idx * 3 + 2] = n.z;

          const h = vertexHeights[idx];
          const t = clamp01(h / globalHeightRange);
          const low = new Color(0x3f78c7); // deeper = bluer
          const mid = new Color(0x7fc38b);
          const high = new Color(0x1f4a2e);
          const color = t < 0.5 ? low.clone().lerp(mid, t * 2) : mid.clone().lerp(high, (t - 0.5) * 2);
          colors.push(color.r, color.g, color.b);
        }
      }

      geometry.setAttribute('normal', new BufferAttribute(normals, 3));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));

      const groundMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.08,
        vertexColors: true,
        side: DoubleSide,
      });
      const mesh = new Mesh(geometry, groundMaterial);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.position.set(cx * chunkSize, 0, cz * chunkSize);
      scene.add(mesh);

      const hfShape = new Heightfield(matrix, { elementSize });
      const hfBody = new Body({ mass: 0, material: groundMat });
      hfBody.addShape(hfShape);
      hfBody.position.set(cx * chunkSize - chunkHalf, 0, cz * chunkSize - chunkHalf);
      hfBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      world.addBody(hfBody);

      chunkMap.set(key, { cx, cz, mesh, body: hfBody });
    };

    const disposeChunk = (chunk: Chunk) => {
      scene.remove(chunk.mesh);
      world.removeBody(chunk.body);
      (chunk.mesh.geometry as BufferGeometry).dispose();
      (chunk.mesh.material as Material).dispose();
    };

    const ensureChunksAround = (cx: number, cz: number) => {
      for (let i = -chunkRadius; i <= chunkRadius; i++) {
        for (let j = -chunkRadius; j <= chunkRadius; j++) {
          createChunk(cx + i, cz + j);
        }
      }
      chunkMap.forEach((chunk, key) => {
        if (Math.abs(chunk.cx - cx) > chunkRadius + 1 || Math.abs(chunk.cz - cz) > chunkRadius + 1) {
          disposeChunk(chunk);
          chunkMap.delete(key);
        }
      });
    };

    const chunkFromPosition = (pos: Vector3) => ({
      cx: Math.round(pos.x / chunkSize),
      cz: Math.round(pos.z / chunkSize),
    });

    const updateChunksForCamera = () => {
      const cam = cameraRef.current;
      if (!cam) return;
      const { cx, cz } = chunkFromPosition(cam.position);
      if (cx === lastChunkX && cz === lastChunkZ) return;
      lastChunkX = cx;
      lastChunkZ = cz;
      ensureChunksAround(cx, cz);
      setChunkInfo({ cx, cz });
    };

    ensureChunksAround(0, 0);
    lastChunkX = 0;
    lastChunkZ = 0;

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
      { id: 'ball-9', type: 'ball', pos: new Vector3(-40, 740, 280), radius: 26 },
      { id: 'ball-10', type: 'ball', pos: new Vector3(140, 820, -220), radius: 30 },
      { id: 'ball-11', type: 'ball', pos: new Vector3(-220, 880, 140), radius: 28 },
      { id: 'ball-12', type: 'ball', pos: new Vector3(260, 940, 40), radius: 32 },
      { id: 'ball-13', type: 'ball', pos: new Vector3(0, 1000, 0), radius: 34 },
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
        addBox(item.id, item.pos, item.size, (item.mass ?? 20) * 2);
      }
      if (item.type === 'ball' && item.radius) {
        addSphere(item.id, item.pos, item.radius, (item.mass ?? 12) * 2);
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
        orbitRef.current = true;
        manualCamRef.current.copy(defaultCam);
        yawRef.current = Math.atan2(defaultCam.x, defaultCam.z);
        pitchRef.current = Math.atan2(defaultCam.y, new Vector3(defaultCam.x, 0, defaultCam.z).length());
        setOrbitOn(true);
      }
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') movement.forward = true;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') movement.back = true;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') movement.strafeLeft = true;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') movement.strafeRight = true;
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') movement.forward = false;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') movement.back = false;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') movement.strafeLeft = false;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') movement.strafeRight = false;
    };

    let mouseDown = false;
    let mouseInit = false;
    const onMouseMove = (event: MouseEvent) => {
      if (!freeRef.current || !mouseDown) {
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
      yawRef.current -= dx * sensitivity;
      pitchRef.current -= dy * sensitivity;
      pitchRef.current = Math.max(-1.2, Math.min(1.2, pitchRef.current));
    };
    const onMouseDown = () => {
      mouseDown = true;
      mouseInit = false;
    };
    const onMouseUp = () => {
      mouseDown = false;
      mouseInit = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
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
            position: toThree(found.body.position),
            velocity: toThree(found.body.velocity),
          });
          focusOn(toThree(found.body.position));
        }
      }
    };
    canvas.addEventListener('pointerdown', handlePointerDown);

    let animationId = 0;
    let lastTime = performance.now();
    let fpsValue = 0;
    let lastInfoUpdate = performance.now();
    const currentCamHeight = cameraHeightRef.current;
    const defaultCam = new Vector3(600, currentCamHeight, 600);
    manualCamRef.current.copy(defaultCam);
    const initialChunks = chunkFromPosition(defaultCam);
    ensureChunksAround(initialChunks.cx, initialChunks.cz);
    lastChunkX = initialChunks.cx;
    lastChunkZ = initialChunks.cz;
    setChunkInfo({ cx: initialChunks.cx, cz: initialChunks.cz });
    const baseOrbitRadius = 800;
    yawRef.current = Math.atan2(defaultCam.x, defaultCam.z);
    pitchRef.current = Math.atan2(defaultCam.y, new Vector3(defaultCam.x, 0, defaultCam.z).length());
    const movement = { forward: false, back: false, strafeLeft: false, strafeRight: false };
    let lastMouseX = 0;
    let lastMouseY = 0;

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
        const time = now * 0.00018 * orbitSpeedRef.current;
        const radius = baseOrbitRadius;
        const camX = Math.cos(time) * radius;
        const camZ = Math.sin(time) * radius;
      const orbitHeight = orbitHeightRef.current;
      camera.position.set(orbitTargetRef.current.x + camX, orbitHeight, orbitTargetRef.current.z + camZ);
        camera.lookAt(orbitTargetRef.current);
      } else {
        const isFollowing = !!followRef.current && !!followOffsetRef.current;
        if (isFollowing && followRef.current && followOffsetRef.current) {
          const target = toThree(followRef.current.body.position);
          manualCamRef.current.copy(target).add(followOffsetRef.current);
          manualCamRef.current.y = cameraHeightRef.current;
          const toTarget = target.clone().sub(manualCamRef.current).normalize();
          yawRef.current = Math.atan2(toTarget.x, toTarget.z);
          pitchRef.current = Math.asin(toTarget.y);
          movement.forward = false;
          movement.back = false;
          movement.strafeLeft = false;
          movement.strafeRight = false;
          orbitTargetRef.current.copy(target);
        }
        const dir = new Vector3(
          Math.sin(yawRef.current) * Math.cos(pitchRef.current),
          Math.sin(pitchRef.current),
          Math.cos(yawRef.current) * Math.cos(pitchRef.current)
        ).normalize();
        const right = new Vector3().crossVectors(dir, new Vector3(0, 1, 0)).normalize();
        const moveSpeed = delta * 0.2;
        if (movement.forward) manualCamRef.current.addScaledVector(dir, moveSpeed);
        if (movement.back) manualCamRef.current.addScaledVector(dir, -moveSpeed);
        if (movement.strafeLeft) manualCamRef.current.addScaledVector(right, -moveSpeed);
        if (movement.strafeRight) manualCamRef.current.addScaledVector(right, moveSpeed);

        manualCamRef.current.y = cameraHeightRef.current;
        camera.position.copy(manualCamRef.current);
        const target =
          isFollowing && followRef.current ? toThree(followRef.current.body.position) : manualCamRef.current.clone().add(dir);
        camera.lookAt(target);
      }

      updateChunksForCamera();

      const fixedTimeStep = 1 / 60;
      const clampedDelta = Math.min(0.1, delta / 1000);
      const maxSubSteps = 5;
      world.step(fixedTimeStep, clampedDelta, maxSubSteps);
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
          position: toThree(sel.body.position),
          velocity: toThree(sel.body.velocity),
        });
      }
      if (orbitRef.current && followRef.current) {
        const p = followRef.current.body.position;
        orbitTargetRef.current.set(p.x, p.y, p.z);
      }

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(renderLoop);
    };

    resetSceneRef.current = () => {
      orbitRef.current = true;
      freeRef.current = false;
      const camH = cameraHeightRef.current;
      const resetCam = new Vector3(600, camH, 600);
      manualCamRef.current.copy(resetCam);
      orbitTargetRef.current.set(0, 0, 0);
      followRef.current = null;
      followOffsetRef.current = null;
      yawRef.current = Math.atan2(resetCam.x, resetCam.z);
      pitchRef.current = Math.atan2(resetCam.y, new Vector3(resetCam.x, 0, resetCam.z).length());
      setOrbitOn(true);
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
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose && t.dispose());
      chunkMap.forEach((chunk) => disposeChunk(chunk));
      chunkMap.clear();
      renderer.dispose();
      resetSceneRef.current = undefined;
      worldRef.current = null;
      contactRefs.current = { defaultContact: null, groundBox: null, groundBall: null };
    };
    }, [mountainScale, lakeScale]);

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.gravity.set(0, BASE_GRAVITY * gravityScale, 0);
    const { defaultContact, groundBox, groundBall } = contactRefs.current;
    if (defaultContact) {
      defaultContact.restitution = 0.2 * bounceScale;
    }
    if (groundBox) {
      groundBox.restitution = 0.3 * bounceScale;
    }
    if (groundBall) {
      groundBall.restitution = 0.55 * bounceScale;
    }
    world.bodies.forEach((body) => {
      if (typeof body.wakeUp === 'function') body.wakeUp();
    });
  }, [gravityScale, bounceScale]);

  return (
    <div className="canvas-page">
      <div className="canvas-frame" ref={containerRef}>
        <div className="canvas-hud">
          <div className="fps-chip" ref={fpsRef}>
            --
          </div>
          <div className="fps-chip chunk-chip">
            Chunk: {chunkInfo.cx}, {chunkInfo.cz}
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
              <button
                className="selection-btn"
                type="button"
                onClick={() => {
                  focusCameraOn(selectedRef.current);
                }}
              >
                Center
              </button>
              <button
                className="selection-btn"
                type="button"
                onClick={() => {
                  focusCameraOn(selectedRef.current, { follow: true });
                }}
              >
                Follow
              </button>
              <div className="selection-nav">
                <button
                  className="selection-pill"
                  type="button"
                  onClick={() => {
                    const current = selectedRef.current;
                    if (!current) return;
                    const idx = physObjectsRef.current.findIndex((p) => p.id === current.id);
                    const prevIdx =
                      idx <= 0 ? physObjectsRef.current.length - 1 : (idx - 1 + physObjectsRef.current.length) % physObjectsRef.current.length;
                    const nextSel = physObjectsRef.current[prevIdx];
                    if (nextSel) {
                      const shouldFollow = !!followRef.current;
                      selectedRef.current = nextSel;
                      setSelectedInfo({
                        id: nextSel.id,
                        type: nextSel.type,
                        position: toThree(nextSel.body.position),
                        velocity: toThree(nextSel.body.velocity),
                      });
                      focusCameraOn(nextSel, { follow: shouldFollow });
                    }
                  }}
                  aria-label="Previous object"
                >
                  ‹
                </button>
                <button
                  className="selection-pill"
                  type="button"
                  onClick={() => {
                    const current = selectedRef.current;
                    if (!current) return;
                    const idx = physObjectsRef.current.findIndex((p) => p.id === current.id);
                    const nextIdx = (idx + 1) % physObjectsRef.current.length;
                    const nextSel = physObjectsRef.current[nextIdx];
                    if (nextSel) {
                      const shouldFollow = !!followRef.current;
                      selectedRef.current = nextSel;
                      setSelectedInfo({
                        id: nextSel.id,
                        type: nextSel.type,
                        position: toThree(nextSel.body.position),
                        velocity: toThree(nextSel.body.velocity),
                      });
                      focusCameraOn(nextSel, { follow: shouldFollow });
                    }
                  }}
                  aria-label="Next object"
                >
                  ›
                </button>
              </div>
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
                key: 'orbitSpeed',
                label: 'Orbit speed',
                min: 0,
                max: 3,
                step: 0.05,
                value: orbitSpeed,
                setter: setOrbitSpeed,
                format: (v: number) => `${v.toFixed(2)}x`,
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
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  slider.setter(v);
                  if (slider.key === 'camHeight') {
                    cameraHeightRef.current = v;
                    if (!orbitRef.current) {
                      manualCamRef.current.y = v;
                    }
                    orbitHeightRef.current = v;
                  }
                  if (slider.key === 'orbitSpeed') {
                    orbitSpeedRef.current = v;
                  }
                }}
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
                const toOrbit = !orbitRef.current;
                const cam = cameraRef.current;
                if (!cam) return;
                if (!toOrbit) {
                  manualCamRef.current.copy(cam.position);
                  const dir = new Vector3();
                  cam.getWorldDirection(dir).normalize();
                  yawRef.current = Math.atan2(dir.x, dir.z);
                  pitchRef.current = Math.asin(dir.y);
                }
                orbitRef.current = toOrbit;
                freeRef.current = !toOrbit;
                setOrbitOn(toOrbit);
              }}
            >
              <span>Orbit</span>
              <span className="mode-chip">{orbitOn ? 'ON' : 'OFF'}</span>
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
