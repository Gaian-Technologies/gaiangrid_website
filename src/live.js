const API_BASE =
    window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
        ? "http://127.0.0.1:8200"
        : "";

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 540;
const MAP_PAD_X = 18;
const MAP_PAD_Y = 22;

const summaryTargets = {
    enrolled: document.getElementById("kpi-enrolled"),
    sites: document.getElementById("kpi-sites"),
    countries: document.getElementById("kpi-countries"),
    importWatts: document.getElementById("kpi-import"),
    exportWatts: document.getElementById("kpi-export"),
    voltage: document.getElementById("kpi-voltage"),
    frequency: document.getElementById("kpi-frequency"),
};

const detailTitle = document.getElementById("detail-title");
const detailSummary = document.getElementById("detail-summary");
const detailStats = document.getElementById("detail-stats");
const detailRegionNote = document.getElementById("detail-region-note");
const regionList = document.getElementById("region-list");
const mapSvg = document.getElementById("live-map");

Promise.all([
    fetch(`${API_BASE}/api/public/live`).then((response) => {
        if (!response.ok) {
            throw new Error("Could not load the live analytics payload.");
        }
        return response.json();
    }),
    fetch("/assets/world-countries.geojson").then((response) => {
        if (!response.ok) {
            throw new Error("Could not load the world map asset.");
        }
        return response.json();
    }),
]).then(([dashboard, worldGeoJson]) => {
    renderSummary(dashboard);
    renderMap(dashboard, worldGeoJson);
}).catch((error) => {
    detailTitle.textContent = "Live data unavailable";
    detailSummary.textContent = error.message;
    detailStats.innerHTML = "";
    regionList.innerHTML = "";
});

function renderSummary(dashboard) {
    const { summary } = dashboard;
    summaryTargets.enrolled.textContent = formatInteger(summary.enrolled_people);
    summaryTargets.sites.textContent = formatInteger(summary.connected_sites);
    summaryTargets.countries.textContent = formatInteger(summary.countries);
    summaryTargets.importWatts.textContent = formatPower(summary.current_import_watts);
    summaryTargets.exportWatts.textContent = formatPower(summary.current_export_watts);
    summaryTargets.voltage.textContent = formatMetric(summary.average_voltage_volts, "V");
    summaryTargets.frequency.textContent = formatMetric(summary.average_frequency_hz, "Hz");
}

function renderMap(dashboard, geoJson) {
    const involvedCountries = dashboard.countries.filter(isMappableCountry);
    const countriesByCode = new Map(
        involvedCountries.map((country) => [country.country_code, country]),
    );

    mapSvg.innerHTML = "";

    for (const feature of geoJson.features) {
        const properties = feature.properties || {};
        const isoCode = String(
            properties.ISO_A2_EH || properties.ISO_A2 || "",
        ).trim().toUpperCase();
        const name = String(properties.NAME || properties.ADMIN || "Unknown").trim();
        const country = countriesByCode.get(isoCode);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", country ? "map-country is-involved is-selectable" : "map-country is-selectable");
        path.setAttribute("d", geometryToPath(feature.geometry));
        path.setAttribute("data-country-code", isoCode);
        path.setAttribute("data-country-name", name);
        if (country) {
            path.setAttribute("fill", "#005900");
        }

        path.addEventListener("click", () => {
            renderCountryDetail(country, name);
            highlightSelection(isoCode);
        });
        mapSvg.appendChild(path);
    }

    if (involvedCountries.length > 0) {
        renderInitialDetail(involvedCountries);
        return;
    }

    renderUnmappedDetail(dashboard);
}

function renderCountryDetail(country, fallbackName) {
    if (!country) {
        detailTitle.textContent = fallbackName;
        detailSummary.textContent = `No enrolled people or data-connected sites are currently available for ${fallbackName}.`;
        detailStats.innerHTML = "";
        detailRegionNote.textContent = "Region summaries will appear once enrolled participants connect sites and location resolution succeeds.";
        regionList.innerHTML = '<p class="empty-state">No region summaries yet.</p>';
        return;
    }

    detailTitle.textContent = country.country_name;
    if (country.connected_sites > 0) {
        detailSummary.textContent = `${formatInteger(country.enrolled_people)} enrolled ${country.enrolled_people === 1 ? "person is" : "people are"} currently represented in ${country.country_name}, and ${formatInteger(country.connected_sites)} connected site${country.connected_sites === 1 ? "" : "s"} are contributing live public rollups.`;
    } else {
        detailSummary.textContent = `${formatInteger(country.enrolled_people)} enrolled ${country.enrolled_people === 1 ? "person is" : "people are"} currently represented in ${country.country_name}, but no Home Assistant sites are connected there yet.`;
    }

    const statCards = [
        `
        <div class="detail-stat">
            <span>People enrolled</span>
            <strong>${formatInteger(country.enrolled_people)}</strong>
        </div>
        `,
        `
        <div class="detail-stat">
            <span>Connected sites</span>
            <strong>${formatInteger(country.connected_sites)}</strong>
        </div>
        `,
    ];

    if (country.connected_sites > 0) {
        statCards.push(
            `
            <div class="detail-stat">
                <span>Live import</span>
                <strong>${formatPower(country.current_import_watts)}</strong>
            </div>
            `,
            `
            <div class="detail-stat">
                <span>Live export</span>
                <strong>${formatPower(country.current_export_watts)}</strong>
            </div>
            `,
            `
            <div class="detail-stat">
                <span>Average voltage</span>
                <strong>${formatMetric(country.average_voltage_volts, "V")}</strong>
            </div>
            `,
            `
            <div class="detail-stat">
                <span>Average frequency</span>
                <strong>${formatMetric(country.average_frequency_hz, "Hz")}</strong>
            </div>
            `,
        );
    }
    detailStats.innerHTML = statCards.join("");

    if (country.connected_sites === 0) {
        detailRegionNote.textContent = "Region summaries will appear once connected sites start publishing live data for this country.";
    } else if (country.unresolved_region_sites > 0) {
        detailRegionNote.textContent = `${formatInteger(country.unresolved_region_sites)} connected site${country.unresolved_region_sites === 1 ? "" : "s"} could not yet be resolved below country level.`;
    } else {
        detailRegionNote.textContent = "All currently connected sites for this country have a resolved regional summary.";
    }

    if (!country.regions.length) {
        regionList.innerHTML = '<p class="empty-state">No region-level summaries are available for this country yet.</p>';
        return;
    }

    regionList.innerHTML = country.regions.map((region) => `
        <article class="region-card">
            <div class="region-card-head">
                <h4>${escapeHtml(region.region_label)}</h4>
                <span>${formatInteger(region.connected_sites)} site${region.connected_sites === 1 ? "" : "s"}</span>
            </div>
            <div class="region-card-grid">
                <div><span>Import</span><strong>${formatPower(region.current_import_watts)}</strong></div>
                <div><span>Export</span><strong>${formatPower(region.current_export_watts)}</strong></div>
                <div><span>Voltage</span><strong>${formatMetric(region.average_voltage_volts, "V")}</strong></div>
                <div><span>Frequency</span><strong>${formatMetric(region.average_frequency_hz, "Hz")}</strong></div>
            </div>
        </article>
    `).join("");
}

function geometryToPath(geometry) {
    if (!geometry) {
        return "";
    }
    if (geometry.type === "Polygon") {
        return polygonToPath(geometry.coordinates);
    }
    if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.map((polygon) => polygonToPath(polygon)).join(" ");
    }
    return "";
}

function polygonToPath(rings) {
    return rings.map((ring) => {
        if (!Array.isArray(ring) || !ring.length) {
            return "";
        }
        const commands = ring.map((coordinate, index) => {
            const [lon, lat] = coordinate;
            const [x, y] = projectPoint(lon, lat);
            return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        });
        return `${commands.join(" ")} Z`;
    }).join(" ");
}

function projectPoint(lon, lat) {
    const usableWidth = MAP_WIDTH - MAP_PAD_X * 2;
    const usableHeight = MAP_HEIGHT - MAP_PAD_Y * 2;
    const x = ((lon + 180) / 360) * usableWidth + MAP_PAD_X;
    const y = ((90 - lat) / 180) * usableHeight + MAP_PAD_Y;
    return [x, y];
}

function interpolateGreen(intensity) {
    const value = clamp(intensity, 0, 1);
    const start = [227, 239, 229];
    const end = [0, 89, 0];
    const rgb = start.map((channel, index) => {
        return Math.round(channel + (end[index] - channel) * value);
    });
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function highlightSelection(countryCode) {
    for (const path of mapSvg.querySelectorAll(".map-country")) {
        path.classList.toggle(
            "is-selected",
            path.getAttribute("data-country-code") === countryCode,
        );
    }
}

function renderUnmappedDetail(dashboard) {
    const unresolvedSites = dashboard.summary.unmapped_country_sites || 0;

    detailTitle.textContent = "Location metadata pending";
    if (unresolvedSites > 0) {
        detailSummary.textContent = `${formatInteger(unresolvedSites)} connected site${unresolvedSites === 1 ? "" : "s"} are publishing live data but cannot yet be placed on the public country map because country metadata is missing or unresolved.`;
        detailRegionNote.textContent = "Country and region summaries will appear once connected sites include resolvable location metadata.";
    } else {
        detailSummary.textContent = "No data-connected sites are currently available for the public country map.";
        detailRegionNote.textContent = "Country and region summaries will appear once connected sites exist and location resolution succeeds.";
    }
    detailStats.innerHTML = "";
    regionList.innerHTML = '<p class="empty-state">No country-level summaries are available yet.</p>';
}

function renderInitialDetail(activeCountries) {
    detailTitle.textContent = "Select a country";
    detailSummary.textContent = "Click any green country on the map to inspect its enrolled participants and live public rollup. Countries without connected sites will show that no live data is available yet.";
    detailStats.innerHTML = "";
    if (activeCountries.length === 1) {
        detailRegionNote.textContent = `${activeCountries[0].country_name} currently has enrolled participants in the public rollout.`;
    } else {
        detailRegionNote.textContent = `${formatInteger(activeCountries.length)} countries currently have enrolled participants in the public rollout.`;
    }
    regionList.innerHTML = '<p class="empty-state">Select a country to view region summaries and rollout detail.</p>';
}

function isMappableCountry(country) {
    return Boolean(country && country.country_code && country.country_code !== "ZZ");
}

function formatPower(watts) {
    if (typeof watts !== "number") {
        return "-";
    }
    const absolute = Math.abs(watts);
    if (absolute >= 1000) {
        return `${(watts / 1000).toFixed(2)} kW`;
    }
    return `${watts.toFixed(0)} W`;
}

function formatMetric(value, unit) {
    if (typeof value !== "number") {
        return "-";
    }
    if (unit === "Hz") {
        return `${value.toFixed(2)} ${unit}`;
    }
    return `${value.toFixed(1)} ${unit}`;
}

function formatInteger(value) {
    if (typeof value !== "number") {
        return "-";
    }
    return new Intl.NumberFormat().format(value);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
