const API_BASE = 'https://gaiangrid.com';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 540;
const MAP_PAD_X = 18;
const MAP_PAD_Y = 22;
const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 8;
const ZOOM_STEP = 1.1;

type Summary = {
  enrolled_people?: number;
  connected_sites?: number;
  countries?: number;
  current_import_watts?: number;
  current_export_watts?: number;
  average_voltage_volts?: number;
  average_frequency_hz?: number;
  unmapped_country_sites?: number;
};

type Region = {
  region_label: string;
  connected_sites: number;
  current_import_watts?: number;
  current_export_watts?: number;
  average_voltage_volts?: number;
  average_frequency_hz?: number;
};

type Country = {
  country_code: string;
  country_name: string;
  enrolled_people: number;
  connected_sites: number;
  current_import_watts?: number;
  current_export_watts?: number;
  average_voltage_volts?: number;
  average_frequency_hz?: number;
  unresolved_region_sites?: number;
  regions: Region[];
};

type Dashboard = {
  summary: Summary;
  countries: Country[];
};

type FeatureGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
};

type GeoJsonFeature = {
  properties?: Record<string, unknown>;
  geometry?: FeatureGeometry;
};

type GeoJson = {
  features: GeoJsonFeature[];
};

const summaryTargets = {
  enrolled: document.getElementById('kpi-enrolled'),
  sites: document.getElementById('kpi-sites'),
  countries: document.getElementById('kpi-countries'),
  importWatts: document.getElementById('kpi-import'),
  exportWatts: document.getElementById('kpi-export'),
  voltage: document.getElementById('kpi-voltage'),
  frequency: document.getElementById('kpi-frequency'),
};

const detailTitle = document.getElementById('detail-title');
const detailSummary = document.getElementById('detail-summary');
const detailStats = document.getElementById('detail-stats');
const detailRegionNote = document.getElementById('detail-region-note');
const regionList = document.getElementById('region-list');
const mapSvg = document.getElementById('live-map');

if (
  detailTitle &&
  detailSummary &&
  detailStats &&
  detailRegionNote &&
  regionList &&
  mapSvg instanceof SVGSVGElement
) {
  void Promise.all([
    fetch(`${API_BASE}/api/public/live`).then((response) => {
      if (!response.ok) {
        throw new Error('Could not load the live analytics payload.');
      }
      return response.json() as Promise<Dashboard>;
    }),
    fetch('/assets/world-countries.geojson').then((response) => {
      if (!response.ok) {
        throw new Error('Could not load the world map asset.');
      }
      return response.json() as Promise<GeoJson>;
    }),
  ])
    .then(([dashboard, worldGeoJson]) => {
      setupMapPanZoom(mapSvg);
      renderSummary(dashboard.summary);
      renderMap(dashboard, worldGeoJson, mapSvg);
    })
    .catch((error: unknown) => {
      detailTitle.textContent = 'Live data unavailable';
      detailSummary.textContent =
        error instanceof Error ? error.message : 'Unknown error.';
      detailStats.replaceChildren();
      regionList.replaceChildren();
    });
}

function renderSummary(summary: Summary) {
  setText(summaryTargets.enrolled, formatInteger(summary.enrolled_people));
  setText(summaryTargets.sites, formatInteger(summary.connected_sites));
  setText(summaryTargets.countries, formatInteger(summary.countries));
  setText(
    summaryTargets.importWatts,
    formatPower(summary.current_import_watts)
  );
  setText(
    summaryTargets.exportWatts,
    formatPower(summary.current_export_watts)
  );
  setText(
    summaryTargets.voltage,
    formatMetric(summary.average_voltage_volts, 'V')
  );
  setText(
    summaryTargets.frequency,
    formatMetric(summary.average_frequency_hz, 'Hz')
  );
}

function renderMap(dashboard: Dashboard, geoJson: GeoJson, svg: SVGSVGElement) {
  const involvedCountries = dashboard.countries.filter(isMappableCountry);
  const countriesByCode = new Map(
    involvedCountries.map((country) => [country.country_code, country])
  );

  svg.replaceChildren();

  for (const feature of geoJson.features) {
    const properties = feature.properties ?? {};
    const isoCode = String(properties.ISO_A2_EH ?? properties.ISO_A2 ?? '')
      .trim()
      .toUpperCase();
    const name = String(
      properties.NAME ?? properties.ADMIN ?? 'Unknown'
    ).trim();
    const country = countriesByCode.get(isoCode);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    path.setAttribute(
      'class',
      country
        ? 'map-country is-involved is-selectable'
        : 'map-country is-selectable'
    );
    path.setAttribute('d', geometryToPath(feature.geometry));
    path.setAttribute('data-country-code', isoCode);
    path.setAttribute('data-country-name', name);

    path.addEventListener('click', () => {
      renderCountryDetail(country, name);
      highlightSelection(svg, isoCode);
    });

    svg.appendChild(path);
  }

  if (involvedCountries.length > 0) {
    renderInitialDetail(involvedCountries);
    return;
  }

  renderUnmappedDetail(dashboard);
}

function setupMapPanZoom(svg: SVGSVGElement) {
  let viewBox = {
    x: 0,
    y: 0,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
  };
  let pointerStart: { x: number; y: number } | null = null;
  let viewBoxStart: typeof viewBox | null = null;
  let suppressClick = false;

  const applyViewBox = () => {
    svg.setAttribute(
      'viewBox',
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
    );
  };

  const clampViewBox = () => {
    const maxX = MAP_WIDTH - viewBox.width;
    const maxY = MAP_HEIGHT - viewBox.height;

    viewBox.x = clamp(viewBox.x, 0, Math.max(0, maxX));
    viewBox.y = clamp(viewBox.y, 0, Math.max(0, maxY));
  };

  applyViewBox();

  svg.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();

      const rect = svg.getBoundingClientRect();
      const pointerX = (event.clientX - rect.left) / rect.width;
      const pointerY = (event.clientY - rect.top) / rect.height;
      const zoomIn = event.deltaY < 0;
      const nextScale = zoomIn ? 1 / ZOOM_STEP : ZOOM_STEP;
      const nextWidth = clamp(
        viewBox.width * nextScale,
        MAP_WIDTH / MAX_ZOOM_SCALE,
        MAP_WIDTH / MIN_ZOOM_SCALE
      );
      const nextHeight = (nextWidth / MAP_WIDTH) * MAP_HEIGHT;
      const focusX = viewBox.x + viewBox.width * pointerX;
      const focusY = viewBox.y + viewBox.height * pointerY;

      viewBox = {
        x: focusX - nextWidth * pointerX,
        y: focusY - nextHeight * pointerY,
        width: nextWidth,
        height: nextHeight,
      };

      clampViewBox();
      applyViewBox();
    },
    { passive: false }
  );

  svg.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    viewBoxStart = { ...viewBox };
    suppressClick = false;
    svg.classList.add('is-panning');
  });

  svg.addEventListener('pointermove', (event) => {
    if (!pointerStart || !viewBoxStart) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      suppressClick = true;
    }

    viewBox = {
      ...viewBoxStart,
      x: viewBoxStart.x - (deltaX / rect.width) * viewBoxStart.width,
      y: viewBoxStart.y - (deltaY / rect.height) * viewBoxStart.height,
    };

    clampViewBox();
    applyViewBox();
  });

  const stopPan = () => {
    pointerStart = null;
    viewBoxStart = null;
    svg.classList.remove('is-panning');
  };

  svg.addEventListener('pointerup', stopPan);
  svg.addEventListener('pointercancel', stopPan);
  svg.addEventListener('pointerleave', stopPan);

  svg.addEventListener(
    'click',
    (event) => {
      if (!suppressClick) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    },
    true
  );
}

function renderCountryDetail(
  country: Country | undefined,
  fallbackName: string
) {
  if (
    !detailTitle ||
    !detailSummary ||
    !detailStats ||
    !detailRegionNote ||
    !regionList
  ) {
    return;
  }

  if (!country) {
    detailTitle.textContent = fallbackName;
    detailSummary.textContent = `No registered participants or data-connected sites are currently available for ${fallbackName}.`;
    detailStats.replaceChildren();
    detailRegionNote.textContent =
      'Region summaries will appear once sites are connected and location resolution succeeds.';
    regionList.replaceChildren(createEmptyState('No region summaries yet.'));
    return;
  }

  detailTitle.textContent = country.country_name;

  if (country.connected_sites > 0) {
    detailSummary.textContent = `${formatInteger(country.enrolled_people)} ${country.enrolled_people === 1 ? 'person has' : 'people have'} registered interest in ${country.country_name}, and ${formatInteger(country.connected_sites)} connected site${country.connected_sites === 1 ? '' : 's'} are contributing live aggregated data.`;
  } else {
    detailSummary.textContent = `${formatInteger(country.enrolled_people)} ${country.enrolled_people === 1 ? 'person has' : 'people have'} registered interest in ${country.country_name}, but no Home Assistant sites are connected there yet.`;
  }

  const statCards = [
    createDetailStat(
      'People registered',
      formatInteger(country.enrolled_people)
    ),
    createDetailStat('Connected sites', formatInteger(country.connected_sites)),
  ];

  if (country.connected_sites > 0) {
    statCards.push(
      createDetailStat(
        'Live import',
        formatPower(country.current_import_watts)
      ),
      createDetailStat(
        'Live export',
        formatPower(country.current_export_watts)
      ),
      createDetailStat(
        'Average voltage',
        formatMetric(country.average_voltage_volts, 'V')
      ),
      createDetailStat(
        'Average frequency',
        formatMetric(country.average_frequency_hz, 'Hz')
      )
    );
  }

  detailStats.replaceChildren(...statCards);

  if (country.connected_sites === 0) {
    detailRegionNote.textContent =
      'Region summaries will appear once connected sites start publishing live data for this country.';
  } else if ((country.unresolved_region_sites ?? 0) > 0) {
    detailRegionNote.textContent = `${formatInteger(country.unresolved_region_sites)} connected site${country.unresolved_region_sites === 1 ? '' : 's'} could not yet be resolved below country level.`;
  } else {
    detailRegionNote.textContent =
      'All currently connected sites for this country have a resolved regional summary.';
  }

  if (!country.regions.length) {
    regionList.replaceChildren(
      createEmptyState(
        'No region-level summaries are available for this country yet.'
      )
    );
    return;
  }

  regionList.replaceChildren(...country.regions.map(createRegionCard));
}

function createDetailStat(label: string, value: string) {
  const wrapper = document.createElement('div');
  wrapper.className = 'live-detail-stat';

  const span = document.createElement('span');
  span.textContent = label;

  const strong = document.createElement('strong');
  strong.textContent = value;

  wrapper.append(span, strong);
  return wrapper;
}

function createRegionCard(region: Region) {
  const article = document.createElement('article');
  article.className = 'live-region-card';

  const head = document.createElement('div');
  head.className = 'live-region-card-head';

  const title = document.createElement('h4');
  title.textContent = region.region_label;

  const sites = document.createElement('span');
  sites.textContent = `${formatInteger(region.connected_sites)} connected site${region.connected_sites === 1 ? '' : 's'}`;

  head.append(title, sites);

  const grid = document.createElement('div');
  grid.className = 'live-region-card-grid';

  grid.append(
    createRegionMetric(
      'Total import',
      formatPower(region.current_import_watts)
    ),
    createRegionMetric(
      'Total export',
      formatPower(region.current_export_watts)
    ),
    createRegionMetric(
      'Average voltage',
      formatMetric(region.average_voltage_volts, 'V')
    ),
    createRegionMetric(
      'Average frequency',
      formatMetric(region.average_frequency_hz, 'Hz')
    )
  );

  article.append(head, grid);
  return article;
}

function createRegionMetric(label: string, value: string) {
  const wrapper = document.createElement('div');

  const span = document.createElement('span');
  span.textContent = label;

  const strong = document.createElement('strong');
  strong.textContent = value;

  wrapper.append(span, strong);
  return wrapper;
}

function createEmptyState(text: string) {
  const paragraph = document.createElement('p');
  paragraph.className = 'live-empty-state';
  paragraph.textContent = text;
  return paragraph;
}

function geometryToPath(geometry?: FeatureGeometry) {
  if (!geometry) {
    return '';
  }

  if (geometry.type === 'Polygon') {
    return polygonToPath(geometry.coordinates as number[][][]);
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][])
      .map((polygon) => polygonToPath(polygon))
      .join(' ');
  }

  return '';
}

function polygonToPath(rings: number[][][]) {
  return rings
    .map((ring) => {
      if (!Array.isArray(ring) || !ring.length) {
        return '';
      }

      const commands = ring.map((coordinate, index) => {
        const [lon, lat] = coordinate;
        const [x, y] = projectPoint(lon, lat);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      });

      return `${commands.join(' ')} Z`;
    })
    .join(' ');
}

function projectPoint(lon: number, lat: number) {
  const usableWidth = MAP_WIDTH - MAP_PAD_X * 2;
  const usableHeight = MAP_HEIGHT - MAP_PAD_Y * 2;
  const x = ((lon + 180) / 360) * usableWidth + MAP_PAD_X;
  const y = ((90 - lat) / 180) * usableHeight + MAP_PAD_Y;
  return [x, y];
}

function highlightSelection(svg: SVGSVGElement, countryCode: string) {
  for (const path of svg.querySelectorAll('.map-country')) {
    path.classList.toggle(
      'is-selected',
      path.getAttribute('data-country-code') === countryCode
    );
  }
}

function renderUnmappedDetail(dashboard: Dashboard) {
  if (
    !detailTitle ||
    !detailSummary ||
    !detailStats ||
    !detailRegionNote ||
    !regionList
  ) {
    return;
  }

  const unresolvedSites = dashboard.summary.unmapped_country_sites ?? 0;

  detailTitle.textContent = 'Location metadata pending';

  if (unresolvedSites > 0) {
    detailSummary.textContent = `${formatInteger(unresolvedSites)} connected site${unresolvedSites === 1 ? '' : 's'} are publishing live data but cannot yet be placed on the public country map because country metadata is missing or unresolved.`;
    detailRegionNote.textContent =
      'Country and region summaries will appear once connected sites include resolvable location metadata.';
  } else {
    detailSummary.textContent =
      'No data-connected sites are currently available for the public country map.';
    detailRegionNote.textContent =
      'Country and region summaries will appear once connected sites exist and location resolution succeeds.';
  }

  detailStats.replaceChildren();
  regionList.replaceChildren(
    createEmptyState('No country-level summaries are available yet.')
  );
}

function renderInitialDetail(activeCountries: Country[]) {
  if (
    !detailTitle ||
    !detailSummary ||
    !detailStats ||
    !detailRegionNote ||
    !regionList
  ) {
    return;
  }

  detailTitle.textContent = 'Select a country';
  detailSummary.textContent =
    'Click any green country on the map to inspect community participation and live aggregated data. Countries without connected sites will show that no live data is available yet.';
  detailStats.replaceChildren();

  if (activeCountries.length === 1) {
    detailRegionNote.textContent = `${activeCountries[0].country_name} currently has registered participants in the public view.`;
  } else {
    detailRegionNote.textContent = `${formatInteger(activeCountries.length)} countries currently have registered participants in the public view.`;
  }

  regionList.replaceChildren(
    createEmptyState(
      'Select a country to view region summaries and rollout detail.'
    )
  );
}

function isMappableCountry(country: Country) {
  return Boolean(country.country_code && country.country_code !== 'ZZ');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function setText(node: HTMLElement | null, value: string) {
  if (node) {
    node.textContent = value;
  }
}

function formatPower(watts?: number) {
  if (typeof watts !== 'number') {
    return '-';
  }

  const absolute = Math.abs(watts);
  if (absolute >= 1000) {
    return `${(watts / 1000).toFixed(2)} kW`;
  }

  return `${watts.toFixed(0)} W`;
}

function formatMetric(value: number | undefined, unit: string) {
  if (typeof value !== 'number') {
    return '-';
  }

  if (unit === 'Hz') {
    return `${value.toFixed(2)} ${unit}`;
  }

  return `${value.toFixed(1)} ${unit}`;
}

function formatInteger(value?: number) {
  if (typeof value !== 'number') {
    return '-';
  }

  return new Intl.NumberFormat().format(value);
}
