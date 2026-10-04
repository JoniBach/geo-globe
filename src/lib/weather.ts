// Weather for a place, today, hour by hour: Open-Meteo's forecast API (free, no key, CORS open).
// Also gives the place's time zone, so the clock and the time-of-day slider read in local time.
import type { LonLat } from './geo';

export const WEATHER_ATTRIBUTION = 'Weather data by Open-Meteo.com (CC BY 4.0)';

export interface WeatherSample {
	/** epoch seconds (the start of the hour) */
	t: number;
	temp: number;
	/** mm in that hour */
	precip: number;
	/** % */
	cloud: number;
	/** mph */
	wind: number;
	/** degrees the wind blows FROM, clockwise from north */
	windDir: number;
	/** WMO weather code */
	code: number;
	isDay: number;
}

export interface Weather {
	/** seconds to add to UTC for the place's local time */
	utcOffset: number;
	timeZone: string;
	/** local midnight at the start of today (epoch seconds) */
	dayStart: number;
	samples: WeatherSample[];
}

export async function weatherFor({ lon, lat }: LonLat): Promise<Weather | null> {
	const fields = 'temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code,is_day';
	const url =
		`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
		`&hourly=${fields}&forecast_days=1&timezone=auto&wind_speed_unit=mph&timeformat=unixtime`;
	try {
		const r = await fetch(url);
		if (!r.ok) return null;
		const j = await r.json();
		const h = j.hourly;
		const samples: WeatherSample[] = h.time.map((t: number, i: number) => ({
			t,
			temp: h.temperature_2m[i],
			precip: h.precipitation[i] ?? 0,
			cloud: h.cloud_cover[i] ?? 0,
			wind: h.wind_speed_10m[i] ?? 0,
			windDir: h.wind_direction_10m[i] ?? 0,
			code: h.weather_code[i] ?? 0,
			isDay: h.is_day[i] ?? 1
		}));
		return { utcOffset: j.utc_offset_seconds ?? 0, timeZone: j.timezone ?? 'UTC', dayStart: samples[0]?.t ?? 0, samples };
	} catch {
		return null; // offline, or the API is down: the globe works without weather
	}
}

/** The weather at a moment: the hour it falls in, with temperature and wind eased into the next. */
export function weatherAt(w: Weather | null, t: number): WeatherSample | null {
	if (!w?.samples.length) return null;
	const s = w.samples;
	let k = 0;
	while (k < s.length - 1 && s[k + 1].t <= t) k++;
	const a = s[k];
	const b = s[Math.min(k + 1, s.length - 1)];
	const f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
	return { ...a, temp: a.temp + (b.temp - a.temp) * f, wind: a.wind + (b.wind - a.wind) * f };
}

/** WMO weather code -> icon + words (https://open-meteo.com/en/docs, "WMO Weather interpretation codes"). */
export function weatherLabel(code: number, isDay = 1): { icon: string; label: string } {
	if (code === 0) return { icon: isDay ? '☀️' : '🌙', label: 'Clear' };
	if (code <= 2) return { icon: isDay ? '🌤️' : '☁️', label: code === 1 ? 'Mainly clear' : 'Partly cloudy' };
	if (code === 3) return { icon: '☁️', label: 'Overcast' };
	if (code <= 48) return { icon: '🌫️', label: 'Fog' };
	if (code <= 57) return { icon: '🌦️', label: 'Drizzle' };
	if (code <= 67) return { icon: '🌧️', label: 'Rain' };
	if (code <= 77) return { icon: '🌨️', label: 'Snow' };
	if (code <= 82) return { icon: '🌧️', label: 'Showers' };
	if (code <= 86) return { icon: '🌨️', label: 'Snow showers' };
	return { icon: '⛈️', label: 'Thunderstorm' };
}
