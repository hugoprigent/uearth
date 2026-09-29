import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { useGeoStore } from '../store/geoStore';
import { useWorldData } from '../hooks/useWorldData';
import {
  latLonToCartesian,
  cartesianToLatLon,
  greatCirclePoints,
  calculateSubsolarPoint,
} from '../utils/solarCalculations';
import { geoAzimuthalEquidistant, geoMercator } from 'd3-geo';
import type { GeoCoordinates, LineSegment } from '../store/geoStore';

const GLOBE_RADIUS = 2;

// Ocean shader with day/night effect
const oceanVertexShader = `
  varying vec3 vNormal;
  
  void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const oceanFragmentShader = `
  uniform vec3 sunDirection;
  uniform float showSun;
  
  varying vec3 vNormal;
  
  void main() {
    vec3 dayColor = vec3(0.055, 0.518, 0.792); // Ocean blue #0e83ca
    vec3 nightColor = vec3(0.02, 0.08, 0.15);  // Dark ocean
    
    vec3 normal = normalize(vNormal);
    float intensity = dot(normal, normalize(sunDirection));
    
    if (showSun < 0.5) {
      gl_FragColor = vec4(dayColor, 1.0);
    } else {
      float terminator = smoothstep(-0.15, 0.15, intensity);
      vec3 color = mix(nightColor, dayColor, terminator);
      gl_FragColor = vec4(color, 1.0);
    }
  }
`;

// Animation controller - advances time when animation is playing
// Also forces continuous rendering to react to slider changes
function AnimationController() {
  const { invalidate } = useThree();
  
  // Subscribe to store changes to trigger re-render
  const dateTime = useGeoStore((state) => state.dateTime);
  const showSun = useGeoStore((state) => state.showSun);
  
  // Force re-render when dateTime or showSun changes
  useEffect(() => {
    invalidate();
  }, [dateTime, showSun, invalidate]);
  
  useFrame((_, delta) => {
    const { isAnimating, advanceTime } = useGeoStore.getState();
    if (isAnimating) {
      advanceTime(delta);
    }
  });
  return null;
}

// Ocean surface component with day/night shader
function OceanSurface() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      sunDirection: { value: new THREE.Vector3() },
      showSun: { value: 1.0 },
    }),
    []
  );

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    const { dateTime, showSun } = useGeoStore.getState();
    const sunPos = calculateSubsolarPoint(dateTime);
    const [x, y, z] = latLonToCartesian(sunPos.lat, sunPos.lon, 1);
    material.uniforms.sunDirection.value.set(x, y, z).normalize();
    material.uniforms.showSun.value = showSun ? 1.0 : 0.0;
  });

  return (
    <Sphere args={[GLOBE_RADIUS, 64, 64]}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={oceanVertexShader}
        fragmentShader={oceanFragmentShader}
        uniforms={uniforms}
      />
    </Sphere>
  );
}

// Note: Filling land polygons on a 3D sphere is complex due to triangulation issues
// For now, we use thick border lines to represent land masses
// A proper solution would require a texture or more advanced geometry processing

// Country borders component with thicker lines for better visibility
function CountryBorders() {
  const { land } = useWorldData();

  const borderLines = useMemo(() => {
    if (!land) return [];

    const lines: THREE.Vector3[][] = [];

    const processCoordinates = (coords: number[][]) => {
      const points: THREE.Vector3[] = [];
      for (const [lon, lat] of coords) {
        const [x, y, z] = latLonToCartesian(lat, lon, GLOBE_RADIUS * 1.002);
        points.push(new THREE.Vector3(x, y, z));
      }
      if (points.length > 1) {
        lines.push(points);
      }
    };

    for (const feature of land.features) {
      const geometry = feature.geometry;
      if (geometry.type === 'Polygon') {
        for (const ring of geometry.coordinates as number[][][]) {
          processCoordinates(ring);
        }
      } else if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates as number[][][][]) {
          for (const ring of polygon) {
            processCoordinates(ring);
          }
        }
      }
    }

    return lines;
  }, [land]);

  return (
    <group>
      {borderLines.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#22c55e"
          lineWidth={2}
        />
      ))}
    </group>
  );
}

// Graticule (lat/lon grid)
function Graticule() {
  const lines = useMemo(() => {
    const result: THREE.Vector3[][] = [];

    // Latitude lines
    for (let lat = -80; lat <= 80; lat += 20) {
      const points: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 5) {
        const [x, y, z] = latLonToCartesian(lat, lon, GLOBE_RADIUS * 1.002);
        points.push(new THREE.Vector3(x, y, z));
      }
      result.push(points);
    }

    // Longitude lines
    for (let lon = -180; lon < 180; lon += 20) {
      const points: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        const [x, y, z] = latLonToCartesian(lat, lon, GLOBE_RADIUS * 1.002);
        points.push(new THREE.Vector3(x, y, z));
      }
      result.push(points);
    }

    return result;
  }, []);

  return (
    <group>
      {lines.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#334155"
          lineWidth={0.5}
          transparent
          opacity={0.5}
        />
      ))}
    </group>
  );
}

// Hover marker
function HoverMarker() {
  const { hoverCoords } = useGeoStore();
  const markerRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (markerRef.current && hoverCoords) {
      const [x, y, z] = latLonToCartesian(
        hoverCoords.lat,
        hoverCoords.lon,
        GLOBE_RADIUS * 1.01
      );
      markerRef.current.position.set(x, y, z);
      markerRef.current.visible = true;
    } else if (markerRef.current) {
      markerRef.current.visible = false;
    }
  });

  return (
    <mesh ref={markerRef}>
      <sphereGeometry args={[0.05, 16, 16]} />
      <meshBasicMaterial color="#f43f5e" />
    </mesh>
  );
}

// Selected point marker
function SelectedPointMarker() {
  const { selectedPoint } = useGeoStore();

  if (!selectedPoint) return null;

  const [x, y, z] = latLonToCartesian(
    selectedPoint.lat,
    selectedPoint.lon,
    GLOBE_RADIUS * 1.01
  );

  return (
    <mesh position={[x, y, z]}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshBasicMaterial color="#06b6d4" />
    </mesh>
  );
}

// Lines component
function DrawnLines() {
  const { lines } = useGeoStore();

  return (
    <group>
      {lines.map((line) => (
        <DrawnLine key={line.id} line={line} />
      ))}
    </group>
  );
}

function DrawnLine({ line }: { line: LineSegment }) {
  const points = useMemo(() => {
    let pathPoints: GeoCoordinates[];

    if (line.sourceView === 'globe') {
      // Line drawn on globe = great circle (geodesic)
      pathPoints = greatCirclePoints(line.start, line.end, 100);
    } else if (line.sourceView === 'azimuthal') {
      // Line drawn on azimuthal = straight line in azimuthal space
      const azimuthalProj = geoAzimuthalEquidistant()
        .scale(100)
        .translate([0, 0])
        .rotate([0, -90]);

      const startAz = azimuthalProj([line.start.lon, line.start.lat]);
      const endAz = azimuthalProj([line.end.lon, line.end.lat]);

      if (!startAz || !endAz) return [];

      pathPoints = [];
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const x = startAz[0] + t * (endAz[0] - startAz[0]);
        const y = startAz[1] + t * (endAz[1] - startAz[1]);
        const coords = azimuthalProj.invert?.([x, y]);
        if (coords) {
          pathPoints.push({ lon: coords[0], lat: coords[1] });
        }
      }
    } else if (line.sourceView === 'mercator') {
      // Line drawn on Mercator = straight line in Mercator space
      const mercatorProj = geoMercator()
        .scale(100)
        .translate([0, 0]);

      const startM = mercatorProj([line.start.lon, line.start.lat]);
      const endM = mercatorProj([line.end.lon, line.end.lat]);

      if (!startM || !endM) return [];

      pathPoints = [];
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const x = startM[0] + t * (endM[0] - startM[0]);
        const y = startM[1] + t * (endM[1] - startM[1]);
        const coords = mercatorProj.invert?.([x, y]);
        if (coords) {
          pathPoints.push({ lon: coords[0], lat: coords[1] });
        }
      }
    } else {
      // Default to geodesic
      pathPoints = greatCirclePoints(line.start, line.end, 100);
    }

    return pathPoints.map((p) => {
      const [x, y, z] = latLonToCartesian(p.lat, p.lon, GLOBE_RADIUS * 1.005);
      return new THREE.Vector3(x, y, z);
    });
  }, [line]);

  if (points.length === 0) return null;

  // Calculate midpoint for distance label
  const midIndex = Math.floor(points.length / 2);
  const midPoint = points[midIndex];
  const labelPosition = midPoint.clone().normalize().multiplyScalar(GLOBE_RADIUS * 1.1);
  
  // Format distance
  const distanceText = line.distance >= 1000 
    ? `${(line.distance / 1000).toFixed(1)}k km`
    : `${line.distance.toFixed(0)} km`;

  return (
    <>
      <Line points={points} color={line.color} lineWidth={3} />
      {/* Start point */}
      <mesh position={points[0]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color={line.color} />
      </mesh>
      {/* End point */}
      <mesh position={points[points.length - 1]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color={line.color} />
      </mesh>
      {/* Distance label */}
      <Billboard position={labelPosition}>
        <Text
          fontSize={0.12}
          color="#f1f5f9"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#0f172a"
        >
          {distanceText}
        </Text>
      </Billboard>
    </>
  );
}

// Mouse interaction handler
function MouseHandler() {
  const { camera, gl } = useThree();
  const { setHoverCoords, setSelectedPoint, selectedPoint, drawingMode, addLine, activeDrawingView, setActiveDrawingView } = useGeoStore();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      
      const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS);
      const intersection = new THREE.Vector3();
      
      if (raycaster.ray.intersectSphere(sphere, intersection)) {
        const coords = cartesianToLatLon(intersection.x, intersection.y, intersection.z);
        setHoverCoords(coords);
      } else {
        setHoverCoords(null);
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (drawingMode !== 'drawing') return;

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS);
      const intersection = new THREE.Vector3();

      if (raycaster.ray.intersectSphere(sphere, intersection)) {
        const coords = cartesianToLatLon(intersection.x, intersection.y, intersection.z);

        if (!selectedPoint || activeDrawingView !== 'globe') {
          setSelectedPoint(coords);
          setActiveDrawingView('globe');
        } else {
          const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
          const color = colors[Math.floor(Math.random() * colors.length)];

          addLine({
            start: selectedPoint,
            end: coords,
            sourceView: 'globe',
            color,
          });
        }
      }
    };

    const handleMouseLeave = () => {
      setHoverCoords(null);
    };

    gl.domElement.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('click', handleClick);
    gl.domElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('click', handleClick);
      gl.domElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [camera, gl, raycaster, setHoverCoords, setSelectedPoint, selectedPoint, drawingMode, addLine, activeDrawingView, setActiveDrawingView]);

  return null;
}

// Main Globe3D component
export function Globe3D({ className = '' }: { className?: string }) {
  const { hoverCoords, drawingMode } = useGeoStore();

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <h2 className="text-xs sm:text-sm font-semibold text-cyan-400">Vue 3D</h2>
        <span className="text-xs text-slate-400 hidden sm:inline">Globe Terrestre</span>
      </div>
      <div className={`flex-1 relative ${drawingMode === 'drawing' ? 'cursor-crosshair' : 'cursor-grab'}`}>
        <Canvas
          camera={{ position: [5, 1, 3], fov: 45 }}
          gl={{ antialias: true }}
          frameloop="demand"
        >
          <AnimationController />
          <ambientLight intensity={0.1} />
          <OceanSurface />
          <CountryBorders />
          <Graticule />
          <HoverMarker />
          <SelectedPointMarker />
          <DrawnLines />
          <MouseHandler />
          <OrbitControls
            enablePan={false}
            minDistance={3}
            maxDistance={10}
            rotateSpeed={0.5}
          />
        </Canvas>
        {drawingMode === 'drawing' && (
          <div className="absolute top-2 left-2 bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded text-xs">
            Mode tracé: Globe (Géodésique)
          </div>
        )}
        {hoverCoords && (
          <div className="absolute bottom-2 left-2 bg-slate-800/90 px-2 py-1 rounded text-xs font-mono">
            <span className="text-cyan-400">
              {hoverCoords.lat.toFixed(2)}°{hoverCoords.lat >= 0 ? 'N' : 'S'}
            </span>
            <span className="text-slate-400 mx-1">|</span>
            <span className="text-emerald-400">
              {Math.abs(hoverCoords.lon).toFixed(2)}°{hoverCoords.lon >= 0 ? 'E' : 'W'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
