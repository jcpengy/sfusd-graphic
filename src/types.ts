import type { Feature, FeatureCollection, MultiPolygon, Point } from 'geojson';

export interface SchoolProperties {
  name: string;
  cds_code: string;
  grade_low: string;
  grade_high: string;
  address: string;
  city: string;
  attendance_area_name: string | null;
  has_attendance_area_name_match: boolean;
  data_vintage: string;
}

export interface AttendanceAreaProperties {
  school_cds_code: string;
  vintage: string;
}

export interface NeighborhoodProperties {
  name: string;
}

export type School = Feature<Point, SchoolProperties>;
export type AttendanceArea = Feature<MultiPolygon, AttendanceAreaProperties>;
export type Neighborhood = Feature<MultiPolygon, NeighborhoodProperties>;

export interface MapData {
  schools: FeatureCollection<Point, SchoolProperties>;
  areas: FeatureCollection<MultiPolygon, AttendanceAreaProperties>;
  neighborhoods: FeatureCollection<MultiPolygon, NeighborhoodProperties>;
}
