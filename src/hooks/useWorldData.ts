import { useState, useEffect } from 'react';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';

// Natural Earth 1:110m land polygons, from the world-atlas package
const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

type Land = FeatureCollection<Geometry>;

// Shared by every view so the file is fetched and parsed only once
let landPromise: Promise<Land> | null = null;

function loadLand(): Promise<Land> {
  landPromise ??= fetch(LAND_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to fetch world data (${response.status})`);
      return response.json() as Promise<Topology<{ land: GeometryCollection }>>;
    })
    .then((topo) => feature(topo, topo.objects.land) as Land)
    .catch((err) => {
      landPromise = null; // allow a retry on the next mount
      throw err;
    });
  return landPromise;
}

interface UseWorldDataReturn {
  land: Land | null;
  loading: boolean;
  error: Error | null;
}

export function useWorldData(): UseWorldDataReturn {
  const [land, setLand] = useState<Land | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLand().then(
      (data) => {
        if (!cancelled) setLand(data);
      },
      (err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { land, loading: !land && !error, error };
}
