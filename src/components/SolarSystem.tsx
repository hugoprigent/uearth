import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useGeoStore } from '../store/geoStore';
import { calculateEarthSunDistance, calculateOrbitalAngle, getSeason } from '../utils/solarCalculations';

// Constants for the solar system view (scaled)
const SUN_RADIUS = 0.6;
const EARTH_RADIUS = 0.12;
const MOON_RADIUS = 0.03;
const ORBIT_SCALE = 4; // Scale factor for orbit
const MOON_ORBIT_RADIUS = 0.35;
const AXIAL_TILT = 23.5 * (Math.PI / 180);

// Orbital parameters
const PERIHELION = 147.1; // million km
const APHELION = 152.1; // million km
const SEMI_MAJOR_AXIS = (PERIHELION + APHELION) / 2;
const ECCENTRICITY = (APHELION - PERIHELION) / (APHELION + PERIHELION);

// Sun component
function Sun() {
  const sunRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (sunRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.02;
      sunRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      {/* Sun glow */}
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.4, 32, 32]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0.15} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS * 1.2, 32, 32]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.2} />
      </mesh>
      {/* Sun core */}
      <mesh ref={sunRef}>
        <sphereGeometry args={[SUN_RADIUS, 32, 32]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      {/* Sun light */}
      <pointLight color="#fff7ed" intensity={2} distance={20} />
      
      <Text
        position={[0, SUN_RADIUS + 0.3, 0]}
        fontSize={0.15}
        color="#fbbf24"
        anchorX="center"
      >
        Soleil
      </Text>
    </group>
  );
}

// Elliptical orbit path
function OrbitPath() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      // Elliptical orbit using parametric equation
      const r = (SEMI_MAJOR_AXIS * (1 - ECCENTRICITY * ECCENTRICITY)) / 
        (1 + ECCENTRICITY * Math.cos(angle));
      const scaledR = (r / SEMI_MAJOR_AXIS) * ORBIT_SCALE;
      
      pts.push(
        new THREE.Vector3(
          Math.cos(angle) * scaledR,
          0,
          Math.sin(angle) * scaledR
        )
      );
    }
    return pts;
  }, []);

  return (
    <Line
      points={points}
      color="#475569"
      lineWidth={1}
      transparent
      opacity={0.6}
    />
  );
}

// Season markers with improved positions
function SeasonMarkers() {
  const markers = useMemo(() => [
    { day: 172, label: 'Solstice été', emoji: '☀️' },
    { day: 355, label: 'Solstice hiver', emoji: '❄️' },
    { day: 80, label: 'Équinoxe mars', emoji: '🌸' },
    { day: 266, label: 'Équinoxe sept', emoji: '🍂' },
  ].map(({ day, label, emoji }) => {
    const angle = calculateOrbitalAngle(day);
    const r = (calculateEarthSunDistance(day) / SEMI_MAJOR_AXIS) * ORBIT_SCALE;
    return {
      position: new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r),
      label,
      emoji,
    };
  }), []);

  return (
    <group>
      {markers.map(({ position, label, emoji }) => (
        <group key={label} position={position}>
          <mesh>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
          <Text
            position={[0, 0.25, 0]}
            fontSize={0.1}
            color="#f59e0b"
            anchorX="center"
            anchorY="middle"
          >
            {emoji} {label}
          </Text>
        </group>
      ))}
    </group>
  );
}

// Dynamic Earth that follows the current day
function DynamicEarth() {
  const groupRef = useRef<THREE.Group>(null);
  const axialTiltGroupRef = useRef<THREE.Group>(null);
  const earthRef = useRef<THREE.Mesh>(null);
  const moonRef = useRef<THREE.Mesh>(null);
  const lastTimeRef = useRef<number>(0);

  useFrame((state) => {
    // Handle global animation
    const { isAnimating, advanceTime, dayOfYear, hourOfDay } = useGeoStore.getState();
    
    if (isAnimating) {
      const delta = state.clock.elapsedTime - lastTimeRef.current;
      if (delta > 0) {
        advanceTime(delta);
      }
    }
    lastTimeRef.current = state.clock.elapsedTime;

    // Update Earth position based on day from store
    const angle = calculateOrbitalAngle(dayOfYear);
    
    if (groupRef.current) {
      const distance = calculateEarthSunDistance(dayOfYear);
      const scaledR = (distance / SEMI_MAJOR_AXIS) * ORBIT_SCALE;
      
      groupRef.current.position.set(
        Math.cos(angle) * scaledR,
        0,
        Math.sin(angle) * scaledR
      );
    }

    // Counter-rotate the axial tilt group to maintain absolute orientation
    // The tilt should always point toward the same direction in space (toward Polaris)
    // This means the axis direction relative to the Sun CHANGES throughout the year
    if (axialTiltGroupRef.current) {
      // The axis points toward a fixed direction in space (let's say +X in world coords)
      // So we counter-rotate by the orbital angle
      axialTiltGroupRef.current.rotation.y = -angle;
    }

    // Earth rotation based on hourOfDay from store
    if (earthRef.current) {
      const dailyRotation = (hourOfDay / 24) * 2 * Math.PI;
      earthRef.current.rotation.y = dailyRotation;
    }

    // Moon orbit based on dayOfYear from store
    if (moonRef.current) {
      const moonOrbitalPeriod = 27.3;
      const moonAngle = (dayOfYear / moonOrbitalPeriod) * 2 * Math.PI;
      
      moonRef.current.position.x = Math.cos(moonAngle) * MOON_ORBIT_RADIUS;
      moonRef.current.position.z = Math.sin(moonAngle) * MOON_ORBIT_RADIUS;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Earth's axial tilt group - counter-rotates to maintain absolute orientation */}
      <group ref={axialTiltGroupRef}>
        <group rotation={[0, 0, AXIAL_TILT]}>
          {/* Ocean (inner sphere) */}
          <mesh>
            <sphereGeometry args={[EARTH_RADIUS * 0.99, 32, 32]} />
            <meshBasicMaterial color="#1e3a5f" />
          </mesh>
          
          {/* Land (outer sphere with shader for day/night) */}
          <mesh ref={earthRef}>
            <sphereGeometry args={[EARTH_RADIUS, 32, 32]} />
            <meshStandardMaterial color="#22c55e" roughness={0.8} transparent opacity={0.9} />
          </mesh>
          
          {/* Equator line for orientation */}
          <Line
            points={Array.from({ length: 33 }, (_, i) => {
              const angle = (i / 32) * Math.PI * 2;
              return new THREE.Vector3(
                Math.cos(angle) * EARTH_RADIUS * 1.01,
                0,
                Math.sin(angle) * EARTH_RADIUS * 1.01
              );
            })}
            color="#f59e0b"
            lineWidth={1}
          />
          
          {/* Rotation axis */}
          <Line
            points={[
              new THREE.Vector3(0, -EARTH_RADIUS * 2, 0),
              new THREE.Vector3(0, EARTH_RADIUS * 2, 0),
            ]}
            color="#06b6d4"
            lineWidth={2}
          />
          
          {/* North pole marker */}
          <mesh position={[0, EARTH_RADIUS * 2, 0]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshBasicMaterial color="#06b6d4" />
          </mesh>
        </group>
      </group>

      {/* Moon orbit path */}
      <Line
        points={Array.from({ length: 65 }, (_, i) => {
          const angle = (i / 64) * Math.PI * 2;
          return new THREE.Vector3(
            Math.cos(angle) * MOON_ORBIT_RADIUS,
            0,
            Math.sin(angle) * MOON_ORBIT_RADIUS
          );
        })}
        color="#64748b"
        lineWidth={1}
        transparent
        opacity={0.5}
      />

      {/* Moon */}
      <mesh ref={moonRef}>
        <sphereGeometry args={[MOON_RADIUS, 16, 16]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.9} />
      </mesh>

      <Text
        position={[0, EARTH_RADIUS + 0.2, 0]}
        fontSize={0.08}
        color="#22c55e"
        anchorX="center"
      >
        Terre
      </Text>
    </group>
  );
}

// Camera controller for Earth-centered view
function CameraController() {
  const { solarSystemCenter } = useGeoStore();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useFrame(() => {
    const { solarSystemCenter, dayOfYear } = useGeoStore.getState();
    if (solarSystemCenter === 'earth' && controlsRef.current) {
      const angle = calculateOrbitalAngle(dayOfYear);
      const distance = calculateEarthSunDistance(dayOfYear);
      const scaledR = (distance / SEMI_MAJOR_AXIS) * ORBIT_SCALE;
      
      const earthPos = new THREE.Vector3(
        Math.cos(angle) * scaledR,
        0,
        Math.sin(angle) * scaledR
      );
      
      controlsRef.current.target.copy(earthPos);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      minDistance={2}
      maxDistance={25}
      rotateSpeed={0.5}
      target={solarSystemCenter === 'sun' ? [0, 0, 0] : undefined}
    />
  );
}

// Info panel component
function InfoPanel() {
  const { 
    dayOfYear, 
    solarSystemCenter,
    setSolarSystemCenter,
  } = useGeoStore();

  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  
  const getDateLabel = (day: number) => {
    const date = new Date(new Date().getFullYear(), 0, 1);
    date.setDate(day);
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  };

  const distance = calculateEarthSunDistance(dayOfYear);
  const season = getSeason(dayOfYear);

  return (
    <div className="absolute top-2 left-2 bg-slate-800/90 p-3 rounded-lg text-xs space-y-2 max-w-[220px]">
      <div className="text-cyan-400 font-semibold">Système Solaire</div>
      <div className="text-slate-300">
        <span className="text-slate-500">Date:</span> {getDateLabel(dayOfYear)}
      </div>
      <div className="text-slate-300">
        <span className="text-slate-500">Saison:</span> {season}
      </div>
      <div className="text-slate-300">
        <span className="text-slate-500">Distance:</span>{' '}
        <span className="text-yellow-400 font-mono">{distance.toFixed(2)}</span> M km
      </div>
      
      {/* Center toggle */}
      <div className="border-t border-slate-700 pt-2 mt-2">
        <div className="text-slate-500 text-xs mb-1">Centre de rotation:</div>
        <div className="flex gap-1">
          <button
            onClick={() => setSolarSystemCenter('sun')}
            className={`flex-1 px-2 py-1 rounded text-xs ${
              solarSystemCenter === 'sun' 
                ? 'bg-yellow-500/30 text-yellow-400' 
                : 'bg-slate-700 text-slate-400'
            }`}
          >
            ☀️ Soleil
          </button>
          <button
            onClick={() => setSolarSystemCenter('earth')}
            className={`flex-1 px-2 py-1 rounded text-xs ${
              solarSystemCenter === 'earth' 
                ? 'bg-green-500/30 text-green-400' 
                : 'bg-slate-700 text-slate-400'
            }`}
          >
            🌍 Terre
          </button>
        </div>
      </div>
    </div>
  );
}

// Legend
function Legend() {
  return (
    <div className="absolute bottom-2 right-2 bg-slate-800/90 p-2 rounded-lg text-xs space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
        <span className="text-slate-300">Soleil</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="text-slate-300">Terre</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-slate-400"></div>
        <span className="text-slate-300">Lune</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-0.5 bg-cyan-400"></div>
        <span className="text-slate-300">Axe (23.5°)</span>
      </div>
      <div className="flex items-center gap-2 text-slate-500 text-xs border-t border-slate-700 pt-1 mt-1">
        Orbite elliptique (exagérée)
      </div>
    </div>
  );
}

// Main Solar System component
export function SolarSystem({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <h2 className="text-xs sm:text-sm font-semibold text-cyan-400">Système Solaire</h2>
        <span className="text-xs text-slate-400 hidden sm:inline">Vue Orbitale</span>
      </div>
      <div className="flex-1 relative">
        <Canvas
          camera={{ position: [0, 8, 8], fov: 45 }}
          gl={{ antialias: true }}
        >
          <ambientLight intensity={0.1} />
          <Sun />
          <DynamicEarth />
          <OrbitPath />
          <SeasonMarkers />
          <CameraController />
        </Canvas>
        <InfoPanel />
        <Legend />
      </div>
    </div>
  );
}
