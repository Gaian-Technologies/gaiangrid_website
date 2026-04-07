import { css, html, LitElement, PropertyDeclarations } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('x-ha-grid')
export class HaGrid extends LitElement {
  static override styles = css``;

  protected override render() {
    return html`<div>ha-grid</div> `;
  }
}
