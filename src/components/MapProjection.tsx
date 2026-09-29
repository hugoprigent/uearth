import { useRef, useEffect, useCallback, useState } from 'react';
import {
  geoPath,
  geoMercator,
  geoAzimuthalEquidistant,
  geoGraticule,
  type GeoProjection,
  type GeoPermissibleObjects,
} from 'd3-geo';
import { useGeoStore } from '../store/geoStore';
import { useWorldData } from '../hooks/useWorldData';
import {
  calculateTerminator,
  calculateSubsolarPoint,
  greatCirclePoints,
} from '../utils/solarCalculations';
import type { GeoCoordinates, LineSegment } from '../store/geoStore';

export type ProjectionType = 'mercator' | 'azimuthal';

interface MapProjectionProps {
  projectionType: ProjectionType;
  title: string;
  className?: string;
}

// Draw night overlay
function drawNightOverlay(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  width: number,
  height: number,
  date: Date
) {
  const subsolar = calculateSubsolarPoint(date);
  
  const scale = 4;
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.ceil(width / scale);
  offscreen.height = Math.ceil(height / scale);
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return;

  const imageData = offCtx.createImageData(offscreen.width, offscreen.height);
  const data = imageData.data;

  for (let y = 0; y < offscreen.height; y++) {
    for (let x = 0; x < offscreen.width; x++) {
      const coords = projection.invert?.([x * scale, y * scale]);
      if (!coords) continue;

      const [lon, lat] = coords;
      if (isNaN(lat) || isNaN(lon)) continue;
      if (lat < -90 || lat > 90) continue;

      const lat1 = lat * (Math.PI / 180);
      const lat2 = subsolar.lat * (Math.PI / 180);
      const dLon = (lon - subsolar.lon) * (Math.PI / 180);

      const angularDist = Math.acos(
        Math.max(-1, Math.min(1,
          Math.sin(lat1) * Math.sin(lat2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon)
        ))
      );

      const idx = (y * offscreen.width + x) * 4;
      
      if (angularDist > Math.PI / 2) {
        data[idx] = 15;
        data[idx + 1] = 23;
        data[idx + 2] = 42;
        data[idx + 3] = 160;
      } else if (angularDist > Math.PI / 2 - 0.1) {
        const twilight = (angularDist - (Math.PI / 2 - 0.1)) / 0.1;
        data[idx] = 15;
        data[idx + 1] = 23;
        data[idx + 2] = 42;
        data[idx + 3] = Math.floor(twilight * 160);
      }
    }
  }

  offCtx.putImageData(imageData, 0, 0);
  
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(offscreen, 0, 0, width, height);
  ctx.restore();
}

// Draw all lines; lines drawn on another view are re-projected point by point
function drawLines(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  lines: LineSegment[],
  width: number,
  viewKey: ProjectionType
) {
  for (const line of lines) {
    ctx.beginPath();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 3;

    let points: GeoCoordinates[] = [];

    if (line.sourceView === viewKey) {
      // This line was drawn on this view - draw as straight line
      const startProjected = projection([line.start.lon, line.start.lat]);
      const endProjected = projection([line.end.lon, line.end.lat]);
      if (startProjected && endProjected) {
        ctx.moveTo(startProjected[0], startProjected[1]);
        ctx.lineTo(endProjected[0], endProjected[1]);
      }
      ctx.stroke();
    } else {
      // Line from another view - need to project points
      if (line.sourceView === 'globe') {
        // Globe = geodesic
        points = greatCirclePoints(line.start, line.end, 100);
      } else if (line.sourceView === 'azimuthal') {
        // From azimuthal - unproject
        const azimuthalProj = geoAzimuthalEquidistant()
          .scale(100)
          .translate([0, 0])
          .rotate([0, -90]);

        const startAz = azimuthalProj([line.start.lon, line.start.lat]);
        const endAz = azimuthalProj([line.end.lon, line.end.lat]);

        if (startAz && endAz) {
          for (let i = 0; i <= 100; i++) {
            const t = i / 100;
            const x = startAz[0] + t * (endAz[0] - startAz[0]);
            const y = startAz[1] + t * (endAz[1] - startAz[1]);
            const coords = azimuthalProj.invert?.([x, y]);
            if (coords) {
              points.push({ lon: coords[0], lat: coords[1] });
            }
          }
        }
      } else if (line.sourceView === 'mercator') {
        // From Mercator - unproject
        const mercatorProj = geoMercator()
          .scale(100)
          .translate([0, 0]);

        const startM = mercatorProj([line.start.lon, line.start.lat]);
        const endM = mercatorProj([line.end.lon, line.end.lat]);

        if (startM && endM) {
          for (let i = 0; i <= 100; i++) {
            const t = i / 100;
            const x = startM[0] + t * (endM[0] - startM[0]);
            const y = startM[1] + t * (endM[1] - startM[1]);
            const coords = mercatorProj.invert?.([x, y]);
            if (coords) {
              points.push({ lon: coords[0], lat: coords[1] });
            }
          }
        }
      }

      // Draw the interpolated points
      let started = false;
      let lastProjected: [number, number] | null = null;
      
      for (const point of points) {
        const projected = projection([point.lon, point.lat]);
        if (projected && isFinite(projected[0]) && isFinite(projected[1])) {
          // Detect wrap-around
          if (lastProjected && Math.abs(projected[0] - lastProjected[0]) > width / 2) {
            started = false;
          }
          
          if (!started) {
            ctx.moveTo(projected[0], projected[1]);
            started = true;
          } else {
            ctx.lineTo(projected[0], projected[1]);
          }
          lastProjected = projected;
        }
      }
      ctx.stroke();
    }

    // Draw endpoints
    const startProjected = projection([line.start.lon, line.start.lat]);
    const endProjected = projection([line.end.lon, line.end.lat]);

    if (startProjected) {
      ctx.beginPath();
      ctx.arc(startProjected[0], startProjected[1], 5, 0, 2 * Math.PI);
      ctx.fillStyle = line.color;
      ctx.fill();
    }

    if (endProjected) {
      ctx.beginPath();
      ctx.arc(endProjected[0], endProjected[1], 5, 0, 2 * Math.PI);
      ctx.fillStyle = line.color;
      ctx.fill();
    }

    // Draw distance label at midpoint
    if (startProjected && endProjected && line.distance > 0) {
      const midX = (startProjected[0] + endProjected[0]) / 2;
      const midY = (startProjected[1] + endProjected[1]) / 2;
      
      // Format distance
      const distanceText = line.distance >= 1000 
        ? `${(line.distance / 1000).toFixed(1)}k km`
        : `${line.distance.toFixed(0)} km`;
      
      // Draw background
      ctx.font = 'bold 11px monospace';
      const textWidth = ctx.measureText(distanceText).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(midX - textWidth / 2 - 4, midY - 8, textWidth + 8, 16);
      
      // Draw border
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(midX - textWidth / 2 - 4, midY - 8, textWidth + 8, 16);
      
      // Draw text
      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(distanceText, midX, midY);
    }
  }
}

export function MapProjection({ projectionType, title, className = '' }: MapProjectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { land, loading } = useWorldData();

  // Local state for pan and zoom
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastOffset, setLastOffset] = useState({ x: 0, y: 0 });

  const {
    hoverCoords,
    setHoverCoords,
    selectedPoint,
    setSelectedPoint,
    drawingMode,
    addLine,
    lines,
    dateTime,
    showSun,
    activeDrawingView,
    setActiveDrawingView,
  } = useGeoStore();

  // Create projection based on type with zoom and pan
  const createProjection = useCallback(
    (width: number, height: number): GeoProjection => {
      const baseScale = projectionType === 'mercator' 
        ? width / (2 * Math.PI)
        : Math.min(width, height) / 4;
      
      if (projectionType === 'mercator') {
        return geoMercator()
          .scale(baseScale * zoom)
          .translate([width / 2 + offset.x, height / 2 + offset.y])
          .clipExtent([
            [0, 0],
            [width, height],
          ]);
      } else {
        return geoAzimuthalEquidistant()
          .scale(baseScale * zoom)
          .translate([width / 2 + offset.x, height / 2 + offset.y])
          .rotate([0, -90])
          .clipAngle(180);
      }
    },
    [projectionType, zoom, offset]
  );

  // Get coordinates from mouse position
  const getCoordinatesFromMouse = useCallback(
    (event: MouseEvent | React.MouseEvent, projection: GeoProjection): GeoCoordinates | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const coords = projection.invert?.([x, y]);
      if (!coords) return null;

      const [lon, lat] = coords;
      if (isNaN(lat) || isNaN(lon)) return null;
      if (lat < -90 || lat > 90) return null;

      return { lat, lon: ((lon + 180) % 360) - 180 };
    },
    []
  );

  // Draw the map
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !land) return;

    const { width, height } = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const projection = createProjection(width, height);
    const path = geoPath(projection, ctx);

    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw ocean background
    if (projectionType === 'azimuthal') {
      ctx.beginPath();
      const centerX = width / 2 + offset.x;
      const centerY = height / 2 + offset.y;
      const radius = Math.min(width, height) / 4 * zoom * Math.PI;
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#1e3a5f';
      ctx.fill();
    } else {
      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(0, 0, width, height);
    }

    // Draw graticule
    const graticule = geoGraticule().step([15, 15]);
    ctx.beginPath();
    path(graticule() as GeoPermissibleObjects);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Draw land
    ctx.beginPath();
    path(land as GeoPermissibleObjects);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Draw night overlay if sun is enabled
    if (showSun) {
      drawNightOverlay(ctx, projection, width, height, dateTime);
    }

    // Draw terminator line
    if (showSun) {
      const terminatorPoints = calculateTerminator(dateTime, 360);
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      
      let started = false;
      let lastProjected: [number, number] | null = null;
      
      for (const [lon, lat] of terminatorPoints) {
        const projected = projection([lon, lat]);
        if (projected) {
          // Avoid drawing lines that wrap around
          if (lastProjected && Math.abs(projected[0] - lastProjected[0]) > width / 2) {
            started = false;
          }
          
          if (!started) {
            ctx.moveTo(projected[0], projected[1]);
            started = true;
          } else {
            ctx.lineTo(projected[0], projected[1]);
          }
          lastProjected = projected;
        }
      }
      ctx.stroke();

      // Draw sun position
      const sunPos = calculateSubsolarPoint(dateTime);
      const sunProjected = projection([sunPos.lon, sunPos.lat]);
      if (sunProjected && sunProjected[0] > 0 && sunProjected[0] < width && sunProjected[1] > 0 && sunProjected[1] < height) {
        // Sun glow
        const gradient = ctx.createRadialGradient(
          sunProjected[0], sunProjected[1], 0,
          sunProjected[0], sunProjected[1], 25
        );
        gradient.addColorStop(0, 'rgba(251, 191, 36, 0.6)');
        gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.2)');
        gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.beginPath();
        ctx.arc(sunProjected[0], sunProjected[1], 25, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Sun circle
        ctx.beginPath();
        ctx.arc(sunProjected[0], sunProjected[1], 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Draw lines
    drawLines(ctx, projection, lines, width, projectionType);

    // Draw selected point
    if (selectedPoint) {
      const projected = projection([selectedPoint.lon, selectedPoint.lat]);
      if (projected) {
        ctx.beginPath();
        ctx.arc(projected[0], projected[1], 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();
        ctx.strokeStyle = '#0e7490';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Draw hover marker
    if (hoverCoords) {
      const projected = projection([hoverCoords.lon, hoverCoords.lat]);
      if (projected) {
        ctx.beginPath();
        ctx.arc(projected[0], projected[1], 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#be123c';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Crosshair
        ctx.beginPath();
        ctx.moveTo(projected[0] - 12, projected[1]);
        ctx.lineTo(projected[0] + 12, projected[1]);
        ctx.moveTo(projected[0], projected[1] - 12);
        ctx.lineTo(projected[0], projected[1] + 12);
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }, [land, createProjection, projectionType, hoverCoords, selectedPoint, lines, dateTime, showSun, zoom, offset]);

  // Handle mouse events for hover and click
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (isDragging) return;
      
      const { width, height } = container.getBoundingClientRect();
      const projection = createProjection(width, height);
      const coords = getCoordinatesFromMouse(event, projection);
      setHoverCoords(coords);
    };

    const handleMouseLeave = () => {
      setHoverCoords(null);
    };

    const handleClick = (event: MouseEvent) => {
      if (drawingMode !== 'drawing') return;
      if (isDragging) return;

      const { width, height } = container.getBoundingClientRect();
      const projection = createProjection(width, height);
      const coords = getCoordinatesFromMouse(event, projection);
      if (!coords) return;

      const currentView = projectionType;

      if (!selectedPoint || activeDrawingView !== currentView) {
        setSelectedPoint(coords);
        setActiveDrawingView(currentView);
      } else {
        const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        addLine({
          start: selectedPoint,
          end: coords,
          sourceView: currentView,
          color,
        });
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('click', handleClick);
    };
  }, [createProjection, getCoordinatesFromMouse, setHoverCoords, drawingMode, selectedPoint, setSelectedPoint, addLine, isDragging, activeDrawingView, setActiveDrawingView, projectionType]);

  // Handle drag for panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (drawingMode === 'drawing') return;
      setIsDragging(true);
      setDragStart({ x: event.clientX, y: event.clientY });
      setLastOffset(offset);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      setOffset({ x: lastOffset.x + dx, y: lastOffset.y + dy });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.5, Math.min(10, z * delta)));
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [isDragging, dragStart, lastOffset, offset, drawingMode]);

  // Touch events for mobile
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastTouchDistance = 0;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1 && drawingMode !== 'drawing') {
        const touch = event.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX, y: touch.clientY });
        setLastOffset(offset);
      } else if (event.touches.length === 2) {
        const dx = event.touches[1].clientX - event.touches[0].clientX;
        const dy = event.touches[1].clientY - event.touches[0].clientY;
        lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      
      if (event.touches.length === 1 && isDragging) {
        const touch = event.touches[0];
        const dx = touch.clientX - dragStart.x;
        const dy = touch.clientY - dragStart.y;
        setOffset({ x: lastOffset.x + dx, y: lastOffset.y + dy });
      } else if (event.touches.length === 2) {
        const dx = event.touches[1].clientX - event.touches[0].clientX;
        const dy = event.touches[1].clientY - event.touches[0].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (lastTouchDistance > 0) {
          const scale = distance / lastTouchDistance;
          setZoom(z => Math.max(0.5, Math.min(10, z * scale)));
        }
        
        lastTouchDistance = distance;
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      lastTouchDistance = 0;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragStart, lastOffset, offset, drawingMode]);

  // Redraw on state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Reset view
  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const projectionLabel = projectionType === 'mercator' ? 'Mercator' : 'Azimutale Équidistante';

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <h2 className="text-xs sm:text-sm font-semibold text-cyan-400">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:inline">{projectionLabel}</span>
          <button
            onClick={resetView}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
            title="Réinitialiser la vue"
          >
            ↺
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className={`w-full h-full ${isDragging ? 'cursor-grabbing' : drawingMode !== 'none' ? 'cursor-crosshair' : 'cursor-grab'}`}
          />
        )}
        {drawingMode === 'drawing' && (
          <div className="absolute top-2 left-2 bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs">
            Mode tracé: {projectionType === 'mercator' ? 'Mercator' : 'Azimutale'}
          </div>
        )}
        <div className="absolute bottom-2 right-2 bg-slate-800/90 px-2 py-1 rounded text-xs text-slate-400">
          Zoom: {zoom.toFixed(1)}x
        </div>
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
