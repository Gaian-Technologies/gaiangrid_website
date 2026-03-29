(function () {
    const mount = document.querySelector("[data-grid-scene]");
    if (!mount) {
        return;
    }

    const SVG_NS = "http://www.w3.org/2000/svg";
    const NODE_STYLES = {
        consumer: {
            className: "grid-node-consumer",
            label: "Load",
        },
        generator: {
            className: "grid-node-generator",
            label: "Source",
        },
        main: {
            className: "grid-node-main",
            label: "Hub",
        },
    };

    fetch("/assets/grid-scene.json", { cache: "no-store" })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Scene request failed: ${response.status}`);
            }
            return response.json();
        })
        .then((scene) => {
            renderScene(mount, scene);
            mount.classList.add("is-ready");
        })
        .catch((error) => {
            console.error("Failed to render grid scene.", error);
        });

    function renderScene(container, scene) {
        const svg = createSvg(scene);
        const backdrop = appendSvgNode(svg, "g", { class: "grid-backdrop" });
        appendSvgNode(backdrop, "rect", {
            x: "8",
            y: "8",
            width: String(scene.viewWidth - 16),
            height: String(scene.viewHeight - 16),
            rx: "28",
            class: "grid-panel",
        });

        const connectors = appendSvgNode(svg, "g", { class: "grid-connectors" });
        scene.connectorPaths.forEach((pathSpec) => {
            appendSvgNode(connectors, "path", {
                d: pathSpec.d,
                class: "grid-connector",
            });
        });

        const signals = appendSvgNode(svg, "g", { class: "grid-signals" });
        scene.signalSources.forEach((source, sourceIndex) => {
            source.routes.forEach((route, routeIndex) => {
                const routePath = appendSvgNode(signals, "path", {
                    d: route.d,
                    class: `grid-signal ${signalClassForSource(source.sourceType)}`,
                });
                routePath.style.animationDelay = `${(sourceIndex * 0.55) + (routeIndex * 0.3)}s`;
            });
        });

        const nodes = appendSvgNode(svg, "g", { class: "grid-nodes" });
        scene.nodes.forEach((node) => {
            renderNode(nodes, node);
        });

        container.replaceChildren(svg);
    }

    function createSvg(scene) {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${scene.viewWidth} ${scene.viewHeight}`);
        svg.setAttribute("class", "grid-scene-svg");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "Animated household electricity telemetry diagram");
        return svg;
    }

    function renderNode(parent, node) {
        const style = NODE_STYLES[node.type] || NODE_STYLES.consumer;
        const group = appendSvgNode(parent, "g", {
            class: `grid-node ${style.className}`,
            transform: `translate(${node.x}, ${node.y})`,
        });

        appendSvgNode(group, "rect", {
            x: "0",
            y: "0",
            width: "40",
            height: "40",
            rx: "12",
            class: "grid-node-box",
        });

        appendSvgNode(group, "text", {
            x: "20",
            y: "18",
            "text-anchor": "middle",
            class: "grid-node-id",
        }).textContent = node.id;

        appendSvgNode(group, "text", {
            x: "20",
            y: "31",
            "text-anchor": "middle",
            class: "grid-node-type",
        }).textContent = style.label;
    }

    function appendSvgNode(parent, tagName, attributes) {
        const node = document.createElementNS(SVG_NS, tagName);
        Object.entries(attributes).forEach(([key, value]) => {
            node.setAttribute(key, value);
        });
        parent.appendChild(node);
        return node;
    }

    function signalClassForSource(sourceType) {
        if (sourceType === "main") {
            return "grid-signal-main";
        }
        if (sourceType === "generator") {
            return "grid-signal-generator";
        }
        return "grid-signal-default";
    }
})();
