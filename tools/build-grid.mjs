import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE_PATH = resolve(ROOT_DIR, "tools/grid.txt");
const OUTPUT_PATH = resolve(ROOT_DIR, "src/assets/grid-scene.json");

const CELL_WIDTH = 20;
const CELL_HEIGHT = CELL_WIDTH * 2;
const SCENE_PADDING = 20;
const NODE_SIZE = 40;

const NODE_TYPE_RULES = {
    consumer: {
        emits: false,
        allowedDestinationTypes: [],
    },
    generator: {
        emits: true,
        allowedDestinationTypes: ["consumer", "main"],
    },
    main: {
        emits: true,
        allowedDestinationTypes: ["consumer"],
    },
};

const NODE_TYPES = new Set(Object.keys(NODE_TYPE_RULES));
const DIRECTIONS = ["north", "east", "south", "west"];
const OFFSETS = {
    north: { row: -1, col: 0, opposite: "south" },
    east: { row: 0, col: 1, opposite: "west" },
    south: { row: 1, col: 0, opposite: "north" },
    west: { row: 0, col: -1, opposite: "east" },
};

const CONNECTOR_CLASSES = {
    "-": ["west", "east"],
    "|": ["north", "south"],
};

class DiagramParseError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "DiagramParseError";
        this.section = details.section ?? null;
        this.lineNumber = details.lineNumber ?? null;
        this.lineText = details.lineText ?? "";
        this.column = details.column ?? null;
    }
}

async function main() {
    const source = await readFile(SOURCE_PATH, "utf8");
    const diagram = parseDiagram(source);
    const scene = buildSceneArtifact(diagram);

    await writeFile(OUTPUT_PATH, `${JSON.stringify(scene, null, 2)}\n`);
    console.log(`Wrote ${OUTPUT_PATH}`);
}

function parseDiagram(source) {
    const sections = parseSections(source);
    const gridData = parseGridSection(sections.grid);
    const legendEntries = parseLegendSection(sections.legend);
    const connectorTiles = validateConnectorTopology(gridData);
    const nodes = buildNodes(gridData, legendEntries);

    return {
        width: gridData.width,
        height: gridData.height,
        rows: gridData.rows,
        nodes,
        connectorTiles,
    };
}

function buildSceneArtifact(diagramModel) {
    const graph = buildGraph(diagramModel);

    return {
        schemaVersion: 1,
        viewWidth: diagramModel.width * CELL_WIDTH + SCENE_PADDING * 2,
        viewHeight: diagramModel.height * CELL_HEIGHT + SCENE_PADDING * 2,
        connectorPaths: buildConnectorPaths(graph).map((points, index) => ({
            id: `connector-${index}`,
            d: buildPathData(points),
        })),
        nodes: diagramModel.nodes.map((node) => {
            const [centerX, centerY] = getCellCenter(node.row, node.col);

            return {
                id: node.id,
                type: node.type,
                x: centerX - NODE_SIZE / 2,
                y: centerY - NODE_SIZE / 2,
            };
        }),
        signalSources: buildSignalSources(graph),
    };
}

function parseSections(source) {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    const sections = { grid: [], legend: [] };
    let currentSection = null;
    let sawGrid = false;
    let sawLegend = false;

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        const lineNumber = index + 1;

        if (trimmed === "[grid]") {
            if (sawGrid) {
                throw new DiagramParseError("Duplicate [grid] section.", {
                    section: "grid",
                    lineNumber,
                    lineText: line,
                });
            }

            if (sawLegend) {
                throw new DiagramParseError("[grid] must appear before [legend].", {
                    section: "grid",
                    lineNumber,
                    lineText: line,
                });
            }

            currentSection = "grid";
            sawGrid = true;
            return;
        }

        if (trimmed === "[legend]") {
            if (!sawGrid) {
                throw new DiagramParseError("[legend] cannot appear before [grid].", {
                    section: "legend",
                    lineNumber,
                    lineText: line,
                });
            }

            if (sawLegend) {
                throw new DiagramParseError("Duplicate [legend] section.", {
                    section: "legend",
                    lineNumber,
                    lineText: line,
                });
            }

            currentSection = "legend";
            sawLegend = true;
            return;
        }

        if (!currentSection) {
            if (trimmed !== "") {
                throw new DiagramParseError("Unexpected content before a section header.", {
                    lineNumber,
                    lineText: line,
                });
            }

            return;
        }

        sections[currentSection].push({ lineNumber, text: line });
    });

    if (!sawGrid) {
        throw new DiagramParseError("Missing required [grid] section.", {
            section: "grid",
        });
    }

    if (!sawLegend) {
        throw new DiagramParseError("Missing required [legend] section.", {
            section: "legend",
        });
    }

    return sections;
}

function parseGridSection(lines) {
    const rows = trimEmptyBoundaryLines(lines);

    if (!rows.length) {
        throw new DiagramParseError("[grid] must contain at least one row.", {
            section: "grid",
        });
    }

    let width = 0;
    let occupiedCells = 0;

    rows.forEach(({ lineNumber, text }) => {
        width = Math.max(width, text.length);

        Array.from(text).forEach((character, index) => {
            if (!isAllowedGridCharacter(character)) {
                throw new DiagramParseError(
                    `Unsupported grid character "${character}" at column ${index + 1}.`,
                    {
                        section: "grid",
                        lineNumber,
                        lineText: text,
                        column: index + 1,
                    }
                );
            }

            if (character !== " ") {
                occupiedCells += 1;
            }
        });
    });

    if (!occupiedCells) {
        throw new DiagramParseError("[grid] must contain at least one non-space tile.", {
            section: "grid",
            lineNumber: rows[0].lineNumber,
            lineText: rows[0].text,
        });
    }

    return {
        width,
        height: rows.length,
        rows: rows.map(({ lineNumber, text }) => ({
            lineNumber,
            text: text.padEnd(width, " "),
        })),
    };
}

function parseLegendSection(lines) {
    const entries = new Map();

    lines.forEach(({ lineNumber, text }) => {
        if (text.trim() === "") {
            return;
        }

        const match = text.match(/^([A-Z0-9])\s*=\s*([a-z]+)$/);
        if (!match) {
            throw new DiagramParseError(
                'Legend lines must use the form "A = consumer", "A = generator", or "A = main".',
                {
                    section: "legend",
                    lineNumber,
                    lineText: text,
                }
            );
        }

        const [, symbol, type] = match;

        if (!NODE_TYPES.has(type)) {
            throw new DiagramParseError(`Unsupported node type "${type}" for symbol "${symbol}".`, {
                section: "legend",
                lineNumber,
                lineText: text,
            });
        }

        if (entries.has(symbol)) {
            throw new DiagramParseError(`Legend symbol "${symbol}" is duplicated.`, {
                section: "legend",
                lineNumber,
                lineText: text,
            });
        }

        entries.set(symbol, {
            id: symbol,
            type,
            lineNumber,
            lineText: text,
        });
    });

    if (!entries.size) {
        throw new DiagramParseError("[legend] must contain at least one entry.", {
            section: "legend",
        });
    }

    return entries;
}

function trimEmptyBoundaryLines(lines) {
    let start = 0;
    let end = lines.length;

    while (start < end && lines[start].text.trim() === "") {
        start += 1;
    }

    while (end > start && lines[end - 1].text.trim() === "") {
        end -= 1;
    }

    return lines.slice(start, end);
}

function validateConnectorTopology(gridData) {
    const connectorTiles = new Map();

    for (let row = 0; row < gridData.height; row += 1) {
        for (let col = 0; col < gridData.width; col += 1) {
            const character = getGridCharacter(gridData, row, col);

            if (character === " ") {
                continue;
            }

            if (isNode(character)) {
                validateNodeIsolation(gridData, row, col);
                continue;
            }

            if (character === "-" || character === "|") {
                connectorTiles.set(
                    getCellKey(row, col),
                    validateStraightConnector(gridData, row, col, character)
                );
                continue;
            }

            if (character === "+") {
                connectorTiles.set(getCellKey(row, col), validateJunctionConnector(gridData, row, col));
            }
        }
    }

    if (!connectorTiles.size) {
        throw new DiagramParseError("[grid] must contain at least one connector tile.", {
            section: "grid",
            lineNumber: gridData.rows[0].lineNumber,
            lineText: gridData.rows[0].text,
        });
    }

    return connectorTiles;
}

function validateNodeIsolation(gridData, row, col) {
    DIRECTIONS.forEach((direction) => {
        if (isNode(getNeighborCharacter(gridData, row, col, direction))) {
            throw new DiagramParseError("Node tiles cannot touch directly without a connector.", {
                section: "grid",
                lineNumber: gridData.rows[row].lineNumber,
                lineText: gridData.rows[row].text,
                column: col + 1,
            });
        }
    });
}

function validateStraightConnector(gridData, row, col, character) {
    const expectedDirections = CONNECTOR_CLASSES[character];
    const blockedDirections = character === "-" ? ["north", "south"] : ["west", "east"];

    blockedDirections.forEach((direction) => {
        if (getNeighborCharacter(gridData, row, col, direction) !== " ") {
            throw new DiagramParseError(
                `Connector "${character}" cannot connect ${direction}; use "+" for turns and junctions.`,
                {
                    section: "grid",
                    lineNumber: gridData.rows[row].lineNumber,
                    lineText: gridData.rows[row].text,
                    column: col + 1,
                }
            );
        }
    });

    const directions = expectedDirections.filter((direction) => {
        return neighborAcceptsConnection(gridData, row, col, direction);
    });

    if (!directions.length) {
        throw new DiagramParseError(
            `Connector "${character}" must connect along ${expectedDirections.join(" or ")}.`,
            {
                section: "grid",
                lineNumber: gridData.rows[row].lineNumber,
                lineText: gridData.rows[row].text,
                column: col + 1,
            }
        );
    }

    return {
        row,
        col,
        kind: character,
        directions,
    };
}

function validateJunctionConnector(gridData, row, col) {
    const openDirections = DIRECTIONS.filter((direction) => {
        return getNeighborCharacter(gridData, row, col, direction) !== " ";
    });

    if (openDirections.length < 2) {
        throw new DiagramParseError('Connector "+" must join at least two neighboring tiles.', {
            section: "grid",
            lineNumber: gridData.rows[row].lineNumber,
            lineText: gridData.rows[row].text,
            column: col + 1,
        });
    }

    if (openDirections.length === 2 && areOpposite(openDirections[0], openDirections[1])) {
        throw new DiagramParseError(
            'Connector "+" cannot be used for a straight run; use "-" or "|".',
            {
                section: "grid",
                lineNumber: gridData.rows[row].lineNumber,
                lineText: gridData.rows[row].text,
                column: col + 1,
            }
        );
    }

    openDirections.forEach((direction) => {
        if (!neighborAcceptsConnection(gridData, row, col, direction)) {
            throw new DiagramParseError(`Connector "+" has an invalid ${direction} neighbor.`, {
                section: "grid",
                lineNumber: gridData.rows[row].lineNumber,
                lineText: gridData.rows[row].text,
                column: col + 1,
            });
        }
    });

    return {
        row,
        col,
        kind: "+",
        directions: openDirections,
    };
}

function buildNodes(gridData, legendEntries) {
    const nodes = [];
    const seenSymbols = new Set();

    for (let row = 0; row < gridData.height; row += 1) {
        for (let col = 0; col < gridData.width; col += 1) {
            const character = getGridCharacter(gridData, row, col);

            if (!isNode(character)) {
                continue;
            }

            if (seenSymbols.has(character)) {
                throw new DiagramParseError(`Node symbol "${character}" must appear exactly once.`, {
                    section: "grid",
                    lineNumber: gridData.rows[row].lineNumber,
                    lineText: gridData.rows[row].text,
                    column: col + 1,
                });
            }

            seenSymbols.add(character);

            const legend = legendEntries.get(character);
            if (!legend) {
                throw new DiagramParseError(`Missing legend entry for node symbol "${character}".`, {
                    section: "legend",
                    lineNumber: gridData.rows[row].lineNumber,
                    lineText: gridData.rows[row].text,
                    column: col + 1,
                });
            }

            const connectionDirections = DIRECTIONS.filter((direction) => {
                return neighborAcceptsConnection(gridData, row, col, direction);
            });

            if (connectionDirections.length !== 1) {
                throw new DiagramParseError(
                    connectionDirections.length === 0
                        ? `Node "${character}" must connect to exactly one connector side.`
                        : `Node "${character}" cannot connect on multiple sides.`,
                    {
                        section: "grid",
                        lineNumber: gridData.rows[row].lineNumber,
                        lineText: gridData.rows[row].text,
                        column: col + 1,
                    }
                );
            }

            nodes.push({
                id: character,
                type: legend.type,
                row,
                col,
                connectionDirection: connectionDirections[0],
            });
        }
    }

    if (nodes.length < 2) {
        throw new DiagramParseError("At least two nodes are required to build the scene.", {
            section: "grid",
        });
    }

    for (const [symbol, entry] of legendEntries.entries()) {
        if (!nodes.some((node) => node.id === symbol)) {
            throw new DiagramParseError(`Legend symbol "${symbol}" does not appear in the grid.`, {
                section: "legend",
                lineNumber: entry.lineNumber,
                lineText: entry.lineText,
            });
        }
    }

    return nodes;
}

function buildGraph(diagramModel) {
    const points = new Map();
    const adjacency = new Map();
    const terminalIds = [];
    const emitterTerminalIds = [];
    const nodeTypeByTerminalId = new Map();
    const nodeByTerminalId = new Map();
    const seenEdges = new Set();

    diagramModel.connectorTiles.forEach((tile) => {
        points.set(getTilePointId(tile.row, tile.col), getCellCenter(tile.row, tile.col));
    });

    diagramModel.nodes.forEach((node) => {
        const terminalId = getNodePointId(node.id);

        terminalIds.push(terminalId);
        nodeTypeByTerminalId.set(terminalId, node.type);
        nodeByTerminalId.set(terminalId, node);

        if (NODE_TYPE_RULES[node.type].emits) {
            emitterTerminalIds.push(terminalId);
        }

        points.set(terminalId, getNodeAnchor(node.row, node.col, node.connectionDirection));
    });

    diagramModel.connectorTiles.forEach((tile) => {
        const fromPointId = getTilePointId(tile.row, tile.col);

        tile.directions.forEach((direction) => {
            const offset = OFFSETS[direction];
            const neighborRow = tile.row + offset.row;
            const neighborCol = tile.col + offset.col;
            const neighborCharacter = getGridCharacter(diagramModel, neighborRow, neighborCol);
            let toPointId = null;

            if (isNode(neighborCharacter)) {
                toPointId = getNodePointId(neighborCharacter);
            } else if (neighborCharacter !== " ") {
                toPointId = getTilePointId(neighborRow, neighborCol);
            }

            if (!toPointId) {
                return;
            }

            const edgeId = getEdgeKey(fromPointId, toPointId);
            if (seenEdges.has(edgeId)) {
                return;
            }

            seenEdges.add(edgeId);
            addAdjacency(adjacency, fromPointId, toPointId);
            addAdjacency(adjacency, toPointId, fromPointId);
        });
    });

    if (terminalIds.some((terminalId) => !(adjacency.get(terminalId) ?? []).length)) {
        throw new DiagramParseError("Every node must connect to the diagram graph.", {
            section: "grid",
        });
    }

    validateGraphConnectivity(points, adjacency, terminalIds, nodeByTerminalId);

    return {
        points,
        adjacency,
        terminalIds,
        emitterTerminalIds,
        nodeTypeByTerminalId,
    };
}

function validateGraphConnectivity(points, adjacency, terminalIds, nodeByTerminalId) {
    const queue = [terminalIds[0]];
    const visited = new Set(queue);

    while (queue.length > 0) {
        const currentId = queue.shift();

        (adjacency.get(currentId) ?? []).forEach((neighborId) => {
            if (visited.has(neighborId)) {
                return;
            }

            visited.add(neighborId);
            queue.push(neighborId);
        });
    }

    terminalIds.forEach((terminalId) => {
        if (!visited.has(terminalId)) {
            const node = nodeByTerminalId.get(terminalId);

            throw new DiagramParseError(`Node "${node?.id ?? terminalId}" is disconnected from the rest of the diagram.`, {
                section: "grid",
            });
        }
    });

    points.forEach((_, pointId) => {
        if (!visited.has(pointId)) {
            throw new DiagramParseError("The diagram contains a disconnected connector branch.", {
                section: "grid",
            });
        }
    });
}

function buildConnectorPaths(graph) {
    const paths = [];
    const visitedEdges = new Set();
    const breakpoints = Array.from(graph.points.keys()).filter((pointId) => {
        return isPathBreakpoint(pointId, graph.adjacency);
    });

    const walkPath = (startPointId, nextPointId) => {
        const points = [graph.points.get(startPointId)];
        let previousPointId = startPointId;
        let currentPointId = nextPointId;

        visitedEdges.add(getEdgeKey(startPointId, nextPointId));

        while (true) {
            points.push(graph.points.get(currentPointId));

            const neighbors = (graph.adjacency.get(currentPointId) ?? []).filter((pointId) => {
                return pointId !== previousPointId;
            });

            if (isPathBreakpoint(currentPointId, graph.adjacency) || neighbors.length !== 1) {
                break;
            }

            const candidateId = neighbors[0];
            const edgeId = getEdgeKey(currentPointId, candidateId);

            if (visitedEdges.has(edgeId)) {
                break;
            }

            visitedEdges.add(edgeId);
            previousPointId = currentPointId;
            currentPointId = candidateId;
        }

        return simplifyCollinearPoints(points);
    };

    breakpoints.forEach((startPointId) => {
        (graph.adjacency.get(startPointId) ?? []).forEach((nextPointId) => {
            if (!visitedEdges.has(getEdgeKey(startPointId, nextPointId))) {
                paths.push(walkPath(startPointId, nextPointId));
            }
        });
    });

    graph.adjacency.forEach((neighbors, startPointId) => {
        neighbors.forEach((nextPointId) => {
            if (!visitedEdges.has(getEdgeKey(startPointId, nextPointId))) {
                paths.push(walkPath(startPointId, nextPointId));
            }
        });
    });

    return paths.filter((points) => points.length >= 2);
}

function buildSignalSources(graph) {
    return graph.emitterTerminalIds
        .map((startTerminalId) => {
            const sourceType = graph.nodeTypeByTerminalId.get(startTerminalId);
            const sourceNodeId = getNodeIdFromPointId(startTerminalId);
            const allowedDestinationTypes = NODE_TYPE_RULES[sourceType].allowedDestinationTypes;

            const routes = graph.terminalIds
                .filter((endTerminalId) => {
                    if (endTerminalId === startTerminalId) {
                        return false;
                    }

                    return allowedDestinationTypes.includes(graph.nodeTypeByTerminalId.get(endTerminalId));
                })
                .map((endTerminalId, index) => {
                    const routePointIds = findRoute(startTerminalId, endTerminalId, graph.adjacency);

                    if (!routePointIds) {
                        throw new DiagramParseError(
                            `Node "${sourceNodeId}" cannot reach node "${getNodeIdFromPointId(endTerminalId)}".`,
                            { section: "grid" }
                        );
                    }

                    return {
                        id: `${sourceNodeId}-${index}`,
                        endNodeId: getNodeIdFromPointId(endTerminalId),
                        d: buildPathData(
                            simplifyCollinearPoints(
                                routePointIds.map((pointId) => graph.points.get(pointId))
                            )
                        ),
                    };
                });

            if (!routes.length) {
                return null;
            }

            return {
                nodeId: sourceNodeId,
                sourceType,
                routes,
            };
        })
        .filter(Boolean);
}

function findRoute(startId, endId, adjacency) {
    const queue = [startId];
    const breadcrumbs = new Map();
    const visited = new Set([startId]);

    while (queue.length > 0) {
        const currentId = queue.shift();

        if (currentId === endId) {
            break;
        }

        (adjacency.get(currentId) ?? []).forEach((neighborId) => {
            if (visited.has(neighborId)) {
                return;
            }

            visited.add(neighborId);
            breadcrumbs.set(neighborId, currentId);
            queue.push(neighborId);
        });
    }

    if (!visited.has(endId)) {
        return null;
    }

    const route = [endId];
    let currentId = endId;

    while (currentId !== startId) {
        currentId = breadcrumbs.get(currentId);

        if (!currentId) {
            return null;
        }

        route.unshift(currentId);
    }

    return route;
}

function buildPathData(points) {
    if (!Array.isArray(points) || points.length < 2) {
        throw new Error("Each path must contain at least two points.");
    }

    return points
        .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
        .join(" ");
}

function simplifyCollinearPoints(points) {
    if (points.length <= 2) {
        return points;
    }

    const simplified = [points[0]];

    for (let index = 1; index < points.length - 1; index += 1) {
        const previousPoint = simplified[simplified.length - 1];
        const currentPoint = points[index];
        const nextPoint = points[index + 1];

        if (!isCollinear(previousPoint, currentPoint, nextPoint)) {
            simplified.push(currentPoint);
        }
    }

    simplified.push(points[points.length - 1]);
    return simplified;
}

function isPathBreakpoint(pointId, adjacency) {
    return pointId.startsWith("node:") || (adjacency.get(pointId) ?? []).length !== 2;
}

function isCollinear(first, second, third) {
    return (first[0] === second[0] && second[0] === third[0])
        || (first[1] === second[1] && second[1] === third[1]);
}

function addAdjacency(adjacency, pointId, neighborId) {
    if (!adjacency.has(pointId)) {
        adjacency.set(pointId, []);
    }

    adjacency.get(pointId).push(neighborId);
}

function getNodeAnchor(row, col, direction) {
    const [centerX, centerY] = getCellCenter(row, col);
    const halfNode = NODE_SIZE / 2;

    switch (direction) {
        case "north":
            return [centerX, centerY - halfNode];
        case "east":
            return [centerX + halfNode, centerY];
        case "south":
            return [centerX, centerY + halfNode];
        case "west":
            return [centerX - halfNode, centerY];
        default:
            throw new Error(`Unsupported node connection direction "${direction}".`);
    }
}

function getCellCenter(row, col) {
    return [
        SCENE_PADDING + col * CELL_WIDTH + CELL_WIDTH / 2,
        SCENE_PADDING + row * CELL_HEIGHT + CELL_HEIGHT / 2,
    ];
}

function getCellKey(row, col) {
    return `${row}:${col}`;
}

function getTilePointId(row, col) {
    return `tile:${row}:${col}`;
}

function getNodePointId(nodeId) {
    return `node:${nodeId}`;
}

function getNodeIdFromPointId(pointId) {
    return pointId.slice("node:".length);
}

function getEdgeKey(firstPointId, secondPointId) {
    return [firstPointId, secondPointId].sort().join("::");
}

function neighborAcceptsConnection(gridData, row, col, direction) {
    const offset = OFFSETS[direction];
    const neighborRow = row + offset.row;
    const neighborCol = col + offset.col;
    const neighbor = getGridCharacter(gridData, neighborRow, neighborCol);

    if (neighbor === " ") {
        return false;
    }

    if (isNode(neighbor)) {
        return true;
    }

    if (neighbor === "+") {
        const neighborDirections = DIRECTIONS.filter((candidate) => {
            return getNeighborCharacter(gridData, neighborRow, neighborCol, candidate) !== " ";
        });

        return neighborDirections.includes(offset.opposite);
    }

    return CONNECTOR_CLASSES[neighbor].includes(offset.opposite);
}

function getNeighborCharacter(gridData, row, col, direction) {
    const offset = OFFSETS[direction];
    return getGridCharacter(gridData, row + offset.row, col + offset.col);
}

function getGridCharacter(gridData, row, col) {
    if (row < 0 || row >= gridData.height || col < 0 || col >= gridData.width) {
        return " ";
    }

    return gridData.rows[row].text[col];
}

function isAllowedGridCharacter(character) {
    return character === " " || character === "-" || character === "|" || character === "+" || isNode(character);
}

function isNode(character) {
    return /^[A-Z0-9]$/.test(character);
}

function areOpposite(firstDirection, secondDirection) {
    return OFFSETS[firstDirection].opposite === secondDirection;
}

function buildErrorMessage(error) {
    return formatErrorContext(error) || error.message;
}

function formatErrorContext(error) {
    const parts = [];

    if (error.section || error.lineNumber) {
        const sectionPrefix = error.section ? `[${error.section}] ` : "";
        const linePrefix = error.lineNumber ? `line ${error.lineNumber}` : "source";
        parts.push(`${sectionPrefix}${linePrefix}`);
    }

    if (error.lineText) {
        parts.push(error.lineText);

        if (error.column) {
            parts.push(`${" ".repeat(Math.max(error.column - 1, 0))}^`);
        }
    }

    return parts.join("\n");
}

main().catch((error) => {
    console.error(buildErrorMessage(error));
    process.exitCode = 1;
});
