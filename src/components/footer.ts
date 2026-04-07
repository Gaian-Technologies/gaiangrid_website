import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('x-footer')
export class Footer extends LitElement {
  static override styles = css`
    .container {
      border-top: 1px solid var(--theme-border);
      padding: var(--space-md);
      display: flex;
      justify-content: space-between;
      gap: var(--space-sm);
    }

    a {
      cursor: pointer;
      text-decoration: none;
      color: var(--theme-text-dark);

      position: relative;
    }

    a::after {
      content: ' ';
      position: absolute;
      width: 0;
      height: 1px;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      transition: width 100ms ease-in-out;
      background-color: var(--theme-text-dark);
    }

    a:hover::after {
      width: 100%;
    }

    @media (max-width: 480px) {
      .container {
        flex-direction: column-reverse;
      }
    }
  `;

  protected override render() {
    return html`<div class="container">
      <div>&copy; Gaian Technologies Limited. All rights reserverd.</div>
      <div>
        <a href="https://linkedin.com/company/gaian-technologies">linkedin</a>
        <span>|</span>
        <a href="https://github.com/Gaian-Technologies" target="_blank"
          >github</a
        >
        <span>|</span>
        <a href="mailto:info@gaiangrid.com">info@gaiangrid.com</a>
        <span>|</span>
        <a>privacy policy</a>
      </div>
    </div>`;
  }
}
