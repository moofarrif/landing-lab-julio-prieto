import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

// ─── Scroll-driven progress (0→1) ───
function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const scrollArea = document.getElementById('inicio');
    if (!scrollArea) return;

    const onScroll = () => {
      const rect = scrollArea.getBoundingClientRect();
      // scrollArea is 250vh tall, viewport is 100vh
      // scrollable distance = 250vh - 100vh = 150vh
      const scrollable = scrollArea.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      const p = Math.max(0, Math.min(1, scrolled / scrollable));
      setProgress(p);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return progress;
}

// ─── Tooth abutment (prepared tooth / muñón) ───
function Abutment() {
  const geo = useMemo(() => {
    const slices = 40;
    const pts = 48;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const height = 0.7;

    for (let j = 0; j <= slices; j++) {
      const v = j / slices;
      const y = -height / 2 + v * height;

      let radius: number;
      if (v < 0.15) {
        radius = THREE.MathUtils.lerp(0.22, 0.26, v / 0.15);
      } else if (v < 0.7) {
        radius = THREE.MathUtils.lerp(0.26, 0.2, (v - 0.15) / 0.55);
      } else {
        radius = THREE.MathUtils.lerp(0.2, 0.14, (v - 0.7) / 0.3);
      }

      for (let i = 0; i <= pts; i++) {
        const u = i / pts;
        const angle = u * Math.PI * 2;
        const rx = radius * 1.15;
        const rz = radius * 0.85;
        positions.push(Math.cos(angle) * rx, y, Math.sin(angle) * rz);
        uvs.push(u, v);
      }
    }

    for (let j = 0; j < slices; j++) {
      for (let i = 0; i < pts; i++) {
        const a = j * (pts + 1) + i;
        const b = a + 1;
        const c = a + (pts + 1);
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    // Top cap
    const topCenter = positions.length / 3;
    positions.push(0, height / 2, 0);
    uvs.push(0.5, 1);
    const topRow = slices * (pts + 1);
    for (let i = 0; i < pts; i++) {
      indices.push(topCenter, topRow + i, topRow + ((i + 1) % pts));
    }

    // Bottom cap
    const botCenter = positions.length / 3;
    positions.push(0, -height / 2, 0);
    uvs.push(0.5, 0);
    for (let i = 0; i < pts; i++) {
      indices.push(botCenter, (i + 1) % pts, i);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geo} position={[0, -0.25, 0]}>
      <meshPhysicalMaterial
        color="#ddd5c8"
        roughness={0.45}
        metalness={0}
        clearcoat={0.15}
        clearcoatRoughness={0.4}
      />
    </mesh>
  );
}

// ─── Crown (corona dental) ───
function Crown({ scrollProgress }: { scrollProgress: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geo = useMemo(() => {
    const slices = 50;
    const pts = 56;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const height = 0.8;

    for (let j = 0; j <= slices; j++) {
      const v = j / slices;
      const y = -height / 2 + v * height;

      let halfWidth: number;
      let halfDepth: number;
      let squareness: number;

      if (v < 0.05) {
        halfWidth = THREE.MathUtils.lerp(0.28, 0.30, v / 0.05);
        halfDepth = THREE.MathUtils.lerp(0.08, 0.12, v / 0.05);
        squareness = 3.0;
      } else if (v < 0.35) {
        const t = (v - 0.05) / 0.3;
        halfWidth = THREE.MathUtils.lerp(0.30, 0.32, t);
        halfDepth = THREE.MathUtils.lerp(0.12, 0.20, t);
        squareness = THREE.MathUtils.lerp(3.0, 2.5, t);
      } else if (v < 0.65) {
        const t = (v - 0.35) / 0.3;
        halfWidth = THREE.MathUtils.lerp(0.32, 0.29, t);
        halfDepth = THREE.MathUtils.lerp(0.20, 0.22, t);
        squareness = THREE.MathUtils.lerp(2.5, 2.3, t);
      } else {
        const t = (v - 0.65) / 0.35;
        halfWidth = THREE.MathUtils.lerp(0.29, 0.18, t * t);
        halfDepth = THREE.MathUtils.lerp(0.22, 0.15, t * t);
        squareness = THREE.MathUtils.lerp(2.3, 2.0, t);
      }

      for (let i = 0; i <= pts; i++) {
        const u = i / pts;
        const angle = u * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        let x = Math.sign(c) * halfWidth * Math.pow(Math.abs(c), 2 / squareness);
        let z = Math.sign(s) * halfDepth * Math.pow(Math.abs(s), 2 / squareness);

        // Labial bulge
        const facingFront = Math.max(0, -s);
        if (v > 0.1 && v < 0.6) {
          z -= facingFront * 0.04 * Math.sin(((v - 0.1) / 0.5) * Math.PI);
        }

        // Subtle labial ridges
        if (facingFront > 0.3 && v < 0.5) {
          const ridgeAngle = Math.atan2(x, -z);
          z -= 0.005 * facingFront * (0.5 + 0.5 * Math.cos(ridgeAngle * 3)) * (1 - v * 2);
        }

        positions.push(x, y, z);
        uvs.push(u, v);
      }
    }

    for (let j = 0; j < slices; j++) {
      for (let i = 0; i < pts; i++) {
        const a = j * (pts + 1) + i;
        const b = a + 1;
        const c = a + (pts + 1);
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    // Bottom cap
    const botCenter = positions.length / 3;
    positions.push(0, -height / 2, 0);
    uvs.push(0.5, 0);
    for (let i = 0; i < pts; i++) {
      indices.push(botCenter, i, (i + 1) % pts);
    }

    // Top cap
    const topCenter = positions.length / 3;
    positions.push(0, height / 2, 0);
    uvs.push(0.5, 1);
    const topRow = slices * (pts + 1);
    for (let i = 0; i < pts; i++) {
      indices.push(topCenter, topRow + i, topRow + ((i + 1) % pts));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);

  const easedProgress = useRef(0);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    easedProgress.current += (scrollProgress - easedProgress.current) * 0.06;
    const p = easedProgress.current;
    const t = clock.getElapsedTime();

    const startY = 1.6;
    const endY = 0.1;

    let y: number;
    let rotX: number;
    let rotZ: number;

    if (p < 0.3) {
      const s = p / 0.3;
      y = THREE.MathUtils.lerp(startY, 1.2, s * s);
      rotX = Math.sin(s * Math.PI) * 0.1;
      rotZ = 0.08 - s * 0.04;
    } else if (p < 0.7) {
      const s = (p - 0.3) / 0.4;
      const smooth = s * s * (3 - 2 * s);
      y = THREE.MathUtils.lerp(1.2, endY + 0.05, smooth);
      rotX = 0.1 * (1 - smooth) * Math.sin(s * Math.PI * 2) * 0.2;
      rotZ = 0.04 * (1 - smooth);
    } else {
      const s = (p - 0.7) / 0.3;
      const smooth = s * s * (3 - 2 * s);
      y = THREE.MathUtils.lerp(endY + 0.05, endY, smooth);
      rotX = 0;
      rotZ = 0;
    }

    // Gentle floating when not fully settled
    if (p < 0.85) {
      y += Math.sin(t * 1.2) * 0.02 * (1 - p);
    }

    meshRef.current.position.y = y;
    meshRef.current.rotation.x = rotX;
    meshRef.current.rotation.z = rotZ;
  });

  return (
    <mesh ref={meshRef} geometry={geo} position={[0, 1.6, 0]}>
      <meshPhysicalMaterial
        color="#f4efe6"
        roughness={0.08}
        metalness={0}
        clearcoat={1.0}
        clearcoatRoughness={0.03}
        envMapIntensity={1.2}
        sheen={0.5}
        sheenRoughness={0.2}
        sheenColor={new THREE.Color('#f0e6d4')}
        transmission={0.08}
        thickness={1.5}
        ior={1.52}
        transparent
        opacity={0.98}
        specularIntensity={1.0}
        specularColor={new THREE.Color('#ffffff')}
      />
    </mesh>
  );
}

// ─── Decorative gold ring ───
function GoldRing({ scrollProgress }: { scrollProgress: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.z = t * 0.08;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, (1 - scrollProgress * 1.5)) * 0.18;
  });

  return (
    <mesh ref={ref} rotation={[Math.PI * 0.5, 0, 0]} position={[0, 0.3, 0]}>
      <torusGeometry args={[1.3, 0.003, 8, 120]} />
      <meshBasicMaterial color="#c9a96e" transparent opacity={0.18} />
    </mesh>
  );
}

// ─── Floating particles ───
function Particles({ scrollProgress }: { scrollProgress: number }) {
  const ref = useRef<THREE.Points>(null);
  const count = 25;

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.8 + Math.random() * 1.0;
      arr[i * 3] = Math.cos(angle) * r;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 2;
      arr[i * 3 + 2] = Math.sin(angle) * r;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 0.03;
    const mat = ref.current.material as THREE.PointsMaterial;
    mat.opacity = Math.max(0, (1 - scrollProgress * 0.8)) * (0.25 + Math.sin(t * 0.5) * 0.1);
  });

  return (
    <points ref={ref} position={[0, 0.3, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#c9a96e"
        size={0.02}
        transparent
        opacity={0.3}
        sizeAttenuation
      />
    </points>
  );
}

// ─── Camera rig: gentle orbit ───
function CameraRig({ scrollProgress }: { scrollProgress: number }) {
  const { camera } = useThree();
  const easedP = useRef(0);

  useFrame(({ clock }) => {
    easedP.current += (scrollProgress - easedP.current) * 0.04;
    const p = easedP.current;
    const t = clock.getElapsedTime();

    // Gentle orbit
    const orbitAngle = t * 0.12;
    const orbitRadius = 0.8;
    const distance = THREE.MathUtils.lerp(4.0, 3.2, p);
    const height = THREE.MathUtils.lerp(1.0, 0.3, p);

    camera.position.x = Math.sin(orbitAngle) * orbitRadius;
    camera.position.z = distance + Math.cos(orbitAngle) * orbitRadius * 0.3;
    camera.position.y = height;

    // Look at center of action
    const lookY = THREE.MathUtils.lerp(0.4, 0, p);
    camera.lookAt(0, lookY, 0);
  });

  return null;
}

// ─── Main scene ───
function Scene() {
  const scrollProgress = useScrollProgress();

  return (
    <>
      <CameraRig scrollProgress={scrollProgress} />

      {/* Lighting - dental studio style */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 4]} intensity={2.0} color="#fff5ee" />
      <directionalLight position={[-2, 1, 3]} intensity={1.0} color="#fff0e0" />
      <directionalLight position={[0, 2, -2]} intensity={0.6} color="#ffe8d0" />
      <pointLight position={[0, -1, 2]} intensity={0.8} color="#fff5ee" distance={8} />

      <Environment frames={1} resolution={256} background={false}>
        <mesh scale={10}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial color="#1a1a22" side={THREE.BackSide} />
        </mesh>
        <pointLight position={[3, 3, 3]} intensity={18} color="#ffffff" />
        <pointLight position={[-3, 2, 2]} intensity={12} color="#fff8f0" />
        <pointLight position={[0, -2, 4]} intensity={10} color="#fff5e0" />
        <pointLight position={[0, 4, 0]} intensity={8} color="#ffffff" />
      </Environment>

      {/* Tooth abutment */}
      <Abutment />

      {/* Crown descending */}
      <Crown scrollProgress={scrollProgress} />

      {/* Decorations */}
      <GoldRing scrollProgress={scrollProgress} />
      <Particles scrollProgress={scrollProgress} />

      {/* Ground shadow */}
      <ContactShadows
        position={[0, -0.62, 0]}
        opacity={0.25}
        scale={3}
        blur={2}
        far={1.5}
        color="#000000"
      />
    </>
  );
}

// ─── Exported component ───
export default function CrownScene() {
  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.5,
        }}
        camera={{ fov: 40, near: 0.1, far: 100, position: [0, 1, 4] }}
        style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
        eventSource={undefined}
        events={() => ({ enabled: false, priority: 0, compute: () => {} } as any)}
      >
        <Scene />
      </Canvas>

    </div>
  );
}
