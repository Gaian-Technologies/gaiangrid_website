import { css, LitElement, nothing, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

const DEFAULT_SCENE_URL = '/assets/grid-scene.json';
const NODE_SIZE = 40;
const CONNECTOR_STROKE_WIDTH = 2;
const SIGNAL_INTERVAL_MS = 500;
const SIGNAL_RADIUS = 6;
const SIGNAL_TRAVEL_MIN_MS = 3000;
const SIGNAL_TRAVEL_MAX_MS = 3100;
const MAX_ACTIVE_SIGNALS = 3;
const ICON_TARGET_HEIGHT = 35;

type NodeType = 'consumer' | 'generator' | 'main';

type IconLayer = Readonly<Record<string, string>>;

type Icon = Readonly<{
  width: number;
  height: number;
  layers: readonly IconLayer[];
}>;

type SceneConnectorPath = Readonly<{
  id: string;
  d: string;
}>;

type SceneNode = Readonly<{
  id: string;
  type: NodeType;
  x: number;
  y: number;
}>;

type SceneRoute = Readonly<{
  id: string;
  endNodeId: string;
  d: string;
}>;

type SceneSignalSource = Readonly<{
  nodeId: string;
  sourceType: NodeType;
  routes: readonly SceneRoute[];
}>;

type Scene = Readonly<{
  schemaVersion: 1;
  viewWidth: number;
  viewHeight: number;
  connectorPaths: readonly SceneConnectorPath[];
  nodes: readonly SceneNode[];
  signalSources: readonly SceneSignalSource[];
}>;

type AnimatedSignal = {
  id: number;
  className: string;
  route: string;
  cx: number;
  cy: number;
};

const HOME_ASSISTANT_ICON = fitRawIcon({
  artBox: {
    x: 0,
    y: 0,
    width: 240,
    height: 240,
  },
  height: ICON_TARGET_HEIGHT,
  layers: [
    Object.freeze({
      d: 'M240 224.762C240 233.012 233.25 239.762 225 239.762H15C6.75 239.762 0 233.012 0 224.762V134.762C0 126.512 4.77 114.993 10.61 109.153L109.39 10.3725C115.22 4.5425 124.77 4.5425 130.6 10.3725L229.39 109.162C235.22 114.992 240 126.522 240 134.772V224.772V224.762Z',
      fill: '#F2F4F9',
    }),
    Object.freeze({
      d: 'M229.39 109.153L130.61 10.3725C124.78 4.5425 115.23 4.5425 109.4 10.3725L10.61 109.153C4.78 114.983 0 126.512 0 134.762V224.762C0 233.012 6.75 239.762 15 239.762H107.27L66.64 199.132C64.55 199.852 62.32 200.262 60 200.262C48.7 200.262 39.5 191.062 39.5 179.762C39.5 168.462 48.7 159.262 60 159.262C71.3 159.262 80.5 168.462 80.5 179.762C80.5 182.092 80.09 184.322 79.37 186.412L111 218.042V102.162C104.2 98.8225 99.5 91.8425 99.5 83.7725C99.5 72.4725 108.7 63.2725 120 63.2725C131.3 63.2725 140.5 72.4725 140.5 83.7725C140.5 91.8425 135.8 98.8225 129 102.162V183.432L160.46 151.972C159.84 150.012 159.5 147.932 159.5 145.772C159.5 134.472 168.7 125.272 180 125.272C191.3 125.272 200.5 134.472 200.5 145.772C200.5 157.072 191.3 166.272 180 166.272C177.5 166.272 175.12 165.802 172.91 164.982L129 208.892V239.772H225C233.25 239.772 240 233.022 240 224.772V134.772C240 126.522 235.23 115.002 229.39 109.162V109.153Z',
    }),
  ],
});

const POWER_ICON = fitRawIcon({
  artBox: {
    x: 4.1,
    y: 2,
    width: 15.79,
    height: 20,
  },
  height: ICON_TARGET_HEIGHT,
  layers: [
    Object.freeze({
      d: 'M8.28,5.45L6.5,4.55L7.76,2H16.23L17.5,4.55L15.72,5.44L15,4H9L8.28,5.45M18.62,8H14.09L13.3,5H10.7L9.91,8H5.38L4.1,10.55L5.89,11.44L6.62,10H17.38L18.1,11.45L19.89,10.56L18.62,8M17.77,22H15.7L15.46,21.1L12,15.9L8.53,21.1L8.3,22H6.23L9.12,11H11.19L10.83,12.35L12,14.1L13.16,12.35L12.81,11H14.88L17.77,22M11.4,15L10.5,13.65L9.32,18.13L11.4,15M14.68,18.12L13.5,13.64L12.6,15L14.68,18.12Z',
    }),
  ],
});

const NODE_TYPE_CONFIG: Readonly<
  Record<
    NodeType,
    {
      className: string;
      signalClass: string | null;
      icon: Icon;
    }
  >
> = Object.freeze({
  consumer: Object.freeze({
    className: 'grid-control__node--consumer',
    signalClass: null,
    icon: HOME_ASSISTANT_ICON,
  }),
  generator: Object.freeze({
    className: 'grid-control__node--generator',
    signalClass: 'grid-control__signal-dot--generator',
    icon: HOME_ASSISTANT_ICON,
  }),
  main: Object.freeze({
    className: 'grid-control__node--main',
    signalClass: 'grid-control__signal-dot--main',
    icon: POWER_ICON,
  }),
});

@customElement('x-ha-grid')
export class HaGrid extends LitElement {
  static override styles = css`
    :host {
      --grid-connector-color: var(--forest-green-light, #0e5724);
      --grid-node-consumer: var(--forest-green-light, #0e5724);
      --grid-node-generator: var(--forest-green-dark, #29ad29);
      --grid-node-main: var(--forest-green-light, #0e5724);
      --grid-signal-generator: var(--forest-green-dark, #29ad29);
      --grid-signal-main: var(--ocean-blue, #6097c1);
      --grid-signal-outline: #ffffff;

      display: block;
      line-height: 0;
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
      max-width: 100%;
      fill: none;
      stroke: var(--grid-connector-color);
      stroke-width: 4px;
      overflow: visible;
    }

    .grid-control__connector {
      stroke-linecap: butt;
      stroke-linejoin: bevel;
    }

    .grid-control__connector-layer,
    .grid-control__node-layer,
    .grid-control__signal-layer {
      pointer-events: none;
    }

    .grid-control__route {
      fill: none;
      stroke: none;
    }

    .grid-control__signal-dot {
      stroke: var(--grid-signal-outline);
      stroke-width: 2px;
    }

    .grid-control__signal-dot--generator {
      fill: var(--grid-signal-generator);
    }

    .grid-control__signal-dot--main {
      fill: var(--grid-signal-main);
    }

    .grid-control__node {
      stroke: none;
    }

    .grid-control__node--consumer {
      fill: var(--grid-node-consumer);
    }

    .grid-control__node--generator {
      fill: var(--grid-node-generator);
    }

    .grid-control__node--main {
      fill: var(--grid-node-main);
    }

    .grid-control__error {
      fill: #111111;
      stroke: none;
      font: 14px/1.5 monospace;
    }
  `;

  @property({ type: String, attribute: 'scene-url' })
  sceneUrl = DEFAULT_SCENE_URL;

  @property({ type: Boolean, attribute: 'animated', reflect: true })
  animated = true;

  @state()
  private scene: Scene | null = null;

  @state()
  private errorMessage: string | null = null;

  @state()
  private signals: AnimatedSignal[] = [];

  private signalIntervalId: number | null = null;
  private activeSignals = new Map<number, number>();
  private signalId = 0;
  private loadRequestId = 0;

  override connectedCallback() {
    super.connectedCallback();

    if (this.scene) {
      this.syncSignalTraffic();
      return;
    }

    void this.loadScene();
  }

  override disconnectedCallback() {
    this.stopSignals();
    super.disconnectedCallback();
  }

  protected override updated(changedProperties: Map<PropertyKey, unknown>) {
    if (
      changedProperties.has('sceneUrl') &&
      changedProperties.get('sceneUrl') !== undefined
    ) {
      void this.loadScene();
      return;
    }

    if (changedProperties.has('animated')) {
      this.syncSignalTraffic();
    }
  }

  protected override render() {
    if (this.errorMessage) {
      return svg`
        <svg
          class="grid-control__svg"
          version="1.2"
          role="img"
          aria-label="Animated grid diagram"
          viewBox="0 0 320 120"
          width="320"
          height="120"
        >
          <text x="20" y="36" class="grid-control__error">
            ${this.errorMessage.split('\n').map(
              (line, index) => svg`<tspan x="20" dy=${index === 0 ? '0' : '1.5em'}>${line}</tspan>`
            )}
          </text>
        </svg>
      `;
    }

    if (!this.scene) {
      return nothing;
    }

    return svg`
      <svg
        class="grid-control__svg"
        version="1.2"
        role="img"
        aria-label="Animated grid diagram"
        viewBox=${`0 0 ${this.scene.viewWidth} ${this.scene.viewHeight}`}
        width=${String(this.scene.viewWidth)}
        height=${String(this.scene.viewHeight)}
      >
        <g class="grid-control__connector-layer" aria-hidden="true">
          ${this.scene.connectorPaths.map(
            (connectorPath) => svg`
              <path
                class="grid-control__connector"
                d=${connectorPath.d}
                stroke-width=${String(CONNECTOR_STROKE_WIDTH)}
                data-connector-id=${connectorPath.id}
              ></path>
            `
          )}
        </g>
        <g class="grid-control__node-layer" aria-hidden="true">
          ${this.scene.nodes.map((node) => this.renderNode(node))}
        </g>
        <g class="grid-control__signal-layer" aria-hidden="true">
          ${this.signals.map((signal) => this.renderSignal(signal))}
        </g>
      </svg>
    `;
  }

  private async loadScene() {
    const requestId = ++this.loadRequestId;

    this.stopSignals();
    this.errorMessage = null;
    this.scene = null;

    try {
      const response = await fetch(this.sceneUrl, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`Failed to load scene JSON (${response.status}).`);
      }

      const scene = validateScene(await response.json());

      if (requestId !== this.loadRequestId) {
        return;
      }

      this.scene = scene;
      await this.updateComplete;
      this.syncSignalTraffic();
    } catch (error: unknown) {
      if (requestId !== this.loadRequestId) {
        return;
      }

      this.errorMessage = buildErrorMessage(error);
      console.error(error);
    }
  }

  private syncSignalTraffic() {
    this.stopSignals();

    if (
      !this.animated ||
      !this.scene ||
      !this.scene.signalSources.length ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const emitSignal = () => {
      if (document.hidden || this.activeSignals.size >= MAX_ACTIVE_SIGNALS) {
        return;
      }

      const source = pickRandom(this.scene?.signalSources ?? []);
      if (!source || !source.routes.length) {
        return;
      }

      this.spawnSignal(source, pickRandom(source.routes));
    };

    this.signalIntervalId = window.setInterval(emitSignal, SIGNAL_INTERVAL_MS);
  }

  private stopSignals() {
    if (this.signalIntervalId !== null) {
      window.clearInterval(this.signalIntervalId);
      this.signalIntervalId = null;
    }

    for (const frameId of this.activeSignals.values()) {
      cancelAnimationFrame(frameId);
    }

    this.activeSignals.clear();
    this.signals = [];
  }

  private spawnSignal(source: SceneSignalSource, route: SceneRoute) {
    const signalClass = getNodeTypeConfig(source.sourceType).signalClass;

    if (!signalClass) {
      return;
    }

    const pathLength = getRouteLength(route.d);
    if (pathLength === 0) {
      return;
    }

    const duration = randomBetween(SIGNAL_TRAVEL_MIN_MS, SIGNAL_TRAVEL_MAX_MS);
    const startTime = performance.now();
    const id = ++this.signalId;
    const signal: AnimatedSignal = {
      id,
      className: signalClass,
      route: route.d,
      cx: 0,
      cy: 0,
    };

    this.signals = [...this.signals, signal];

    const cleanup = () => {
      const frameId = this.activeSignals.get(id);
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }

      this.activeSignals.delete(id);
      this.signals = this.signals.filter((activeSignal) => activeSignal.id !== id);
    };

    const tick = (now: number) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const point = getPointAtProgress(route.d, elapsed, pathLength);

      this.signals = this.signals.map((activeSignal) =>
        activeSignal.id === id
          ? { ...activeSignal, cx: point.x, cy: point.y }
          : activeSignal
      );

      if (elapsed >= 1) {
        cleanup();
        return;
      }

      const frameId = requestAnimationFrame(tick);
      this.activeSignals.set(id, frameId);
    };

    const frameId = requestAnimationFrame(tick);
    this.activeSignals.set(id, frameId);
  }

  private renderNode(node: SceneNode) {
    const typeConfig = getNodeTypeConfig(node.type);

    return svg`
      <g
        class=${`grid-control__node ${typeConfig.className}`}
        transform=${buildNodeTranslate(node.x, node.y, typeConfig.icon)}
        data-node-id=${node.id}
      >
        <title>${node.id} (${node.type})</title>
        ${typeConfig.icon.layers.map((layer) => renderIconLayer(layer))}
      </g>
    `;
  }

  private renderSignal(signal: AnimatedSignal) {
    return svg`
      <path class="grid-control__route" d=${signal.route}></path>
      <circle
        class=${`grid-control__signal-dot ${signal.className}`}
        r=${String(SIGNAL_RADIUS)}
        cx=${signal.cx.toFixed(2)}
        cy=${signal.cy.toFixed(2)}
      ></circle>
    `;
  }
}

function validateScene(scene: unknown): Scene {
  if (!scene || typeof scene !== 'object') {
    throw new Error('Scene JSON is missing.');
  }

  if (!('schemaVersion' in scene) || scene.schemaVersion !== 1) {
    throw new Error(`Unsupported scene schema version "${String((scene as { schemaVersion?: unknown }).schemaVersion)}".`);
  }

  if (
    !('connectorPaths' in scene) ||
    !Array.isArray(scene.connectorPaths) ||
    !('nodes' in scene) ||
    !Array.isArray(scene.nodes) ||
    !('signalSources' in scene) ||
    !Array.isArray(scene.signalSources) ||
    !('viewWidth' in scene) ||
    typeof scene.viewWidth !== 'number' ||
    !('viewHeight' in scene) ||
    typeof scene.viewHeight !== 'number'
  ) {
    throw new Error('Scene JSON is missing required properties.');
  }

  return scene as Scene;
}

function renderIconLayer(layer: IconLayer) {
  return svg`<path
    d=${layer.d ?? ''}
    fill=${layer.fill ?? nothing}
    transform=${layer.transform ?? nothing}
  ></path>`;
}

function getNodeTypeConfig(type: NodeType) {
  return NODE_TYPE_CONFIG[type];
}

function buildNodeTranslate(x: number, y: number, icon: Icon) {
  const offsetX = x + (NODE_SIZE - icon.width) / 2;
  const offsetY = y + (NODE_SIZE - icon.height) / 2;

  return `translate(${offsetX} ${offsetY})`;
}

function createIcon({
  width,
  height,
  layers,
}: {
  width: number;
  height: number;
  layers: readonly IconLayer[];
}): Icon {
  return Object.freeze({
    width,
    height,
    layers: Object.freeze(layers.map((layer) => Object.freeze(layer))),
  });
}

function fitRawIcon({
  artBox,
  height,
  layers,
}: {
  artBox: { x: number; y: number; width: number; height: number };
  height: number;
  layers: readonly IconLayer[];
}) {
  const scale = height / artBox.height;
  const transform = `scale(${scale}) translate(${-artBox.x} ${-artBox.y})`;

  return createIcon({
    width: artBox.width * scale,
    height,
    layers: layers.map((layer) => ({
      ...layer,
      transform: layer.transform ? `${transform} ${layer.transform}` : transform,
    })),
  });
}

function buildErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Failed to render the grid control.';
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function getRouteLength(pathData: string) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  return path.getTotalLength();
}

function getPointAtProgress(pathData: string, progress: number, totalLength?: number) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  return path.getPointAtLength((totalLength ?? path.getTotalLength()) * progress);
}
