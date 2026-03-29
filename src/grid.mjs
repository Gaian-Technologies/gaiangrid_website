const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_SCENE_URL = "/assets/grid-scene.json";
const NODE_SIZE = 40;
const CONNECTOR_STROKE_WIDTH = 2;
const SIGNAL_INTERVAL_MS = 500;
const SIGNAL_RADIUS = 6;
const SIGNAL_TRAVEL_MIN_MS = 3000;
const SIGNAL_TRAVEL_MAX_MS = 3100;
const MAX_ACTIVE_SIGNALS = 3;

const HOME_ASSISTANT_ICON = Object.freeze({
    viewBoxSize: 240,
    layers: Object.freeze([
        Object.freeze({
            d: "M240 224.762C240 233.012 233.25 239.762 225 239.762H15C6.75 239.762 0 233.012 0 224.762V134.762C0 126.512 4.77 114.993 10.61 109.153L109.39 10.3725C115.22 4.5425 124.77 4.5425 130.6 10.3725L229.39 109.162C235.22 114.992 240 126.522 240 134.772V224.772V224.762Z",
            fill: "#F2F4F9",
        }),
        Object.freeze({
            d: "M229.39 109.153L130.61 10.3725C124.78 4.5425 115.23 4.5425 109.4 10.3725L10.61 109.153C4.78 114.983 0 126.512 0 134.762V224.762C0 233.012 6.75 239.762 15 239.762H107.27L66.64 199.132C64.55 199.852 62.32 200.262 60 200.262C48.7 200.262 39.5 191.062 39.5 179.762C39.5 168.462 48.7 159.262 60 159.262C71.3 159.262 80.5 168.462 80.5 179.762C80.5 182.092 80.09 184.322 79.37 186.412L111 218.042V102.162C104.2 98.8225 99.5 91.8425 99.5 83.7725C99.5 72.4725 108.7 63.2725 120 63.2725C131.3 63.2725 140.5 72.4725 140.5 83.7725C140.5 91.8425 135.8 98.8225 129 102.162V183.432L160.46 151.972C159.84 150.012 159.5 147.932 159.5 145.772C159.5 134.472 168.7 125.272 180 125.272C191.3 125.272 200.5 134.472 200.5 145.772C200.5 157.072 191.3 166.272 180 166.272C177.5 166.272 175.12 165.802 172.91 164.982L129 208.892V239.772H225C233.25 239.772 240 233.022 240 224.772V134.772C240 126.522 235.23 115.002 229.39 109.162V109.153Z",
        }),
    ]),
});

const POWER_ICON = Object.freeze({
    viewBoxSize: 24,
    layers: Object.freeze([
        Object.freeze({
            d: "M8.28,5.45L6.5,4.55L7.76,2H16.23L17.5,4.55L15.72,5.44L15,4H9L8.28,5.45M18.62,8H14.09L13.3,5H10.7L9.91,8H5.38L4.1,10.55L5.89,11.44L6.62,10H17.38L18.1,11.45L19.89,10.56L18.62,8M17.77,22H15.7L15.46,21.1L12,15.9L8.53,21.1L8.3,22H6.23L9.12,11H11.19L10.83,12.35L12,14.1L13.16,12.35L12.81,11H14.88L17.77,22M11.4,15L10.5,13.65L9.32,18.13L11.4,15M14.68,18.12L13.5,13.64L12.6,15L14.68,18.12Z",
        }),
    ]),
});

const NODE_TYPE_CONFIG = Object.freeze({
    consumer: Object.freeze({
        className: "grid-control__node--consumer",
        signalClass: null,
        icon: HOME_ASSISTANT_ICON,
    }),
    generator: Object.freeze({
        className: "grid-control__node--generator",
        signalClass: "grid-control__signal-dot--generator",
        icon: HOME_ASSISTANT_ICON,
    }),
    main: Object.freeze({
        className: "grid-control__node--main",
        signalClass: "grid-control__signal-dot--main",
        icon: POWER_ICON,
    }),
});

export async function mountGrid(root, options = {}) {
    if (!(root instanceof Element)) {
        throw new TypeError("mountGrid(root) requires a DOM element.");
    }

    const sceneUrl = options.sceneUrl ?? DEFAULT_SCENE_URL;
    const animate = options.animate ?? true;
    const controller = createController(root);

    root.__gridControl?.destroy?.();
    root.__gridControl = controller;
    root.classList.add("grid-control");
    root.replaceChildren(controller.svg);

    try {
        const scene = await loadScene(sceneUrl);

        validateScene(scene);
        renderScene(controller.svg, scene);
        controller.scene = scene;

        if (animate) {
            controller.stopSignals = startSignalTraffic(controller.svg, scene);
        }
    } catch (error) {
        renderErrorState(controller.svg, buildErrorMessage(error));
        console.error(error);
    }

    return controller;
}

function createController(root) {
    const svg = createSvgElement("svg", {
        class: "grid-control__svg",
        version: "1.2",
        role: "img",
        "aria-label": "Animated grid diagram",
    });

    return {
        root,
        svg,
        scene: null,
        stopSignals: () => {},
        destroy() {
            this.stopSignals();

            if (root.__gridControl === this) {
                delete root.__gridControl;
            }

            root.replaceChildren();
        },
    };
}

async function loadScene(sceneUrl) {
    const response = await fetch(sceneUrl, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`Failed to load scene JSON (${response.status}).`);
    }

    return response.json();
}

function validateScene(scene) {
    if (!scene || typeof scene !== "object") {
        throw new Error("Scene JSON is missing.");
    }

    if (scene.schemaVersion !== 1) {
        throw new Error(`Unsupported scene schema version "${scene.schemaVersion}".`);
    }

    if (!Array.isArray(scene.connectorPaths) || !Array.isArray(scene.nodes) || !Array.isArray(scene.signalSources)) {
        throw new Error("Scene JSON is missing required arrays.");
    }
}

function renderScene(svg, scene) {
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${scene.viewWidth} ${scene.viewHeight}`);
    svg.setAttribute("width", String(scene.viewWidth));
    svg.setAttribute("height", String(scene.viewHeight));

    const connectorLayer = createSvgElement("g", {
        class: "grid-control__connector-layer",
        "aria-hidden": "true",
    });
    const nodeLayer = createSvgElement("g", {
        class: "grid-control__node-layer",
        "aria-hidden": "true",
    });

    scene.connectorPaths.forEach((connectorPath) => {
        connectorLayer.append(
            createSvgElement("path", {
                class: "grid-control__connector",
                d: connectorPath.d,
                "stroke-width": String(CONNECTOR_STROKE_WIDTH),
                "data-connector-id": connectorPath.id,
            })
        );
    });

    scene.nodes.forEach((node) => {
        nodeLayer.append(createNodeElement(node));
    });

    svg.append(connectorLayer, nodeLayer);
}

function createNodeElement(node) {
    const typeConfig = getNodeTypeConfig(node.type);
    const group = createSvgElement("g", {
        class: `grid-control__node ${typeConfig.className}`,
        transform: buildNodeTransform(node.x, node.y, typeConfig.icon.viewBoxSize),
        "data-node-id": node.id,
    });

    const title = createSvgElement("title");
    title.textContent = `${node.id} (${node.type})`;
    group.append(title);

    typeConfig.icon.layers.forEach((layer) => {
        group.append(createSvgElement("path", layer));
    });

    return group;
}

function renderErrorState(svg, message) {
    svg.replaceChildren();
    svg.setAttribute("viewBox", "0 0 320 120");
    svg.setAttribute("width", "320");
    svg.setAttribute("height", "120");

    const text = createSvgElement("text", {
        x: "20",
        y: "36",
        class: "grid-control__error",
    });

    message.split("\n").forEach((line, index) => {
        const tspan = createSvgElement("tspan", {
            x: "20",
            dy: index === 0 ? "0" : "1.5em",
        });
        tspan.textContent = line;
        text.append(tspan);
    });

    svg.append(text);
}

function startSignalTraffic(svg, scene) {
    const signalLayer = createSvgElement("g", {
        class: "grid-control__signal-layer",
        "aria-hidden": "true",
    });
    const activeSignals = new Set();

    svg.append(signalLayer);

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !scene.signalSources.length) {
        return () => {
            activeSignals.forEach((cleanup) => cleanup());
            signalLayer.remove();
        };
    }

    const emitSignal = () => {
        if (document.hidden || activeSignals.size >= MAX_ACTIVE_SIGNALS) {
            return;
        }

        const source = pickRandom(scene.signalSources);
        if (!source || !source.routes.length) {
            return;
        }

        spawnSignal(signalLayer, source, pickRandom(source.routes), activeSignals);
    };

    const intervalId = window.setInterval(emitSignal, SIGNAL_INTERVAL_MS);

    return () => {
        window.clearInterval(intervalId);
        activeSignals.forEach((cleanup) => cleanup());
        signalLayer.remove();
    };
}

function spawnSignal(signalLayer, source, route, activeSignals) {
    const signalClass = getNodeTypeConfig(source.sourceType).signalClass;

    if (!signalClass) {
        return;
    }

    const routePath = createSvgElement("path", {
        class: "grid-control__route",
        d: route.d,
    });
    const signal = createSvgElement("circle", {
        class: `grid-control__signal-dot ${signalClass}`,
        r: String(SIGNAL_RADIUS),
    });
    const duration = randomBetween(SIGNAL_TRAVEL_MIN_MS, SIGNAL_TRAVEL_MAX_MS);
    const startTime = performance.now();

    signalLayer.append(routePath, signal);

    const totalLength = routePath.getTotalLength();
    if (totalLength === 0) {
        routePath.remove();
        signal.remove();
        return;
    }

    let frameId = 0;

    const placeSignal = (progress) => {
        const point = routePath.getPointAtLength(totalLength * progress);

        signal.setAttribute("cx", point.x.toFixed(2));
        signal.setAttribute("cy", point.y.toFixed(2));
    };

    const cleanup = () => {
        cancelAnimationFrame(frameId);
        routePath.remove();
        signal.remove();
        activeSignals.delete(cleanup);
    };

    activeSignals.add(cleanup);
    placeSignal(0);

    const tick = (now) => {
        const elapsed = Math.min((now - startTime) / duration, 1);
        placeSignal(elapsed);

        if (elapsed >= 1) {
            cleanup();
            return;
        }

        frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
}

function getNodeTypeConfig(type) {
    const config = NODE_TYPE_CONFIG[type];

    if (!config) {
        throw new Error(`Unsupported node type "${type}".`);
    }

    return config;
}

function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);

    Object.entries(attributes).forEach(([name, value]) => {
        element.setAttribute(name, value);
    });

    return element;
}

function buildNodeTransform(x, y, viewBoxSize) {
    const scale = NODE_SIZE / viewBoxSize;
    return `translate(${x} ${y}) scale(${scale})`;
}

function buildErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return "Failed to render the grid control.";
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}
