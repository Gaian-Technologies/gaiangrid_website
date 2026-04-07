import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('x-footer')
export class Footer extends LitElement {
  static override styles = css`
    div {
      border: 1px solid salmon;
    }
  `;

  protected override render() {
    return html`<div>footer</div> `;
  }
}
