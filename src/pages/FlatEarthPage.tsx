import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Link } from 'react-router-dom';
import { ArrowLeft, Info, Clock, Calendar, Play, Pause, Map, Box } from 'lucide-react';
import { useGeoStore } from '../store/geoStore';
import { useWorldData } from '../hooks/useWorldData';

// Constants for the Flat Earth model
const EARTH_RADIUS = 3; // Radius of the flat disc (includes ice wall)
const DOME_RADIUS = EARTH_RADIUS; // Firmament matches earth disc
const DOME_HEIGHT = EARTH_RADIUS * 1.5; // Height of the dome (proportional)
const SUN_ALTITUDE = EARTH_RADIUS * 0.5; // Height of the sun above the disc
const SUN_ORBIT_RADIUS = EARTH_RADIUS * 0.4; // Radius of sun's circular path
const MOON_ALTITUDE = EARTH_RADIUS * 0.45;
const MOON_ORBIT_RADIUS = EARTH_RADIUS * 0.5;
const SUN_SIZE = 0.15;
const MOON_SIZE = 0.1;

// The Flat Earth disc with continents
function FlatEarthDisc() {
  const { land } = useWorldData();
  
  // Convert lat/lon to flat earth coordinates (azimuthal equidistant from North Pole)
  const continentLines = useMemo(() => {
    if (!land) return [];
    
    const lines: THREE.Vector3[][] = [];
    
    land.features.forEach((feature) => {
      const geometry = feature.geometry;
      
      const processCoordinates = (coords: number[][]) => {
        const points: THREE.Vector3[] = [];
        coords.forEach(([lon, lat]) => {
          // Azimuthal equidistant projection from North Pole
          // Scale so that 90° south (Antarctica) is at the edge (EARTH_RADIUS)
          const latRad = (90 - lat) * (Math.PI / 180);
          const lonRad = lon * (Math.PI / 180);
          const r = (latRad / Math.PI) * EARTH_RADIUS; // Changed: removed * 2 to fit within disc
          const x = r * Math.sin(lonRad);
          const z = -r * Math.cos(lonRad);
          points.push(new THREE.Vector3(x, 0.01, z));
        });
        if (points.length > 1) {
          lines.push(points);
        }
      };
      
      if (geometry.type === 'Polygon') {
        geometry.coordinates.forEach((ring: number[][]) => {
          processCoordinates(ring);
        });
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach((polygon: number[][][]) => {
          polygon.forEach((ring: number[][]) => {
            processCoordinates(ring);
          });
        });
      }
    });
    
    return lines;
  }, [land]);

  return (
    <group>
      {/* Earth disc - ocean */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[EARTH_RADIUS, 128]} />
        <meshStandardMaterial color="#0e83ca" side={THREE.DoubleSide} />
      </mesh>
      
      {/* Continent outlines */}
      {continentLines.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#22c55e"
          lineWidth={1.5}
        />
      ))}
      
      {/* Ice wall (Antarctica) at the edge */}
      <mesh position={[0, 0.15, 0]}>
        <torusGeometry args={[EARTH_RADIUS, 0.15, 16, 128]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      
      {/* North Pole marker */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 16]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      
      {/* Concentric circles for latitudes */}
      {[30, 60].map((lat) => {
        const r = ((90 - lat) / 90) * EARTH_RADIUS;
        return (
          <Line
            key={lat}
            points={Array.from({ length: 65 }, (_, i) => {
              const angle = (i / 64) * Math.PI * 2;
              return new THREE.Vector3(
                Math.cos(angle) * r,
                0.02,
                Math.sin(angle) * r
              );
            })}
            color="#f59e0b"
            lineWidth={1}
            transparent
            opacity={0.5}
          />
        );
      })}
      
      {/* Equator */}
      <Line
        points={Array.from({ length: 65 }, (_, i) => {
          const angle = (i / 64) * Math.PI * 2;
          const r = EARTH_RADIUS / 2;
          return new THREE.Vector3(
            Math.cos(angle) * r,
            0.02,
            Math.sin(angle) * r
          );
        })}
        color="#f59e0b"
        lineWidth={2}
      />
    </group>
  );
}

// The Firmament dome - a hemispherical dome covering the flat earth
function Firmament() {
  return (
    <group>
      {/* Dome wireframe lines - horizontal rings */}
      {[0.2, 0.4, 0.6, 0.8, 1.0].map((heightFactor, idx) => {
        const phi = heightFactor * (Math.PI / 2);
        const y = Math.sin(phi) * DOME_HEIGHT;
        const r = Math.cos(phi) * DOME_RADIUS;
        return (
          <Line
            key={`h-${idx}`}
            points={Array.from({ length: 65 }, (_, i) => {
              const theta = (i / 64) * Math.PI * 2;
              return new THREE.Vector3(
                Math.cos(theta) * r,
                y,
                Math.sin(theta) * r
              );
            })}
            color="#3b82f6"
            lineWidth={1}
            transparent
            opacity={0.3}
          />
        );
      })}
      
      {/* Dome wireframe lines - vertical meridians */}
      {Array.from({ length: 12 }, (_, i) => {
        const theta = (i / 12) * Math.PI * 2;
        return (
          <Line
            key={`v-${i}`}
            points={Array.from({ length: 33 }, (_, j) => {
              const phi = (j / 32) * (Math.PI / 2);
              const y = Math.sin(phi) * DOME_HEIGHT;
              const r = Math.cos(phi) * DOME_RADIUS;
              return new THREE.Vector3(
                Math.cos(theta) * r,
                y,
                Math.sin(theta) * r
              );
            })}
            color="#3b82f6"
            lineWidth={1}
            transparent
            opacity={0.2}
          />
        );
      })}
      
      {/* Solid inner dome for dark sky */}
      <mesh>
        <sphereGeometry args={[DOME_RADIUS * 1.01, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial 
          color="#0a0f1a" 
          side={THREE.BackSide}
          transparent
          opacity={0.85}
        />
      </mesh>
      
      {/* Stars on the dome */}
      <Stars />
      
      {/* Label */}
      <Text
        position={[0, DOME_HEIGHT + 0.3, 0]}
        fontSize={0.2}
        color="#64748b"
        anchorX="center"
      >
        Firmament
      </Text>
    </group>
  );
}

// Stars on the firmament, placed once at module load so they stay put across renders
const STAR_POSITIONS: THREE.Vector3[] = Array.from({ length: 200 }, () => {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * (Math.PI / 2) * 0.9; // Limit to dome area
  // Position on dome surface
  const y = Math.sin(phi) * DOME_HEIGHT;
  const horizontalR = Math.cos(phi) * DOME_RADIUS * 0.98;
  return new THREE.Vector3(
    horizontalR * Math.cos(theta),
    y,
    horizontalR * Math.sin(theta)
  );
});

function Stars() {
  return (
    <group>
      {STAR_POSITIONS.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

// Sun that orbits above the flat earth
function FlatEarthSun() {
  const sunRef = useRef<THREE.Group>(null);
  const { dayOfYear, hourOfDay } = useGeoStore();
  
  useFrame(() => {
    if (sunRef.current) {
      // Sun position based on time of day
      const hourAngle = (hourOfDay / 24) * Math.PI * 2 - Math.PI / 2;
      
      // Sun orbit radius changes with seasons (closer to center in summer, farther in winter)
      // In flat earth model, sun is closer to North Pole in June, farther in December
      const seasonalOffset = Math.cos((dayOfYear - 172) / 365.25 * Math.PI * 2);
      const orbitRadius = SUN_ORBIT_RADIUS - seasonalOffset * 0.8;
      
      sunRef.current.position.x = Math.cos(hourAngle) * orbitRadius;
      sunRef.current.position.z = Math.sin(hourAngle) * orbitRadius;
      sunRef.current.position.y = SUN_ALTITUDE;
    }
  });

  return (
    <group ref={sunRef}>
      {/* Sun glow */}
      <mesh>
        <sphereGeometry args={[SUN_SIZE * 2, 32, 32]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0.3} />
      </mesh>
      <mesh>
        <sphereGeometry args={[SUN_SIZE * 1.5, 32, 32]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.5} />
      </mesh>
      {/* Sun core */}
      <mesh>
        <sphereGeometry args={[SUN_SIZE, 32, 32]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
      {/* Light cone - spotlight effect */}
      <spotLight
        position={[0, 0, 0]}
        angle={0.6}
        penumbra={0.5}
        intensity={2}
        color="#fff5e6"
        target-position={[0, -SUN_ALTITUDE, 0]}
      />
      <Text
        position={[0, SUN_SIZE + 0.15, 0]}
        fontSize={0.12}
        color="#fbbf24"
        anchorX="center"
      >
        Soleil
      </Text>
    </group>
  );
}

// Moon that orbits above the flat earth
function FlatEarthMoon() {
  const moonRef = useRef<THREE.Group>(null);
  const { hourOfDay } = useGeoStore();
  
  useFrame(() => {
    if (moonRef.current) {
      // Moon is roughly opposite to sun
      const hourAngle = (hourOfDay / 24) * Math.PI * 2 + Math.PI / 2;
      
      moonRef.current.position.x = Math.cos(hourAngle) * MOON_ORBIT_RADIUS;
      moonRef.current.position.z = Math.sin(hourAngle) * MOON_ORBIT_RADIUS;
      moonRef.current.position.y = MOON_ALTITUDE;
    }
  });

  return (
    <group ref={moonRef}>
      <mesh>
        <sphereGeometry args={[MOON_SIZE, 32, 32]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
      <Text
        position={[0, MOON_SIZE + 0.1, 0]}
        fontSize={0.1}
        color="#94a3b8"
        anchorX="center"
      >
        Lune
      </Text>
    </group>
  );
}

// Orbit paths visualization
function OrbitPaths() {
  const { dayOfYear } = useGeoStore();
  
  // Sun orbit radius based on season
  const seasonalOffset = Math.cos((dayOfYear - 172) / 365.25 * Math.PI * 2);
  const sunOrbitRadius = SUN_ORBIT_RADIUS - seasonalOffset * 0.8;
  
  return (
    <group>
      {/* Sun orbit path */}
      <Line
        points={Array.from({ length: 65 }, (_, i) => {
          const angle = (i / 64) * Math.PI * 2;
          return new THREE.Vector3(
            Math.cos(angle) * sunOrbitRadius,
            SUN_ALTITUDE,
            Math.sin(angle) * sunOrbitRadius
          );
        })}
        color="#fbbf24"
        lineWidth={1}
        transparent
        opacity={0.3}
        dashed
        dashSize={0.1}
        gapSize={0.05}
      />
      
      {/* Moon orbit path */}
      <Line
        points={Array.from({ length: 65 }, (_, i) => {
          const angle = (i / 64) * Math.PI * 2;
          return new THREE.Vector3(
            Math.cos(angle) * MOON_ORBIT_RADIUS,
            MOON_ALTITUDE,
            Math.sin(angle) * MOON_ORBIT_RADIUS
          );
        })}
        color="#94a3b8"
        lineWidth={1}
        transparent
        opacity={0.2}
        dashed
        dashSize={0.1}
        gapSize={0.05}
      />
    </group>
  );
}

// Distance markers
function DistanceMarkers() {
  return (
    <group>
      {/* Altitude markers */}
      <Line
        points={[
          new THREE.Vector3(EARTH_RADIUS + 0.5, 0, 0),
          new THREE.Vector3(EARTH_RADIUS + 0.5, SUN_ALTITUDE, 0),
        ]}
        color="#64748b"
        lineWidth={1}
        dashed
        dashSize={0.1}
        gapSize={0.05}
      />
      <Text
        position={[EARTH_RADIUS + 0.8, SUN_ALTITUDE / 2, 0]}
        fontSize={0.12}
        color="#64748b"
        anchorX="left"
      >
        ~5000 km
      </Text>
      <Text
        position={[EARTH_RADIUS + 0.8, SUN_ALTITUDE / 2 - 0.2, 0]}
        fontSize={0.08}
        color="#94a3b8"
        anchorX="left"
      >
        (modèle FE)
      </Text>
      
      {/* Earth diameter */}
      <Line
        points={[
          new THREE.Vector3(-EARTH_RADIUS, -0.3, 0),
          new THREE.Vector3(EARTH_RADIUS, -0.3, 0),
        ]}
        color="#64748b"
        lineWidth={1}
      />
      <Text
        position={[0, -0.5, 0]}
        fontSize={0.12}
        color="#64748b"
        anchorX="center"
      >
        ~40 000 km (diamètre)
      </Text>
    </group>
  );
}

// Animation controller
function AnimationController() {
  const lastTimeRef = useRef<number>(0);
  
  useFrame((state) => {
    const { isAnimating, advanceTime } = useGeoStore.getState();
    
    if (isAnimating) {
      const delta = state.clock.elapsedTime - lastTimeRef.current;
      if (delta > 0) {
        advanceTime(delta);
      }
    }
    lastTimeRef.current = state.clock.elapsedTime;
  });
  
  return null;
}

// Info panel component
function FlatEarthInfoPanel() {
  const { 
    dayOfYear, 
    hourOfDay, 
    setHourOfDay, 
    setDayOfYear, 
    isAnimating, 
    toggleAnimation, 
    animationSpeed, 
    setAnimationSpeed,
    drawingMode,
    setDrawingMode,
    lines,
    removeLine,
    clearLines
  } = useGeoStore();
  
  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  
  const getDateLabel = (day: number) => {
    const date = new Date(new Date().getFullYear(), 0, 1);
    date.setDate(day);
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  };

  const formatHour = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.floor((hour % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };
  
  const formatDistance = (distance: number) => {
    return distance >= 1000 
      ? `${(distance / 1000).toFixed(1)}k km`
      : `${distance.toFixed(0)} km`;
  };

  return (
    <div className="absolute top-4 left-4 bg-slate-800/95 p-4 rounded-lg text-xs space-y-3 max-w-[300px] border border-slate-700 max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="text-amber-400 font-semibold text-sm flex items-center gap-2">
        <Info className="w-4 h-4" />
        Modèle Terre Plate
      </div>
      
      {/* Drawing Controls */}
      <div className="border-t border-slate-700 pt-3">
        <div className="text-slate-400 font-medium mb-2">Mesure de distance</div>
        <div className="flex gap-2">
          <button
            onClick={() => setDrawingMode('pan')}
            className={`flex-1 px-2 py-1.5 rounded text-xs transition-colors ${
              drawingMode === 'pan'
                ? 'bg-slate-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            🖐️ Navigation
          </button>
          <button
            onClick={() => setDrawingMode(drawingMode === 'drawing' ? 'pan' : 'drawing')}
            className={`flex-1 px-2 py-1.5 rounded text-xs transition-colors ${
              drawingMode === 'drawing'
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
          >
            📏 Tracer
          </button>
        </div>
        
        {/* Lines list */}
        {lines.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Lignes tracées ({lines.length})</span>
              <button
                onClick={clearLines}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Tout effacer
              </button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between bg-slate-700/50 px-2 py-1 rounded"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: line.color }}
                    />
                    <span className="text-slate-300 font-mono text-xs">
                      {formatDistance(line.distance)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeLine(line.id)}
                    className="text-slate-500 hover:text-red-400 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Time Controls */}
      <div className="space-y-3 border-t border-slate-700 pt-3">
        {/* Hour slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Heure
            </label>
            <span className="font-mono text-amber-400">{formatHour(hourOfDay)} UTC</span>
          </div>
          <input
            type="range"
            min="0"
            max="24"
            step="0.25"
            value={hourOfDay}
            onChange={(e) => setHourOfDay(parseFloat(e.target.value))}
            className="w-full accent-amber-400"
          />
        </div>
        
        {/* Day slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Jour
            </label>
            <span className="font-mono text-amber-400">{getDateLabel(dayOfYear)}</span>
          </div>
          <input
            type="range"
            min="1"
            max="365"
            step="1"
            value={dayOfYear}
            onChange={(e) => setDayOfYear(parseInt(e.target.value))}
            className="w-full accent-amber-400"
          />
        </div>
        
        {/* Animation */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Animation</span>
          <button
            onClick={toggleAnimation}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
              isAnimating
                ? 'bg-red-500/20 text-red-400'
                : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {isAnimating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isAnimating ? 'Pause' : 'Lancer'}
          </button>
        </div>
        
        {/* Speed */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-slate-400">Vitesse</label>
            <span className="font-mono text-amber-400 text-xs">
              {animationSpeed >= 24 ? `${(animationSpeed / 24).toFixed(1)} j/s` : `${animationSpeed.toFixed(1)} h/s`}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.log10(animationSpeed + 0.1) / Math.log10(87600) * 100}
            onChange={(e) => {
              const sliderValue = parseFloat(e.target.value);
              const speed = Math.pow(87600, sliderValue / 100) - 0.1;
              setAnimationSpeed(Math.max(0.1, Math.min(87600, speed)));
            }}
            className="w-full accent-amber-400"
          />
        </div>
      </div>
      
      <div className="border-t border-slate-700 pt-3 space-y-2">
        <div className="text-slate-400 font-medium">Caractéristiques du modèle :</div>
        <ul className="text-slate-400 space-y-1 list-disc list-inside">
          <li>Terre = disque plat</li>
          <li>Pôle Nord au centre</li>
          <li>Antarctique = mur de glace</li>
          <li>Soleil à ~5000 km d'altitude</li>
          <li>Firmament = dôme solide</li>
          <li>Soleil tourne au-dessus</li>
        </ul>
      </div>
      
      <div className="border-t border-slate-700 pt-3 text-amber-400/80 text-xs">
        ⚠️ Ce modèle ne correspond pas aux observations scientifiques
      </div>
    </div>
  );
}

// 2D map geometry, in SVG units
const MAP_SIZE = 800;
const MAP_DISC_RADIUS = 350;
const MAP_CENTER = MAP_SIZE / 2;

// Convert lat/lon to 2D coordinates (Azimuthal equidistant from North Pole)
function latLonTo2D(lat: number, lon: number) {
  const latRad = (90 - lat) * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  const r = (latRad / Math.PI) * MAP_DISC_RADIUS;
  const x = MAP_CENTER + r * Math.sin(lonRad);
  const y = MAP_CENTER - r * Math.cos(lonRad);
  return { x, y };
}

// 2D Map View Component with pan/zoom and day/night
function FlatEarth2DView({ compact = false, spotlightRadiusFactor = 0.35 }: { compact?: boolean, spotlightRadiusFactor?: number }) {
  const { land } = useWorldData();
  const { 
    dayOfYear, 
    hourOfDay, 
    lines, 
    addLine, 
    drawingMode, 
    selectedPoint, 
    setSelectedPoint,
    hoverCoords,
    setHoverCoords 
  } = useGeoStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Pan and zoom state
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 800, height: 800 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  const baseSize = MAP_SIZE;
  const earthRadiusPx = MAP_DISC_RADIUS;
  const center = MAP_CENTER;
  
  // Convert 2D coordinates back to lat/lon
  const xy2DToLatLon = (x: number, y: number): { lat: number; lon: number } | null => {
    const dx = x - center;
    const dy = center - y;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > earthRadiusPx) return null;
    const latRad = (r / earthRadiusPx) * Math.PI;
    const lat = 90 - latRad * (180 / Math.PI);
    const lon = Math.atan2(dx, dy) * (180 / Math.PI);
    return { lat, lon };
  };
  
  // Sun position (in 2D pixel coordinates)
  const hourAngle = (hourOfDay / 24) * Math.PI * 2 - Math.PI / 2;
  const seasonalOffset = Math.cos((dayOfYear - 172) / 365.25 * Math.PI * 2);
  const sunOrbitRadius = earthRadiusPx * 0.4 - seasonalOffset * earthRadiusPx * 0.25;
  const sunX = center + Math.cos(hourAngle) * sunOrbitRadius;
  const sunY = center + Math.sin(hourAngle) * sunOrbitRadius;
  
  // Moon position
  const moonOrbitRadius = earthRadiusPx * 0.5;
  const moonX = center + Math.cos(hourAngle + Math.PI) * moonOrbitRadius;
  const moonY = center + Math.sin(hourAngle + Math.PI) * moonOrbitRadius;
  
  // Flat earth distance calculation (euclidean on disc)
  // Diameter = 40000km, radius = 20000km
  const FLAT_EARTH_RADIUS_KM = 20000;
  const pxToKm = FLAT_EARTH_RADIUS_KM / earthRadiusPx;
  
  // Calculate flat earth distance between two points
  const flatEarthDistance = (start: { lat: number; lon: number }, end: { lat: number; lon: number }) => {
    const p1 = latLonTo2D(start.lat, start.lon);
    const p2 = latLonTo2D(end.lat, end.lon);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy) * pxToKm;
  };
  
  // Get SVG coordinates from mouse event
  const getMouseCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    const x = viewBox.x + (e.clientX - rect.left) * scaleX;
    const y = viewBox.y + (e.clientY - rect.top) * scaleY;
    return { x, y };
  };
  
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getMouseCoords(e);
    if (!coords) return;
    
    // Handle panning
    if (isPanning && drawingMode === 'pan') {
      const dx = (e.clientX - panStart.x) * (viewBox.width / (svgRef.current?.getBoundingClientRect().width || 1));
      const dy = (e.clientY - panStart.y) * (viewBox.height / (svgRef.current?.getBoundingClientRect().height || 1));
      setViewBox(prev => ({
        ...prev,
        x: prev.x - dx,
        y: prev.y - dy
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    const latLon = xy2DToLatLon(coords.x, coords.y);
    if (latLon) {
      setHoverCoords(latLon);
    } else {
      setHoverCoords(null);
    }
  };
  
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawingMode === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };
  
  const handleMouseUp = () => {
    setIsPanning(false);
  };
  
  const handleMouseLeave = () => {
    setHoverCoords(null);
    setIsPanning(false);
  };
  
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const coords = getMouseCoords(e as unknown as React.MouseEvent<SVGSVGElement>);
    if (!coords) return;
    
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const newWidth = Math.max(200, Math.min(1600, viewBox.width * zoomFactor));
    const newHeight = Math.max(200, Math.min(1600, viewBox.height * zoomFactor));
    
    // Zoom towards mouse position
    const mouseXRatio = (coords.x - viewBox.x) / viewBox.width;
    const mouseYRatio = (coords.y - viewBox.y) / viewBox.height;
    
    setViewBox({
      x: coords.x - mouseXRatio * newWidth,
      y: coords.y - mouseYRatio * newHeight,
      width: newWidth,
      height: newHeight
    });
  };
  
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawingMode !== 'drawing') return;
    
    const coords = getMouseCoords(e);
    if (!coords) return;
    
    const latLon = xy2DToLatLon(coords.x, coords.y);
    if (!latLon) return;
    
    if (!selectedPoint) {
      setSelectedPoint(latLon);
    } else {
      addLine({
        start: selectedPoint,
        end: latLon,
        sourceView: 'azimuthal',
        color: '#06b6d4',
      });
    }
  };
  
  // Reset view
  const resetView = () => {
    setViewBox({ x: 0, y: 0, width: 800, height: 800 });
  };
  
  // Generate continent paths
  const continentPaths = useMemo(() => {
    if (!land) return [];
    const paths: string[] = [];
    
    land.features.forEach((feature) => {
      const geometry = feature.geometry;
      
      const processCoordinates = (coords: number[][]) => {
        if (coords.length < 2) return;
        let path = '';
        coords.forEach(([lon, lat], i) => {
          const { x, y } = latLonTo2D(lat, lon);
          path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
        });
        if (path) paths.push(path);
      };
      
      if (geometry.type === 'Polygon') {
        geometry.coordinates.forEach((ring: number[][]) => processCoordinates(ring));
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach((polygon: number[][][]) => {
          polygon.forEach((ring: number[][]) => processCoordinates(ring));
        });
      }
    });
    
    return paths;
  }, [land]);
  
  // Format distance for flat earth model
  const formatFlatDistance = (distanceKm: number) => {
    return distanceKm >= 1000 
      ? `${(distanceKm / 1000).toFixed(1)}k km`
      : `${distanceKm.toFixed(0)} km`;
  };
  
  return (
    <div ref={containerRef} className="w-full h-full flex flex-col bg-slate-900 relative">
      {/* Toolbar */}
      {!compact && (
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          <button
            onClick={resetView}
            className="bg-slate-700/80 hover:bg-slate-600 px-2 py-1 rounded text-xs text-slate-300"
          >
            🔄 Reset
          </button>
        </div>
      )}
      
      {/* Coordinates display */}
      {hoverCoords && !compact && (
        <div className="absolute top-2 left-2 bg-slate-800/90 px-2 py-1 rounded text-xs z-10">
          <span className="text-slate-400">Position: </span>
          <span className="text-cyan-400 font-mono">
            {hoverCoords.lat.toFixed(2)}°, {hoverCoords.lon.toFixed(2)}°
          </span>
        </div>
      )}
      
      {/* Map */}
      <div className="flex-1 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          className="w-full h-full"
          style={{ cursor: drawingMode === 'drawing' ? 'crosshair' : (drawingMode === 'pan' ? 'grab' : 'default') }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onClick={handleClick}
        >
          <defs>
            {/* Spotlight: the mask hides the night overlay inside the lit circle, with a soft edge */}
            <radialGradient id="spotlightFade">
              <stop offset="85%" stopColor="black" />
              <stop offset="100%" stopColor="white" />
            </radialGradient>
            <mask id="spotlightMask">
              <rect x={0} y={0} width={baseSize} height={baseSize} fill="white" />
              <circle cx={sunX} cy={sunY} r={earthRadiusPx * spotlightRadiusFactor} fill="url(#spotlightFade)" />
            </mask>
            
            {/* Clip path for earth disc */}
            <clipPath id="earthClip">
              <circle cx={center} cy={center} r={earthRadiusPx} />
            </clipPath>
          </defs>
          
          {/* Ocean background */}
          <circle cx={center} cy={center} r={earthRadiusPx} fill="#0e83ca" />
          
          {/* Latitude circles */}
          {[30, 60].map((lat) => {
            const r = ((90 - lat) / 90) * (earthRadiusPx / 2);
            return (
              <circle
                key={lat}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1"
                opacity="0.3"
              />
            );
          })}
          
          {/* Equator */}
          <circle
            cx={center}
            cy={center}
            r={earthRadiusPx / 2}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            opacity="0.5"
          />
          
          {/* Longitude lines */}
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const x2 = center + Math.cos(angle) * earthRadiusPx;
            const y2 = center + Math.sin(angle) * earthRadiusPx;
            return (
              <line
                key={i}
                x1={center}
                y1={center}
                x2={x2}
                y2={y2}
                stroke="#f59e0b"
                strokeWidth="1"
                opacity="0.2"
              />
            );
          })}
          
          {/* Continents */}
          {continentPaths.map((path, i) => (
            <path
              key={i}
              d={path}
              fill="none"
              stroke="#22c55e"
              strokeWidth="1.5"
            />
          ))}
          
          {/* Night shadow: in the flat earth model the sun is a local spotlight,
              so only a circle around the sun is lit and the rest of the disc is dark. */}
          <g clipPath="url(#earthClip)">
            <circle
              cx={center}
              cy={center}
              r={earthRadiusPx}
              fill="rgba(0,0,40,0.55)"
              mask="url(#spotlightMask)"
            />
          </g>
          
          {/* Ice wall */}
          <circle
            cx={center}
            cy={center}
            r={earthRadiusPx}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="12"
          />
          
          {/* North pole marker */}
          <circle cx={center} cy={center} r={4} fill="#ef4444" />
          {!compact && (
            <text x={center} y={center - 12} textAnchor="middle" fill="#ef4444" fontSize="10">
              Pôle Nord
            </text>
          )}
          
          {/* Sun orbit */}
          <circle
            cx={center}
            cy={center}
            r={sunOrbitRadius}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1"
            strokeDasharray="5,5"
            opacity="0.3"
          />
          
          {/* Sun with glow */}
          <circle cx={sunX} cy={sunY} r={25} fill="#fef3c7" opacity="0.3" />
          <circle cx={sunX} cy={sunY} r={18} fill="#fde68a" opacity="0.5" />
          <circle cx={sunX} cy={sunY} r={12} fill="#fbbf24" />
          {!compact && (
            <text x={sunX} y={sunY + 28} textAnchor="middle" fill="#fbbf24" fontSize="9">
              ☀️ Soleil
            </text>
          )}
          
          {/* Moon */}
          <circle cx={moonX} cy={moonY} r={8} fill="#d1d5db" />
          {!compact && (
            <text x={moonX} y={moonY + 18} textAnchor="middle" fill="#94a3b8" fontSize="9">
              🌙 Lune
            </text>
          )}
          
          {/* Drawn lines - using flat earth distance */}
          {lines.map((line) => {
            const start2D = latLonTo2D(line.start.lat, line.start.lon);
            const end2D = latLonTo2D(line.end.lat, line.end.lon);
            const midX = (start2D.x + end2D.x) / 2;
            const midY = (start2D.y + end2D.y) / 2;
            const flatDist = flatEarthDistance(line.start, line.end);
            
            return (
              <g key={line.id}>
                <line
                  x1={start2D.x}
                  y1={start2D.y}
                  x2={end2D.x}
                  y2={end2D.y}
                  stroke={line.color}
                  strokeWidth="2"
                />
                <circle cx={start2D.x} cy={start2D.y} r={5} fill={line.color} />
                <circle cx={end2D.x} cy={end2D.y} r={5} fill={line.color} />
                {/* Distance label - flat earth distance */}
                <rect
                  x={midX - 40}
                  y={midY - 12}
                  width="80"
                  height="18"
                  rx="4"
                  fill="rgba(0,0,0,0.8)"
                />
                <text
                  x={midX}
                  y={midY + 3}
                  textAnchor="middle"
                  fill={line.color}
                  fontSize="10"
                  fontWeight="bold"
                >
                  {formatFlatDistance(flatDist)} (FE)
                </text>
              </g>
            );
          })}
          
          {/* Current drawing line */}
          {selectedPoint && hoverCoords && drawingMode === 'drawing' && (
            (() => {
              const start2D = latLonTo2D(selectedPoint.lat, selectedPoint.lon);
              const end2D = latLonTo2D(hoverCoords.lat, hoverCoords.lon);
              const flatDist = flatEarthDistance(selectedPoint, hoverCoords);
              const midX = (start2D.x + end2D.x) / 2;
              const midY = (start2D.y + end2D.y) / 2;
              return (
                <g>
                  <line
                    x1={start2D.x}
                    y1={start2D.y}
                    x2={end2D.x}
                    y2={end2D.y}
                    stroke="#06b6d4"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                  />
                  <circle cx={start2D.x} cy={start2D.y} r={6} fill="#06b6d4" />
                  {/* Preview distance */}
                  <rect
                    x={midX - 35}
                    y={midY - 20}
                    width="70"
                    height="16"
                    rx="3"
                    fill="rgba(0,0,0,0.7)"
                  />
                  <text
                    x={midX}
                    y={midY - 8}
                    textAnchor="middle"
                    fill="#06b6d4"
                    fontSize="10"
                  >
                    {formatFlatDistance(flatDist)}
                  </text>
                </g>
              );
            })()
          )}
          
          {/* Hover indicator */}
          {hoverCoords && drawingMode === 'drawing' && !selectedPoint && (
            (() => {
              const pos = latLonTo2D(hoverCoords.lat, hoverCoords.lon);
              return (
                <circle 
                  cx={pos.x} 
                  cy={pos.y} 
                  r={6} 
                  fill="none" 
                  stroke="#06b6d4" 
                  strokeWidth="2"
                />
              );
            })()
          )}
          
          {/* Scale bar */}
          {!compact && (
            <g transform={`translate(${viewBox.x + viewBox.width - 120}, ${viewBox.y + viewBox.height - 40})`}>
              <rect x="-5" y="-15" width="110" height="35" fill="rgba(0,0,0,0.5)" rx="4" />
              <line x1="0" y1="0" x2="80" y2="0" stroke="#64748b" strokeWidth="2" />
              <line x1="0" y1="-5" x2="0" y2="5" stroke="#64748b" strokeWidth="2" />
              <line x1="80" y1="-5" x2="80" y2="5" stroke="#64748b" strokeWidth="2" />
              <text x="40" y="15" textAnchor="middle" fill="#64748b" fontSize="10">
                {Math.round(80 * pxToKm * (viewBox.width / baseSize))} km
              </text>
            </g>
          )}
          
          {/* Title */}
          {!compact && (
            <text x={viewBox.x + viewBox.width / 2} y={viewBox.y + 25} textAnchor="middle" fill="#64748b" fontSize="12">
              Carte Terre Plate (distances FE)
            </text>
          )}
        </svg>
      </div>
      
      {/* Drawing hint */}
      {drawingMode === 'drawing' && !compact && (
        <div className="absolute bottom-2 right-2 bg-slate-800/90 px-2 py-1 rounded text-xs text-cyan-400">
          {selectedPoint ? '📍 Cliquez pour le 2ème point' : '📍 Cliquez pour le 1er point'}
        </div>
      )}
      
      {/* Pan hint */}
      {drawingMode === 'pan' && !compact && (
        <div className="absolute bottom-2 right-2 bg-slate-800/90 px-2 py-1 rounded text-xs text-slate-400">
          🖱️ Glisser pour déplacer • Molette pour zoomer
        </div>
      )}
    </div>
  );
}

// Main Flat Earth Page component
export function FlatEarthPage() {
  const [viewMode, setViewMode] = useState<'3d' | '2d' | 'both'>('both');
  const [spotlightRadiusFactor, setSpotlightRadiusFactor] = useState(0.35); // 0.1 to 1.0
  
  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Header with navigation */}
      <header className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 lg:px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link 
            to="/" 
            className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Retour</span>
          </Link>
          <div className="h-6 w-px bg-slate-700" />
          <h1 className="text-base lg:text-lg font-semibold">
            <span className="text-amber-400">Modèle</span>
            <span className="text-white ml-1">Terre Plate</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('3d')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                viewMode === '3d'
                  ? 'bg-amber-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Box className="w-3 h-3" />
              3D
            </button>
            <button
              onClick={() => setViewMode('2d')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                viewMode === '2d'
                  ? 'bg-amber-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Map className="w-3 h-3" />
              2D
            </button>
            <button
              onClick={() => setViewMode('both')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                viewMode === 'both'
                  ? 'bg-amber-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ⬚ Les deux
            </button>
          </div>
          
          {/* Spotlight radius control */}
          {(viewMode === '2d' || viewMode === 'both') && (
            <>
              <div className="h-6 w-px bg-slate-700" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">☀️ Rayon éclairé:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.01"
                  value={spotlightRadiusFactor}
                  onChange={(e) => setSpotlightRadiusFactor(parseFloat(e.target.value))}
                  className="w-20 h-1.5 accent-amber-500"
                />
                <span className="text-xs text-amber-400 w-10">{Math.round(spotlightRadiusFactor * 100)}%</span>
              </div>
            </>
          )}
          
          <div className="h-6 w-px bg-slate-700" />
          
          <Link 
            to="/" 
            className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded text-sm hover:bg-cyan-500/30 transition-colors"
          >
            Modèle Globe
          </Link>
        </div>
      </header>

      {/* View content */}
      {viewMode === '3d' && (
        <div className="flex-1 relative">
          <Canvas
            camera={{ position: [6, 4, 6], fov: 50 }}
            gl={{ antialias: true }}
          >
            <ambientLight intensity={0.2} />
            <pointLight position={[0, 10, 0]} intensity={0.5} />
            
            <AnimationController />
            <FlatEarthDisc />
            <Firmament />
            <FlatEarthSun />
            <FlatEarthMoon />
            <OrbitPaths />
            <DistanceMarkers />
            
            <OrbitControls
              enablePan={true}
              minDistance={3}
              maxDistance={15}
              maxPolarAngle={Math.PI / 2 - 0.1}
            />
          </Canvas>
          
          <FlatEarthInfoPanel />
          
          <div className="absolute bottom-4 right-4 bg-slate-800/80 px-3 py-2 rounded text-xs text-slate-400">
            �️ Clic-glisser pour tourner • Molette pour zoomer
          </div>
        </div>
      )}
      
      {viewMode === '2d' && (
        <div className="flex-1 relative">
          <FlatEarth2DView spotlightRadiusFactor={spotlightRadiusFactor} />
          <FlatEarthInfoPanel />
        </div>
      )}
      
      {viewMode === 'both' && (
        <div className="flex-1 flex">
          {/* 3D View */}
          <div className="flex-1 relative border-r border-slate-700">
            <div className="absolute top-2 left-2 z-10 bg-slate-800/80 px-2 py-1 rounded text-xs text-amber-400">
              Vue 3D
            </div>
            <Canvas
              camera={{ position: [6, 4, 6], fov: 50 }}
              gl={{ antialias: true }}
            >
              <ambientLight intensity={0.2} />
              <pointLight position={[0, 10, 0]} intensity={0.5} />
              
              <AnimationController />
              <FlatEarthDisc />
              <Firmament />
              <FlatEarthSun />
              <FlatEarthMoon />
              <OrbitPaths />
              <DistanceMarkers />
              
              <OrbitControls
                enablePan={true}
                minDistance={3}
                maxDistance={15}
                maxPolarAngle={Math.PI / 2 - 0.1}
              />
            </Canvas>
          </div>
          
          {/* 2D View */}
          <div className="flex-1 relative">
            <div className="absolute top-2 left-2 z-10 bg-slate-800/80 px-2 py-1 rounded text-xs text-amber-400">
              Carte 2D (distances FE)
            </div>
            <FlatEarth2DView compact={false} spotlightRadiusFactor={spotlightRadiusFactor} />
          </div>
          
          {/* Control Panel - floating in center */}
          <FlatEarthInfoPanel />
        </div>
      )}
    </div>
  );
}
