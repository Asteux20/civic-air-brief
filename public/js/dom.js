// @ts-check
/** Small DOM helpers. Data is only ever set as text, never as HTML. */

/**
 * Element by id.
 * @param {string} id
 * @returns {any}
 */
export const $ = (id) => document.getElementById(id);

/**
 * Build an element: attributes (class, on* listeners, others as attributes) and text or node children.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} kids
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return node;
}

/**
 * SVG element with attributes.
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {...Node} kids
 * @returns {SVGElement}
 */
export function svg(tag, attrs = {}, ...kids) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  node.append(...kids);
  return node;
}

/**
 * Copy text to the clipboard and flip the button label for 2 seconds.
 * @param {string} text
 * @param {HTMLElement} button
 * @param {string} doneLabel
 */
export function copyText(text, button, doneLabel) {
  const label = button.textContent;
  navigator.clipboard?.writeText(text).then(() => {
    button.textContent = doneLabel;
    setTimeout(() => { button.textContent = label; }, 2000);
  });
}
