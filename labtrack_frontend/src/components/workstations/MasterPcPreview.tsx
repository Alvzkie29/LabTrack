import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Center, Clone, OrbitControls, useGLTF } from "@react-three/drei";
import { Box3, OrthographicCamera, PCFShadowMap, Vector3 } from "three";
import { Monitor } from "lucide-react";

const MODEL_PATH = "/models/computer.glb";
const PREVIEW_LABEL = "Three-dimensional laboratory Master PC illustration";

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return reducedMotion;
}

/** An illustration fallback, with no device identity or live state. */
function ComputerGeometry() {
  return (
    <group position={[0, 0.07, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[1.7, 1.03, 0.12]} />
        <meshStandardMaterial color="#343138" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.9, 0.066]}>
        <planeGeometry args={[1.5, 0.83]} />
        <meshStandardMaterial color="#e7d7cb" emissive="#d3b7a4" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, 0.31, -0.015]} castShadow>
        <boxGeometry args={[0.11, 0.46, 0.13]} />
        <meshStandardMaterial color="#565159" roughness={0.5} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.06, 0.03]} castShadow>
        <boxGeometry args={[0.62, 0.08, 0.38]} />
        <meshStandardMaterial color="#565159" roughness={0.5} />
      </mesh>
      <mesh position={[-0.1, 0.035, 0.61]} castShadow>
        <boxGeometry args={[1.25, 0.055, 0.32]} />
        <meshStandardMaterial color="#464049" roughness={0.75} />
      </mesh>
      <mesh position={[0.78, 0.04, 0.61]} castShadow>
        <boxGeometry args={[0.17, 0.07, 0.26]} />
        <meshStandardMaterial color="#464049" roughness={0.75} />
      </mesh>
    </group>
  );
}

function ComputerModel() {
  const { scene } = useGLTF(MODEL_PATH);
  const scale = useMemo(() => {
    const dimensions = new Box3().setFromObject(scene).getSize(new Vector3());
    return 2 / Math.max(dimensions.x, dimensions.y, dimensions.z, 0.001);
  }, [scene]);
  return (
    <group position={[0, 0.07, 0]} scale={scale}>
      <Center top>
        <Clone object={scene} castShadow receiveShadow />
      </Center>
    </group>
  );
}

class IllustrationBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function FrameComputer() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    camera.zoom = Math.max(1, Math.min(size.width / 3.7, size.height / 3.1));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}

function IllustrationScene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <>
      <color attach="background" args={["#f7f5f1"]} />
      <ambientLight intensity={1.8} />
      <hemisphereLight args={["#ffffff", "#b9ada6", 1]} />
      <directionalLight position={[-3, 6, 4]} intensity={2.1} castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4}
        shadow-camera-top={4} shadow-camera-bottom={-4} shadow-normalBias={0.035}
        shadow-bias={-0.0004} shadow-radius={3} />
      <directionalLight position={[4, 2, -3]} intensity={0.5} color="#fff0d3" />
      <mesh position={[0, -0.035, 0]} receiveShadow>
        <boxGeometry args={[2.6, 0.07, 1.95]} />
        <meshStandardMaterial color="#ede7df" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#f7f5f1" roughness={1} />
      </mesh>
      <IllustrationBoundary fallback={<ComputerGeometry />}>
        <Suspense fallback={<ComputerGeometry />}>
          <ComputerModel />
        </Suspense>
      </IllustrationBoundary>
      <OrbitControls target={[0, 0.64, 0]} enablePan={false} enableZoom={false}
        enableDamping={!reducedMotion} minPolarAngle={0.7} maxPolarAngle={1.35}
        minAzimuthAngle={-0.65} maxAzimuthAngle={0.95} />
      <FrameComputer />
    </>
  );
}

function StaticComputer() {
  return (
    <div className="flex h-full min-h-[180px] w-full items-center justify-center bg-[#f7f5f1]">
      <Monitor className="size-20 text-[#800000]" strokeWidth={1.1} aria-hidden="true" />
    </div>
  );
}

export function MasterPcPreview({ className = "" }: { className?: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <div className={`relative h-full min-h-[180px] w-full overflow-hidden ${className}`}
      role="img" aria-label={PREVIEW_LABEL}>
      <IllustrationBoundary fallback={<StaticComputer />}>
        <Canvas orthographic frameloop="demand" dpr={[1, 1.5]}
          camera={{ position: [4, 3.1, 5], zoom: 60, near: 0.1, far: 60 }}
          shadows={{ type: PCFShadowMap }} gl={{ antialias: true, alpha: false }}
          fallback={<StaticComputer />}>
          <IllustrationScene reducedMotion={reducedMotion} />
        </Canvas>
      </IllustrationBoundary>
    </div>
  );
}

export default MasterPcPreview;
