import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { AttendanceArea, MapData, School } from './types';

const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const SF_CENTER: [number, number] = [-122.447, 37.756];
setWorkerUrl(mapWorkerUrl);

export interface SchoolMapHandle {
  focusSchool: (school: School) => void;
  fitArea: (area: AttendanceArea) => void;
  reset: () => void;
}

interface SchoolMapProps {
  data: MapData;
  activeCode?: string;
  showNeighborhoods: boolean;
  onlyWithAreas: boolean;
  onHover: (school?: School) => void;
  onSelect: (school?: School) => void;
}

type DisplayState = Pick<
  SchoolMapProps,
  'activeCode' | 'showNeighborhoods' | 'onlyWithAreas'
>;
type Filter = Parameters<MapLibreMap['setFilter']>[1];

const filterBy = (property: string, value: string | boolean) =>
  ['==', ['get', property], value] as Filter;

function syncDisplay(map: MapLibreMap, state: DisplayState) {
  if (!map.isStyleLoaded() || !map.getLayer('school-points')) return;
  const { activeCode = '', showNeighborhoods, onlyWithAreas } = state;
  map.setFilter('active-school-halo', filterBy('cds_code', activeCode));
  ['active-area-fill', 'active-area-line'].forEach((layer) =>
    map.setFilter(layer, filterBy('school_cds_code', activeCode)),
  );
  ['neighborhood-fills', 'neighborhood-lines'].forEach((layer) =>
    map.setLayoutProperty(layer, 'visibility', showNeighborhoods ? 'visible' : 'none'),
  );
  const pointFilter = onlyWithAreas
    ? filterBy('has_attendance_area_name_match', true)
    : null;
  ['school-points', 'school-hit-areas'].forEach((layer) =>
    map.setFilter(layer, pointFilter),
  );
}

function areaBounds(area: AttendanceArea) {
  const bounds = new LngLatBounds();
  area.geometry.coordinates
    .flat(2)
    .forEach(([longitude, latitude]) => bounds.extend([longitude, latitude]));
  return bounds;
}

export const SchoolMap = forwardRef<SchoolMapHandle, SchoolMapProps>(
  function SchoolMap(
    {
      data,
      activeCode,
      showNeighborhoods,
      onlyWithAreas,
      onHover,
      onSelect,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const displayRef = useRef({ activeCode, showNeighborhoods, onlyWithAreas });
    displayRef.current = { activeCode, showNeighborhoods, onlyWithAreas };

    useImperativeHandle(ref, () => ({
      focusSchool(school) {
        mapRef.current?.flyTo({
          center: school.geometry.coordinates as [number, number],
          zoom: 14,
          duration: 900,
        });
      },
      fitArea(area) {
        mapRef.current?.fitBounds(areaBounds(area), {
          padding: 72,
          duration: 900,
          maxZoom: 14,
        });
      },
      reset() {
        mapRef.current?.flyTo({ center: SF_CENTER, zoom: 11.5, duration: 900 });
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const map = new MapLibreMap({
        container: containerRef.current,
        style: BASEMAP,
        center: SF_CENTER,
        zoom: 11.5,
        minZoom: 10.5,
        maxBounds: [
          [-122.58, 37.68],
          [-122.32, 37.84],
        ],
      });
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        map.addSource('neighborhoods', { type: 'geojson', data: data.neighborhoods });
        map.addSource('attendance-areas', { type: 'geojson', data: data.areas });
        map.addSource('schools', { type: 'geojson', data: data.schools });

        map.addLayer({
          id: 'neighborhood-fills',
          type: 'fill',
          source: 'neighborhoods',
          layout: { visibility: 'none' },
          paint: { 'fill-color': '#dce4e2', 'fill-opacity': 0.18 },
        });
        map.addLayer({
          id: 'neighborhood-lines',
          type: 'line',
          source: 'neighborhoods',
          layout: { visibility: 'none' },
          paint: {
            'line-color': '#687b78',
            'line-opacity': 0.7,
            'line-width': 1,
            'line-dasharray': [3, 2],
          },
        });
        map.addLayer({
          id: 'active-area-fill',
          type: 'fill',
          source: 'attendance-areas',
          filter: ['==', ['get', 'school_cds_code'], ''],
          paint: { 'fill-color': '#f8bd61', 'fill-opacity': 0.3 },
        });
        map.addLayer({
          id: 'active-area-line',
          type: 'line',
          source: 'attendance-areas',
          filter: ['==', ['get', 'school_cds_code'], ''],
          paint: { 'line-color': '#a84f22', 'line-width': 2.5 },
        });
        map.addLayer({
          id: 'active-school-halo',
          type: 'circle',
          source: 'schools',
          filter: ['==', ['get', 'cds_code'], ''],
          paint: {
            'circle-radius': 11,
            'circle-color': '#fffdf8',
            'circle-stroke-color': '#a84f22',
            'circle-stroke-width': 3,
          },
        });
        map.addLayer({
          id: 'school-points',
          type: 'circle',
          source: 'schools',
          paint: {
            'circle-radius': 5.5,
            'circle-color': [
              'case',
              ['get', 'has_attendance_area_name_match'],
              '#174f63',
              '#fffdf8',
            ],
            'circle-stroke-color': '#174f63',
            'circle-stroke-width': 2,
          },
        });
        map.addLayer({
          id: 'school-hit-areas',
          type: 'circle',
          source: 'schools',
          paint: { 'circle-radius': 14, 'circle-opacity': 0 },
        });
        syncDisplay(map, displayRef.current);

        const schoolFromEvent = (event: MapLayerMouseEvent) =>
          event.features?.[0] as School | undefined;

        map.on('mouseenter', 'school-hit-areas', (event) => {
          map.getCanvas().style.cursor = 'pointer';
          onHover(schoolFromEvent(event));
        });
        map.on('mousemove', 'school-hit-areas', (event) => {
          onHover(schoolFromEvent(event));
        });
        map.on('mouseleave', 'school-hit-areas', () => {
          map.getCanvas().style.cursor = '';
          onHover();
        });
        map.on('click', 'school-hit-areas', (event) => {
          onSelect(schoolFromEvent(event));
        });
        map.on('click', (event) => {
          if (!map.queryRenderedFeatures(event.point, { layers: ['school-hit-areas'] }).length) {
            onSelect();
          }
        });
      });

      return () => {
        map.remove();
        mapRef.current = null;
      };
    }, [data, onHover, onSelect]);

    useEffect(() => {
      if (mapRef.current) syncDisplay(mapRef.current, displayRef.current);
    }, [activeCode, showNeighborhoods, onlyWithAreas]);

    return <div className="map" ref={containerRef} aria-label="Interactive SFUSD school map" />;
  },
);
