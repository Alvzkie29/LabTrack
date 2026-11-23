import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Center, Clone, Line, OrbitControls, useGLTF } from "@react-three/drei";
import { Box3, CanvasTexture, ClampToEdgeWrapping, Color, OrthographicCamera, PCFShadowMap, SRGBColorSpace, Vector3 } from "three";

// Optional: add your downloaded GLB here. The component renders an in-code
// computer fallback if the file has not been added or cannot be loaded.
const MODEL_PATH = "/models/computer.glb";
export interface TopologyLaboratory {
  labId: number;
  name: string;
  roomCode: string;
  workstationCount: number;
}

type Node = { id: string; name: string; roomCode: string; x: number; z: number };
const SERVER: Node = { id: "SERVER", name: "Application server", roomCode: "SERVER", x: 0, z: 0 };
export type TopologyView = "2d" | "3d";

export interface LabTopology3DProps {
  laboratories: TopologyLaboratory[];
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
  viewMode?: TopologyView;
  zoom?: number;
  showConnections?: boolean;
  resetKey?: number;
}

function laboratoryNodes(laboratories: TopologyLaboratory[]): Node[] {
  // One master PC per actual laboratory. Rows grow with the data without a cap.
  const rows = Math.ceil(laboratories.length / 2);
  return laboratories.map((lab, index) => ({
    id: `LAB-${lab.labId}`,
    name: lab.name,
    roomCode: lab.roomCode,
    x: index % 2 === 0 ? -3.8 : 3.8,
    z: (Math.floor(index / 2) - (rows - 1) / 2) * 3.1,
  }));
}

/** A lightweight placeholder so the layout works before importing a GLB. */
function FallbackComputer() {
  return (
    <group position={[0, 0.10, 0]}>
      <mesh position={[0, 0.42, 0.08]} castShadow>
        <boxGeometry args={[0.94, 0.56, 0.09]} />
        <meshStandardMaterial color="#4E5158" metalness={0.45} roughness={0.37} />
      </mesh>
      <mesh position={[0, 0.42, 0.133]}>
        <planeGeometry args={[0.81, 0.44]} />
        <meshStandardMaterial color="#8295A2" emissive="#52717E" emissiveIntensity={0.24} />
      </mesh>
      <mesh position={[0, 0.135, 0.08]} castShadow>
        <boxGeometry args={[0.07, 0.24, 0.08]} />
        <meshStandardMaterial color="#6B7077" />
      </mesh>
      <mesh position={[0, 0.045, 0.03]} castShadow>
        <boxGeometry args={[0.36, 0.045, 0.21]} />
        <meshStandardMaterial color="#747982" />
      </mesh>
      <mesh position={[0, 0.045, 0.53]} castShadow>
        <boxGeometry args={[0.76, 0.035, 0.2]} />
        <meshStandardMaterial color="#54575E" />
      </mesh>
    </group>
  );
}

function ImportedComputer() {
  const { scene } = useGLTF(MODEL_PATH);
  const scale = useMemo(() => {
    const dimensions = new Box3().setFromObject(scene).getSize(new Vector3());
    return 1.05 / Math.max(dimensions.x, dimensions.y, dimensions.z, 0.001);
  }, [scene]);
  return (
    <group position={[0, 0.06, 0]} scale={scale}>
      <Center top><Clone object={scene} /></Center>
    </group>
  );
}

class ComputerModelBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <FallbackComputer /> : this.props.children; }
}

function ComputerAsset() {
  return (
    <ComputerModelBoundary>
      <Suspense fallback={<FallbackComputer />}>
        <ImportedComputer />
      </Suspense>
    </ComputerModelBoundary>
  );
}

/** Central server is visually different from client PCs. */
function ServerRack() {
  return (
    <group position={[0, 0.04, 0]}>
      {[-0.53, 0, 0.53].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.63, 0]} castShadow>
            <boxGeometry args={[0.43, 1.26, 0.7]} />
            <meshStandardMaterial color="#5B3034" roughness={0.55} metalness={0.35} />
          </mesh>
          {Array.from({ length: 5 }, (_, index) => (
            <group key={index}>
              <mesh position={[0, 0.24 + index * 0.2, 0.357]}>
                <boxGeometry args={[0.33, 0.12, 0.014]} />
                <meshStandardMaterial color="#29272C" metalness={0.25} />
              </mesh>
              <mesh position={[0.11, 0.24 + index * 0.2, 0.371]}>
                <sphereGeometry args={[0.018, 8, 8]} />
                <meshBasicMaterial color="#F4C430" />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Selection highlights a relationship; it does not indicate device connectivity. */
function NetworkConnection({ from, to, emphasized }: {
  from: Node;
  to: Node;
  emphasized: boolean;
}) {
  const goingRight = to.x >= from.x;
  const startX = from.x + (goingRight ? 0.95 : -0.95);
  const endX = to.x + (goingRight ? -0.62 : 0.62);
  const turnX = startX + (endX - startX) * 0.55;
  const y = 0.028;
  const points: [number, number, number][] = [
    [startX, y, from.z],
    [turnX, y, from.z],
    [turnX, y, to.z],
    [endX, y, to.z],
  ];
  return (
    <group>
      {emphasized && (
        <Line
          points={points}
          color="#E9AA27"
          lineWidth={4}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      )}
      <Line
        points={points}
        color={emphasized ? "#D69B22" : "#8F8984"}
        lineWidth={emphasized ? 1.75 : 1.15}
        transparent
        opacity={emphasized ? 1 : 0.78}
        depthWrite={false}
      />
    </group>
  );
}

function TopologyNode({ node, server, selected, onSelect }: {
  node: Node;
  server: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    if (!hovered) return;
    gl.domElement.style.cursor = "pointer";
    return () => { gl.domElement.style.cursor = ""; };
  }, [gl, hovered]);
  return (
    <group
      position={[node.x, 0, node.z]}
      onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Slightly raised equipment pads instead of the old blue floor grid. */}
      <mesh position={[0, -0.002, 0]} receiveShadow>
        <boxGeometry args={[server ? 2.12 : 1.4, 0.055, server ? 1.46 : 1.0]} />
        <meshStandardMaterial color={selected ? "#E9D3B2" : hovered ? "#E6DECF" : "#D9D3D0"} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.035, 0]} receiveShadow>
        <boxGeometry args={[server ? 2.04 : 1.32, 0.035, server ? 1.38 : 0.92]} />
        <meshStandardMaterial color={server ? "#ECE2DC" : "#FDFCFB"} roughness={0.68} />
      </mesh>
      {server ? <ServerRack /> : <ComputerAsset />}
    </group>
  );
}

// Upper limit for auto-fit. Higher lets a small network (1–3 labs) fill the stage; large networks are limited by the available space anyway.
const MAX_FIT_ZOOM = 128;

function CameraZoom({ zoomFactor, nodes }: { zoomFactor: number; nodes: Node[] }) {
  const corner = useMemo(() => new Vector3(), []);
  const desktopLayout = useMemo(() => window.matchMedia("(min-width: 1280px)"), []);
  const mobileLayout = useMemo(() => window.matchMedia("(max-width: 767px)"), []);
  useFrame(({ camera, size }) => {
    if (!(camera instanceof OrthographicCamera) || !size.width || !size.height) return;
    // Compute bounds in camera space, so every laboratory stays in frame even
    // when the lab list grows or the user rotates the map.
    camera.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      for (const x of [-1.25, 1.25]) for (const y of [-0.1, 2.2]) for (const z of [-0.9, 0.9]) {
        corner.set(node.x + x, y, node.z + z).applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
      }
    }
    const desktop = desktopLayout.matches;
    const mobile = mobileLayout.matches;
    // Leave room for the dashboard panels and a gap before the network nodes.
    const left = desktop ? 340 : mobile ? 16 : 20;
    const right = desktop ? 378 : mobile ? 66 : 70;
    const top = desktop ? 100 : 28;
    const bottom = desktop ? 64 : 50;
    const availableWidth = Math.max(180, size.width - left - right);
    const availableHeight = Math.max(180, size.height - top - bottom);
    const baseZoom = Math.min(MAX_FIT_ZOOM, availableWidth / Math.max(1, maxX - minX), availableHeight / Math.max(1, maxY - minY));
    camera.zoom = baseZoom * zoomFactor;
    camera.setViewOffset(size.width, size.height,
      (right - left) / 2 + (minX + maxX) / 2 * camera.zoom,
      (bottom - top) / 2 - (minY + maxY) / 2 * camera.zoom,
      size.width, size.height);
    camera.updateProjectionMatrix();
  });
  return null;
}

type LabelElements = RefObject<Map<string, HTMLButtonElement>>;

function ProjectLabels({ nodes, elements }: { nodes: Node[]; elements: LabelElements }) {
  const projected = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const node of nodes) {
      const element = elements.current.get(node.id);
      if (!element) continue;
      projected.set(node.x, node.id === SERVER.id ? 1.75 : 1.22, node.z).project(camera);
      const visible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
      element.style.visibility = visible ? "visible" : "hidden";
      const halfWidth = element.offsetWidth / 2;
      const x = Math.max(halfWidth + 8, Math.min(size.width - halfWidth - 8, (projected.x + 1) * size.width / 2));
      const y = Math.max(element.offsetHeight + 8, Math.min(size.height - 8, (1 - projected.y) * size.height / 2));
      element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    }
  });
  return null;
}

/**
 * A soft radial gradient (opaque centre → transparent edge), drawn once on a canvas.
 * Used for the floor "light pool" and the selected-node halo, so the equipment's
 * own lighting and colours are left exactly as they were.
 */
function useRadialTexture() {
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Floor that is brighter under the topology and falls off toward the edges (emissive pool, shadows still render). */
function StageFloor({ size, poolDiameter, gradient }: { size: number; poolDiameter: number; gradient: CanvasTexture }) {
  const pool = useMemo(() => {
    const t = gradient.clone();
    const repeat = size / poolDiameter;
    t.repeat.set(repeat, repeat);
    t.offset.set(0.5 - repeat / 2, 0.5 - repeat / 2);
    t.needsUpdate = true;
    return t;
  }, [gradient, size, poolDiameter]);
  useEffect(() => () => pool.dispose(), [pool]);
  return (
    <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#D0CBC4" roughness={0.95} emissive={new Color("#4A4540")} emissiveMap={pool} />
    </mesh>
  );
}

/** Soft gold glow on the floor around the selected node's pad. Unlit, so it never washes out the equipment. */
function SelectionHalo({ node, gradient }: { node: Node; gradient: CanvasTexture }) {
  const server = node.id === SERVER.id;
  return (
    <mesh position={[node.x, -0.105, node.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={server ? [4.4, 3.4] : [3.2, 2.5]} />
      <meshBasicMaterial map={gradient} color="#F4C430" transparent opacity={server ? 0.34 : 0.55} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Scene({ nodes, selectedNodeId, onSelectNode, viewMode, showConnections, labelElements }: Omit<LabTopology3DProps, "laboratories"> & { nodes: Node[]; labelElements: LabelElements }) {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const clients = nodes.filter((node) => node.id !== SERVER.id);
  const extent = Math.max(10, ...nodes.map((node) => Math.abs(node.z) + 3));
  // How far the equipment spreads from the centre, so the floor's light pool always covers every lab.
  const radius = Math.max(5.5, ...nodes.map((node) => Math.hypot(node.x, node.z) + 2));
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const gradient = useRadialTexture();
  return (
    <>
      <color attach="background" args={["#D0CBC4"]} />
      <ambientLight intensity={1.65} />
      <hemisphereLight args={["#FFFFFF", "#A49B94", 1.05]} />
      <directionalLight position={[-5, 10, 6]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent} shadow-bias={-0.0005} shadow-normalBias={0.04} />
      <directionalLight position={[-4, 5, -5]} intensity={0.55} color="#F7E7C5" />
      <StageFloor size={Math.max(200, extent * 4)} poolDiameter={radius * 2.6} gradient={gradient} />
      {selectedNode && <SelectionHalo node={selectedNode} gradient={gradient} />}
      <group>
        {showConnections !== false && clients.map((client) => (
          <NetworkConnection
            key={`${client.id}-wire`}
            from={SERVER}
            to={client}
            emphasized={selectedNodeId === client.id}
          />
        ))}
        <TopologyNode
          node={SERVER}
          server
          selected={selectedNodeId === SERVER.id}
          onSelect={onSelectNode}
        />
        {clients.map((client) => (
          <TopologyNode
            key={client.id}
            node={client}
            server={false}
            selected={selectedNodeId === client.id}
            onSelect={onSelectNode}
          />
        ))}
      </group>
      <ProjectLabels nodes={nodes} elements={labelElements} />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate={viewMode !== "2d"}
        enableDamping={!reducedMotion}
        minPolarAngle={viewMode === "2d" ? 0 : 0.36}
        maxPolarAngle={viewMode === "2d" ? 0.001 : 1.21}
        minAzimuthAngle={-0.8}
        maxAzimuthAngle={0.8}
        target={[0, 0, 0]}
      />
    </>
  );
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? this.props.fallback : this.props.children; }
}

function SceneUnavailable({ laboratories, onSelectNode }: Pick<LabTopology3DProps, "laboratories" | "onSelectNode">) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-[#DCD9D4] p-8 text-center text-sm text-[#57606a]" role="status">
      <p className="font-semibold text-[#3B2730]">The 3D view is unavailable in this browser.</p>
      <p>You can still select a laboratory to inspect its details.</p>
      <div className="flex max-w-lg flex-wrap justify-center gap-2">
        <button type="button" onClick={() => onSelectNode(SERVER.id)} className="rounded-md border border-[#CFC7C2] bg-white px-3 py-2 text-[#800000]">Application server</button>
        {laboratories.map((lab) => (
          <button key={lab.labId} type="button" onClick={() => onSelectNode(`LAB-${lab.labId}`)} className="rounded-md border border-[#CFC7C2] bg-white px-3 py-2 text-[#800000]">
            {lab.roomCode} · {lab.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LabTopology3D({ laboratories, viewMode = "3d", zoom = 1, showConnections = true, resetKey = 0, ...rest }: LabTopology3DProps) {
  const labelElements = useRef(new Map<string, HTMLButtonElement>());
  const labels = useMemo(() => [SERVER, ...laboratoryNodes(laboratories)], [laboratories]);
  const distance = Math.max(1, ...labels.map((node) => Math.abs(node.z) / 5));
  const fallback = <SceneUnavailable laboratories={laboratories} onSelectNode={rest.onSelectNode} />;
  return (
    <SceneBoundary key={resetKey} fallback={fallback}>
    <div className="absolute inset-0 isolate" aria-label="Interactive 3D laboratory network visualization">
      <Canvas
        key={`${viewMode}-${resetKey}`}
        frameloop="demand"
        orthographic
        dpr={[1, 1.5]}
        shadows={{ type: PCFShadowMap }}
        camera={{
          position: viewMode === "2d" ? [0, 18 * distance, 0.001] : [8 * distance, 10 * distance, 13 * distance],
          zoom: 80,
          near: 0.1,
          far: Math.max(100, distance * 100),
        }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => rest.onSelectNode("SERVER")}
        fallback={fallback}
      >
        <CameraZoom zoomFactor={zoom} nodes={labels} />
        <Scene
          {...rest}
          nodes={labels}
          viewMode={viewMode}
          zoom={zoom}
          showConnections={showConnections}
          resetKey={resetKey}
          labelElements={labelElements}
        />
      </Canvas>
      {/* Screen-edge vignette: dims the corners, keeps the topology centre bright. Purely visual. */}
      <div className={`topology-vignette ${viewMode === "2d" ? "is-2d" : ""}`} aria-hidden="true" />
      {/* These labels belong to the app's React root. Projecting their positions
          avoids Drei Html's separate roots and synchronous unmount warnings. */}
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
        {labels.map((node) => {
          const selected = node.id === rest.selectedNodeId;
          return (
            <button key={node.id} type="button"
              ref={(element) => { if (element) labelElements.current.set(node.id, element); else labelElements.current.delete(node.id); }}
              onClick={() => rest.onSelectNode(node.id)}
              aria-label={node.id === SERVER.id ? "Inspect application server" : `Inspect ${node.roomCode}, ${node.name}, Master PC`}
              title={node.id === SERVER.id ? "Application server" : `${node.roomCode} · ${node.name} · Master PC`}
              aria-pressed={selected}
              className="ops-node-label pointer-events-auto absolute left-0 top-0 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs font-semibold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#800000]"
              style={{ visibility: "hidden", color: selected ? "#F4C430" : "#3B2730", background: selected ? "#800000" : "rgba(255,255,255,.95)", borderColor: selected ? "#800000" : "#CFC7C2" }}>
              {node.id === SERVER.id ? <><span className="hidden sm:inline">Application server</span><span className="sm:hidden">Server</span></> : (
                <span className="flex max-w-[180px] flex-col items-start text-left">
                  <span>{node.roomCode || "Laboratory"} <span className="font-sans font-normal opacity-75">· Master PC</span></span>
                  <span className="max-w-full truncate font-sans text-[11px] font-normal opacity-80">{node.name}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
    </SceneBoundary>
  );
}