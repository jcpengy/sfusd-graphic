import { useEffect, useMemo, useRef, useState } from 'react';
import { SchoolMap, type SchoolMapHandle } from './SchoolMap';
import type { AttendanceArea, MapData, School } from './types';

const DATA_URLS = {
  schools: '/data/schools.geojson',
  areas: '/data/attendance_areas.geojson',
  neighborhoods: '/data/neighborhoods.geojson',
};

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json() as Promise<T>;
}

async function loadMapData(): Promise<MapData> {
  const [schools, areas, neighborhoods] = await Promise.all([
    loadJson<MapData['schools']>(DATA_URLS.schools),
    loadJson<MapData['areas']>(DATA_URLS.areas),
    loadJson<MapData['neighborhoods']>(DATA_URLS.neighborhoods),
  ]);
  return { schools, areas, neighborhoods };
}

function gradeRange(school: School) {
  const format = (grade: string) => (grade === 'KG' ? 'K' : String(Number(grade)));
  return `${format(school.properties.grade_low)}–${format(school.properties.grade_high)}`;
}

function SchoolCard({
  school,
  area,
  selected,
  onZoom,
  onClose,
}: {
  school: School;
  area?: AttendanceArea;
  selected: boolean;
  onZoom: () => void;
  onClose: () => void;
}) {
  const { name, address, city, attendance_area_name, data_vintage } = school.properties;
  return (
    <section className="school-card" aria-live="polite">
      <div className="card-heading">
        <span className="card-label">{selected ? 'Selected school' : 'School'}</span>
        {selected && (
          <button className="icon-button" onClick={onClose} aria-label="Clear selected school">
            ×
          </button>
        )}
      </div>
      <h2>{name}</h2>
      <p className="school-meta">Grades {gradeRange(school)} · {address}, {city}</p>
      {area ? (
        <div className="area-status has-area">
          <span className="status-dot" />
          <div>
            <strong>{attendance_area_name} attendance area</strong>
            <span>{area.properties.vintage} boundary · school data {data_vintage}</span>
          </div>
        </div>
      ) : (
        <div className="area-status no-area">
          <span className="status-ring" />
          <div>
            <strong>No attendance area in this layer</strong>
            <span>No polygon appears for this school in the 2024–25 file.</span>
          </div>
        </div>
      )}
      {selected && area && (
        <button className="secondary-button" onClick={onZoom}>Zoom to attendance area</button>
      )}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<MapData>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<School>();
  const [selected, setSelected] = useState<School>();
  const [showNeighborhoods, setShowNeighborhoods] = useState(false);
  const [onlyWithAreas, setOnlyWithAreas] = useState(false);
  const mapRef = useRef<SchoolMapHandle>(null);

  useEffect(() => {
    loadMapData().then(setData).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'The map data could not be loaded.');
    });
  }, []);

  const areasBySchool = useMemo(
    () => new Map(data?.areas.features.map((area) => [area.properties.school_cds_code, area])),
    [data],
  );
  const active = selected ?? hovered;
  const activeArea = active ? areasBySchool.get(active.properties.cds_code) : undefined;
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !data) return [];
    return data.schools.features
      .filter((school) =>
        `${school.properties.name} ${school.properties.address}`.toLowerCase().includes(term),
      )
      .slice(0, 7);
  }, [data, query]);

  function chooseSchool(school: School) {
    setSelected(school);
    setQuery('');
    mapRef.current?.focusSchool(school);
  }

  if (error) {
    return <main className="centered-message"><h1>Map unavailable</h1><p>{error}</p></main>;
  }
  if (!data) {
    return <main className="centered-message"><div className="loader" /><p>Loading map data…</p></main>;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header>
          <p className="eyebrow">San Francisco elementary schools</p>
          <h1>Schools & attendance areas</h1>
          <p className="intro">
            Explore 72 SFUSD elementary schools and 58 attendance areas.
          </p>
        </header>

        <div className="search-wrap">
          <label htmlFor="school-search">Find a school</label>
          <input
            id="school-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or address"
            autoComplete="off"
          />
          {matches.length > 0 && (
            <ul className="search-results">
              {matches.map((school) => (
                <li key={school.properties.cds_code}>
                  <button onClick={() => chooseSchool(school)}>
                    <strong>{school.properties.name}</strong>
                    <span>{school.properties.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="controls" aria-label="Map display options">
          <label>
            <input
              type="checkbox"
              checked={showNeighborhoods}
              onChange={(event) => setShowNeighborhoods(event.target.checked)}
            />
            <span>Show neighborhood boundaries</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={onlyWithAreas}
              onChange={(event) => setOnlyWithAreas(event.target.checked)}
            />
            <span>Only schools with attendance areas</span>
          </label>
        </div>

        <div className="legend" aria-label="Map legend">
          <span><i className="legend-dot filled" />School with attendance area</span>
          <span><i className="legend-dot hollow" />No area in supplied layer</span>
          <span><i className="legend-area" />Active attendance area</span>
        </div>

        {active ? (
          <SchoolCard
            school={active}
            area={activeArea}
            selected={Boolean(selected)}
            onZoom={() => activeArea && mapRef.current?.fitArea(activeArea)}
            onClose={() => setSelected(undefined)}
          />
        ) : (
          <div className="empty-card">
            <span className="pointer-icon">↖</span>
            <p>Hover over a point or search for a school to see its attendance area.</p>
          </div>
        )}

        <footer>
          <strong>About this data</strong>
          <p>
            Schools: 2025–26 · Boundaries: 2024–25. Historical reference only—not an enrollment or eligibility guarantee.
          </p>
        </footer>
      </aside>

      <section className="map-panel">
        <SchoolMap
          ref={mapRef}
          data={data}
          activeCode={active?.properties.cds_code}
          showNeighborhoods={showNeighborhoods}
          onlyWithAreas={onlyWithAreas}
          onHover={setHovered}
          onSelect={setSelected}
        />
        <button className="reset-button" onClick={() => mapRef.current?.reset()}>Reset map</button>
        <div className="map-instruction">Hover to preview · Click to select</div>
      </section>
    </main>
  );
}
