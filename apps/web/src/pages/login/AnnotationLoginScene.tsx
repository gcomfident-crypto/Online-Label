import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const PRIMARY_BLUE = 0x306df7;
const MUTED_CYAN = 0x6ee7f9;
const SOFT_WHITE = 0xf8fbff;
const SILVER = 0xb7c7d9;
const GRAPHITE = 0x111827;
const DEEP_GRAPHITE = 0x080b12;

type FlowDot = THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> & {
  userData: {
    curve: THREE.CatmullRomCurve3;
    offset: number;
    speed: number;
  };
};

export const AnnotationLoginScene = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;

    if (!canvas || !stage || typeof WebGLRenderingContext === 'undefined') {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(DEEP_GRAPHITE, 0.032);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.3, 8.2);

    scene.add(new THREE.AmbientLight(0x9fb7d9, 0.52));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(-2.4, 3.2, 5.2);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(MUTED_CYAN, 1.6, 9, 2.2);
    rimLight.position.set(3.2, 1.4, 3.4);
    scene.add(rimLight);

    const root = new THREE.Group();
    scene.add(root);

    root.add(createGraphiteWorkspace());

    const nodeNetwork = createNodeNetwork();
    root.add(nodeNetwork);

    const panels = new THREE.Group();
    panels.add(createAnnotationPanel(-1.25, -0.42, 0.2, 0.92, PRIMARY_BLUE));
    panels.add(createAnnotationPanel(1.35, -0.15, -0.3, 0.86, MUTED_CYAN));
    panels.add(createTaskPanel(0.05, 0.08, -0.75));
    panels.children.forEach((panel) => {
      panel.userData.baseY = panel.position.y;
    });
    root.add(panels);

    const flowGroup = createDataFlows();
    root.add(flowGroup);

    const pointer = { x: 0, y: 0 };
    const handlePointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', handlePointerMove);

    const resize = () => {
      const width = stage.clientWidth || 1;
      const height = stage.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    const clock = new THREE.Clock();
    let frameId = 0;
    let readyEmitted = false;

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      root.rotation.y += (pointer.x * 0.12 + elapsed * 0.05 - root.rotation.y) * 0.035;
      root.rotation.x += (-pointer.y * 0.07 - root.rotation.x) * 0.04;
      nodeNetwork.rotation.y = elapsed * 0.045;
      nodeNetwork.rotation.x = Math.sin(elapsed * 0.32) * 0.08;

      panels.children.forEach((panel, index) => {
        panel.position.y = panel.userData.baseY + Math.sin(elapsed * 0.84 + index) * 0.08;
        panel.rotation.z = Math.sin(elapsed * 0.48 + index) * 0.018;
      });

      flowGroup.children.forEach((child) => {
        if (!('curve' in child.userData)) {
          return;
        }

        const dot = child as FlowDot;
        const progress = (elapsed * dot.userData.speed + dot.userData.offset) % 1;
        dot.position.copy(dot.userData.curve.getPoint(progress));
        dot.scale.setScalar(0.78 + Math.sin(elapsed * 3 + dot.userData.offset * 10) * 0.12);
      });

      renderer.render(scene, camera);

      if (!readyEmitted) {
        readyEmitted = true;
        setIsReady(true);
      }

      frameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();
      disposeObject(root);
      renderer.dispose();
    };
  }, []);

  return (
    <section
      className={isReady ? 'login-scene is-ready' : 'login-scene'}
      ref={stageRef}
      aria-label="3D 数据流动画"
    >
      <canvas className="login-scene__canvas" ref={canvasRef} />
      <div className="login-scene__glow" aria-hidden="true" />
      <div className="login-scene__fallback-grid" aria-hidden="true" />
      <div className="login-scene__overlay" aria-hidden="true">
        <span>DATA FLOW</span>
        <strong>AI Review · Quality Check</strong>
      </div>
    </section>
  );
};

const createGraphiteWorkspace = () => {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(7.8, 4.8),
    new THREE.MeshStandardMaterial({
      color: GRAPHITE,
      metalness: 0.18,
      opacity: 0.74,
      roughness: 0.86,
      transparent: true,
    }),
  );
  floor.position.set(0.28, -1.72, -1.2);
  floor.rotation.x = -Math.PI / 2.8;
  group.add(floor);

  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 3.4),
    new THREE.MeshBasicMaterial({
      color: DEEP_GRAPHITE,
      opacity: 0.62,
      transparent: true,
    }),
  );
  horizon.position.set(0.32, 0.18, -2.8);
  group.add(horizon);

  const grid = new THREE.GridHelper(6.8, 18, 0x334155, 0x1f2937);
  grid.position.set(0.3, -1.12, -1.18);
  grid.rotation.x = 0.18;
  if (Array.isArray(grid.material)) {
    grid.material.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.22;
    });
  } else {
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
  }
  group.add(grid);

  return group;
};

const createNodeNetwork = () => {
  const group = new THREE.Group();
  const positions: number[] = [];
  const linePositions: number[] = [];
  const nodeCount = 58;

  for (let index = 0; index < nodeCount; index += 1) {
    const angle = index * 0.74;
    const radius = 1.75 + Math.sin(index * 1.7) * 0.54;
    const y = (index % 9 - 4) * 0.32;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.62;

    positions.push(x, y, z);

    if (index > 0 && index % 3 !== 0) {
      const previousOffset = (index - 1) * 3;
      linePositions.push(
        positions[previousOffset],
        positions[previousOffset + 1],
        positions[previousOffset + 2],
        x,
        y,
        z,
      );
    }

    if (index > 6 && index % 5 === 0) {
      const previousOffset = (index - 6) * 3;
      linePositions.push(
        positions[previousOffset],
        positions[previousOffset + 1],
        positions[previousOffset + 2],
        x,
        y,
        z,
      );
    }
  }

  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const pointsMaterial = new THREE.PointsMaterial({
    color: SILVER,
    opacity: 0.64,
    size: 0.038,
    transparent: true,
  });
  group.add(new THREE.Points(pointsGeometry, pointsMaterial));

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: MUTED_CYAN,
    opacity: 0.16,
    transparent: true,
  });
  group.add(new THREE.LineSegments(lineGeometry, lineMaterial));
  group.position.set(0.15, -0.04, -1.1);

  return group;
};

const createAnnotationPanel = (
  x: number,
  y: number,
  z: number,
  scale: number,
  accentColor: number,
) => {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.set(0.08, x < 0 ? 0.22 : -0.2, x < 0 ? -0.06 : 0.05);
  group.scale.setScalar(scale);

  const panelMaterial = new THREE.MeshPhysicalMaterial({
    color: GRAPHITE,
    metalness: 0.1,
    opacity: 0.58,
    roughness: 0.82,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.04, 1.34), panelMaterial);
  group.add(panel);

  const edgeGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.04, 1.34));
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: SILVER,
    opacity: 0.34,
    transparent: true,
  });
  group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

  group.add(createLineBox(-0.18, -0.04, 1.06, 0.62, accentColor));
  group.add(createTagPill(-0.63, 0.42, 0.46, 0.16, accentColor));
  group.add(createTagPill(0.52, -0.48, 0.52, 0.14, MUTED_CYAN));
  group.add(createCheckMark(0.72, 0.42, accentColor));

  return group;
};

const createTaskPanel = (x: number, y: number, z: number) => {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.set(-0.1, -0.12, 0.04);
  group.scale.setScalar(0.86);

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.62, 0.86),
    new THREE.MeshPhysicalMaterial({
      color: GRAPHITE,
      metalness: 0.12,
      opacity: 0.54,
      roughness: 0.84,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  group.add(panel);

  const primary = createTagPill(-0.38, 0.18, 0.72, 0.12, PRIMARY_BLUE);
  const secondary = createTagPill(0.2, -0.1, 0.48, 0.1, SILVER);
  group.add(primary, secondary, createCheckMark(0.58, 0.18, MUTED_CYAN));

  return group;
};

const createLineBox = (
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
) => {
  const points = [
    new THREE.Vector3(x - width / 2, y - height / 2, 0.02),
    new THREE.Vector3(x + width / 2, y - height / 2, 0.02),
    new THREE.Vector3(x + width / 2, y + height / 2, 0.02),
    new THREE.Vector3(x - width / 2, y + height / 2, 0.02),
    new THREE.Vector3(x - width / 2, y - height / 2, 0.02),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    blending: THREE.AdditiveBlending,
    color,
    opacity: 0.82,
    transparent: true,
  });
  return new THREE.Line(geometry, material);
};

const createTagPill = (
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
) => {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color,
      opacity: 0.58,
      transparent: true,
    }),
  );
  mesh.position.set(x, y, 0.04);
  return mesh;
};

const createCheckMark = (x: number, y: number, color: number) => {
  const group = new THREE.Group();
  group.position.set(x, y, 0.05);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.105, 0.128, 28),
    new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color,
      opacity: 0.72,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  group.add(ring);

  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.045, 0, 0.01),
    new THREE.Vector3(-0.008, -0.04, 0.01),
    new THREE.Vector3(0.06, 0.05, 0.01),
  ]);
  const mark = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: SOFT_WHITE,
      opacity: 0.9,
      transparent: true,
    }),
  );
  group.add(mark);

  return group;
};

const createDataFlows = () => {
  const group = new THREE.Group();
  const curves = [
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.6, -1.2, 0.45),
      new THREE.Vector3(-1.05, -0.15, 0.3),
      new THREE.Vector3(0.5, 1.1, -0.6),
      new THREE.Vector3(2.2, 0.35, -0.2),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.1, 1.05, -0.45),
      new THREE.Vector3(-0.65, 0.55, 0.16),
      new THREE.Vector3(0.85, -0.42, -0.28),
      new THREE.Vector3(2.3, -1.02, 0.38),
    ]),
  ];

  curves.forEach((curve, index) => {
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 72, 0.008, 8, false),
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: index === 0 ? PRIMARY_BLUE : MUTED_CYAN,
        opacity: 0.22,
        transparent: true,
      }),
    );
    group.add(tube);

    for (let dotIndex = 0; dotIndex < 3; dotIndex += 1) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 16, 16),
        new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          color: index === 0 ? MUTED_CYAN : SILVER,
          transparent: true,
        }),
      ) as FlowDot;
      dot.userData = {
        curve,
        offset: dotIndex / 3 + index * 0.16,
        speed: 0.1 + index * 0.025,
      };
      group.add(dot);
    }
  });

  return group;
};

const disposeObject = (root: THREE.Object3D) => {
  root.traverse((object) => {
    if ('geometry' in object) {
      (object.geometry as THREE.BufferGeometry | undefined)?.dispose();
    }

    if ('material' in object) {
      const material = object.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else {
        material?.dispose();
      }
    }
  });
};
