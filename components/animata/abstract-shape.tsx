"use client";

import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import type { Group } from "three";

function AbstractMesh() {
  const groupRef = useRef<Group>(null);
  const { pointer } = useThree();
  const spinRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    spinRef.current += delta * 0.75;

    // Follow cursor position (pointer is normalized in [-1, 1]) with smoothing.
    const targetPosX = pointer.x * 1.25;
    const targetPosY = pointer.y * 0.9;

    groupRef.current.position.x +=
      (targetPosX - groupRef.current.position.x) * 0.08;
    groupRef.current.position.y +=
      (targetPosY - groupRef.current.position.y) * 0.08;

    // Keep a subtle spin so the shape remains visually dynamic.
    groupRef.current.rotation.x += delta * 0.35;
    groupRef.current.rotation.y = spinRef.current;
  });

  return (
    <group ref={groupRef}>
      {/* <mesh>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshPhysicalMaterial
          color="white"
          roughness={0.05}
          metalness={1}
          clearcoat={1}
          clearcoatRoughness={0.03}
          envMapIntensity={1.9}
          reflectivity={0.2}
          flatShading
        />
      </mesh> */}
      <mesh scale={0.5}>
        <icosahedronGeometry args={[1.2, 0]} />
        <meshBasicMaterial color="white" wireframe transparent opacity={0.35} />
      </mesh>
      {/* <mesh rotation={[0.5, 0.2, 0.3]} scale={0.68}>
        <torusKnotGeometry args={[1.1, 0.16, 120, 14, 2, 3]} />
        <meshPhysicalMaterial
          color="#aeb6c2"
          roughness={0.5}
          metalness={1}
          clearcoat={1}
          clearcoatRoughness={0.04}
          envMapIntensity={1.6}
          reflectivity={1}
        />
      </mesh> */}
    </group>
  );
}

export default function AbstractShape() {
  return (
    <div className="h-full w-full opacity-40">
      <Canvas camera={{ position: [0, 0, 5], fov: 46 }} dpr={[1, 1.75]}>
        <Environment preset="studio" />
        <ambientLight intensity={0.2} />
        <hemisphereLight intensity={0.6} groundColor="#0b1020" />
        <directionalLight position={[4, 3, 4]} intensity={1.4} color="#ffffff" />
        <directionalLight position={[-3, 2, -4]} intensity={1.1} color="#cbd5e1" />
        <pointLight position={[-3, -2, 3]} intensity={0.75} color="#93c5fd" />
        <AbstractMesh />
      </Canvas>
    </div>
  );
}
