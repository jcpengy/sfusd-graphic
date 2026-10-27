import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { SchoolMap, type SchoolMapHandle } from './SchoolMap';
import type { AttendanceArea, MapData, School } from './types';

const DATA_URLS = {
  schools: '/data/schools.geojson',
  areas: '/data/attendance_areas.geojson',
  neighborhoods: '/data/neighborhoods.geojson',
};
type SystemMode = 'current' | 'planned';

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

function SchoolCard({ school, area, selected, onZoom, onClose }: {
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
        <span className="card-label">{selected ? 'Selected school' : 'School preview'}</span>
        {selected && <button className="icon-button" onClick={onClose} aria-label="Clear selected school">×</button>}
      </div>
      <h2>{name}</h2>
      <p className="school-meta">Grades {gradeRange(school)} · {address}, {city}</p>
      {area ? (
        <div className="area-status has-area">
          <span className="status-dot" />
          <div><strong>{attendance_area_name} attendance area</strong><span>{area.properties.vintage} boundary · school data {data_vintage}</span></div>
        </div>
      ) : (
        <div className="area-status no-area">
          <span className="status-ring" />
          <div><strong>No attendance area in this layer</strong><span>No polygon appears for this school in the 2024–25 file.</span></div>
        </div>
      )}
      {selected && area && <button className="secondary-button" onClick={onZoom}>Zoom to attendance area</button>}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<MapData>();
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<SystemMode>('current');
  const [address, setAddress] = useState('');
  const [addressNotice, setAddressNotice] = useState<string>();
  const [hovered, setHovered] = useState<School>();
  const [selected, setSelected] = useState<School>();
  const [showNeighborhoods, setShowNeighborhoods] = useState(false);
  const mapRef = useRef<SchoolMapHandle>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    loadMapData().then(setData).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'The map data could not be loaded.');
    });
  }, []);

  const areasBySchool = useMemo(
    () => new Map(data?.areas.features.map((area) => [area.properties.school_cds_code, area])),
    [data],
  );
  const active = mode === 'current' ? selected ?? hovered : undefined;
  const activeArea = active ? areasBySchool.get(active.properties.cds_code) : undefined;

  const handleHover = useCallback((school?: School) => {
    if (modeRef.current === 'current') setHovered(school);
  }, []);

  const handleSelect = useCallback((school?: School) => {
    if (modeRef.current === 'current') setSelected(school);
  }, []);

  function submitAddress(event: FormEvent) {
    event.preventDefault();
    if (address.trim()) {
      setAddressNotice('Address lookup is ready to connect after external geocoding is approved.');
    }
  }

  function chooseMode(nextMode: SystemMode) {
    setMode(nextMode);
    setHovered(undefined);
  }

  if (error) return <main className="centered-message"><h1>Map unavailable</h1><p>{error}</p></main>;
  if (!data) return <main className="centered-message"><div className="loader" /><p>Loading map data…</p></main>;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header>
          <p className="eyebrow">SFUSD elementary schools</p>
          <h1>Which SF elementary school could your child attend?</h1>
          <p className="intro">Enter your address to compare today’s attendance-area priority with SFUSD’s planned neighborhood system.</p>
        </header>

        <form className="address-form" onSubmit={submitAddress}>
          <label htmlFor="home-address">Enter your home address</label>
          <div className="address-input-row">
            <input id="home-address" value={address} onChange={(event) => { setAddress(event.target.value); setAddressNotice(undefined); }} placeholder="123 Main St" autoComplete="street-address" />
            <button className="primary-button" disabled={!address.trim()}>Find</button>
          </div>
          {addressNotice && <p className="form-error" role="status">{addressNotice}</p>}
          <p className="form-note">Your address will only be used to locate its attendance area.</p>
        </form>

        <div className="system-toggle" role="tablist" aria-label="Compare assignment systems">
          <button role="tab" aria-selected={mode === 'current'} className={mode === 'current' ? 'active' : ''} onClick={() => chooseMode('current')}>
            <span className="system-kicker">Now</span>
            <strong>Current choice system</strong>
            <small>Attendance-area priority</small>
          </button>
          <button role="tab" aria-selected={mode === 'planned'} className={mode === 'planned' ? 'active' : ''} onClick={() => chooseMode('planned')}>
            <span className="system-kicker">2028–29</span>
            <strong>Planned neighborhood system</strong>
            <small>School not announced yet</small>
          </button>
        </div>

        {mode === 'planned' ? (
          <section className="future-card" aria-live="polite">
            <span className="card-label">Planned 2028–29</span>
            <h2>Your future school isn’t known yet</h2>
            <p>SFUSD has approved a move toward neighborhood assignment, but final boundaries and address-level assignments have not been published.</p>
            <p className="future-note">The map intentionally shows no proposed assignment until official boundaries are available.</p>
          </section>
        ) : active ? (
          <SchoolCard
            school={active}
            area={activeArea}
            selected={Boolean(selected)}
            onZoom={() => activeArea && mapRef.current?.fitArea(activeArea)}
            onClose={() => setSelected(undefined)}
          />
        ) : (
          <div className="empty-card"><span className="pointer-icon">↖</span><p>Enter an address to find its priority area, or select a school point to explore the current system.</p></div>
        )}

        <div className="display-row">
          <label><input type="checkbox" checked={showNeighborhoods} onChange={(event) => setShowNeighborhoods(event.target.checked)} /><span>Show neighborhood boundaries</span></label>
        </div>

        <footer><strong>Important context</strong><p>Current attendance areas provide priority, not a guaranteed assignment. Schools: 2025–26 · Boundaries: 2024–25.</p></footer>
      </aside>

      <section className="map-panel">
        <SchoolMap
          ref={mapRef}
          data={data}
          activeCode={active?.properties.cds_code}
          showNeighborhoods={showNeighborhoods}
          onlyWithAreas={false}
          onHover={handleHover}
          onSelect={handleSelect}
        />
        <button className="reset-button" onClick={() => mapRef.current?.reset()}>Reset map</button>
        <div className={`map-mode-badge ${mode}`}>
          <span>{mode === 'current' ? 'Current system' : 'Planned 2028–29'}</span>
          <strong>{mode === 'current' ? 'Attendance-area priority' : 'Future boundaries pending'}</strong>
        </div>
        <div className="map-instruction">Click a school to explore its current attendance area</div>
      </section>
    </main>
  );
}
