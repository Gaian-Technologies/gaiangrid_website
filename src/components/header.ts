import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

import './gaian-grid';

@customElement('x-header')
export class Header extends LitElement {
  static override styles = css`
    :host {
      --header-layout-progress: 0;
      --header-visual-progress: 0;
      --header-inline-space: calc(
        var(--space-lg) * (1 - var(--header-layout-progress))
      );
      --header-content-offset: calc(
        var(--space-lg) - var(--header-inline-space)
      );
      --text-color: color-mix(
        in srgb,
        rgb(242 244 242) calc((1 - var(--header-visual-progress)) * 100%),
        var(--theme-text-dark)
      );
      --logo-color: color-mix(
        in srgb,
        rgb(242 244 242) calc((1 - var(--header-visual-progress)) * 100%),
        var(--theme-primary)
      );
      --header-surface: color-mix(
        in srgb,
        transparent calc((1 - var(--header-visual-progress)) * 100%),
        var(--theme-background)
      );
      --header-border-color: color-mix(
        in srgb,
        rgb(242 244 242) calc((1 - var(--header-visual-progress)) * 100%),
        var(--theme-text-light)
      );

      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
    }

    .header {
      margin-inline: var(--header-inline-space);
      background-color: var(--header-surface);
      border-bottom: 1px solid var(--header-border-color);
      transition:
        margin-inline 160ms ease,
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease,
        color 160ms ease;
    }

    .header-inner {
      display: flex;
      justify-content: space-between;
      margin-inline: var(--header-content-offset);
      padding: var(--space-md);
      transition: margin-inline 160ms ease;
    }

    .selected {
      text-decoration: underline;
    }

    nav {
      margin-block-start: var(--space-sm);
    }

    a {
      cursor: pointer;
      text-decoration: none;
      color: var(--text-color);

      position: relative;
    }

    span {
      color: var(--text-color);
    }

    nav > a::after {
      content: '';
      position: absolute;
      width: 0;
      height: 1px;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      transition: width 100ms ease-in-out;
      background-color: var(--text-color);
    }

    nav > a:hover::after {
      width: 100%;
    }

    x-gaian-grid {
      color: var(--logo-color);
      transition: color 160ms ease;
    }

    @media (max-width: 480px) {
      .header {
        margin-inline: 0;
      }

      .header-inner {
        flex-direction: column;
        margin-inline: 0;
        padding: var(--space-md) var(--space-sm);
      }

      x-gaian-grid {
        width: 120px;
      }
    }
  `;

  private route = window.location.pathname;
  private landing: HTMLElement | null = null;

  private onScroll = () => {
    if (!this.landing) {
      return;
    }

    const rect = this.landing.getBoundingClientRect();
    const layoutProgress = Math.max(0, Math.min(1, 0.2 - rect.top / rect.height));
    const visualProgress = Math.max(
      0,
      Math.min(1, 0.4 + (-rect.top - rect.height * 0.8) / (rect.height * 0.2))
    );

    this.style.setProperty(
      '--header-layout-progress',
      layoutProgress.toString()
    );
    this.style.setProperty(
      '--header-visual-progress',
      visualProgress.toString()
    );
  };

  override connectedCallback() {
    super.connectedCallback();
    this.landing = document.querySelector<HTMLElement>('#landing');
    this.onScroll();
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  override disconnectedCallback() {
    window.removeEventListener('scroll', this.onScroll);
    super.disconnectedCallback();
  }

  protected override render() {
    return html`
      <div class="header">
        <div class="header-inner">
          <a href="/"><x-gaian-grid></x-gaian-grid></a>
          <nav>
            <a
              href="/vision"
              class="${this.route === '/vision' ? 'selected' : ''}"
              >vision</a
            >
            <span>|</span>
            <a href="/live" class="${this.route === '/live' ? 'selected' : ''}"
              >live data</a
            >
            <span>|</span>
            <a
              href="/setup"
              class="${this.route === '/setup' ? 'selected' : ''}"
              >quick setup</a
            >
            <span>|</span>
            <a href="https://github.com/Gaian-Technologies" target="_blank"
              >github</a
            >
          </nav>
        </div>
      </div>
    `;
  }
}
