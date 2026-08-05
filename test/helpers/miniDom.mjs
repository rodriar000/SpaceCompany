/*
 * A very small DOM good enough to execute first-party presentation scripts
 * under `node --test`, with no dependencies.
 *
 * Scope is deliberately narrow: it implements only the surface the modern UI
 * modules actually use (element creation, tree mutation, attributes, class
 * names, text nodes, `getElementById`, `getElementsByTagName`, and click events
 * that bubble). It is NOT a browser: no layout, no CSS, no selectors engine.
 * Anything richer belongs in the browser QA pass, not in the unit suite.
 */

class TextNode {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = String(value);
    this.parentNode = null;
  }

  get textContent() {
    return this.nodeValue;
  }
}

class Element {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.className = '';
    this.id = '';
    this.style = {};
    this.listeners = Object.create(null);
    this.onclick = null;
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore(node, reference) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    const index = reference ? this.childNodes.indexOf(reference) : -1;
    if (index === -1) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index !== -1) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'id') this.id = String(value);
  }

  getAttribute(name) {
    if (name === 'class') return this.className || null;
    if (name === 'id') return this.id || null;
    return name in this.attributes ? this.attributes[name] : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'class') this.className = '';
    if (name === 'id') this.id = '';
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join('');
  }

  /** Depth-first descendants (excluding self). */
  descendants() {
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  getElementsByTagName(tag) {
    const wanted = String(tag).toUpperCase();
    return this.descendants().filter((node) => wanted === '*' || node.tagName === wanted);
  }

  /** Elements whose class list contains `name` (test convenience). */
  byClass(name) {
    return this.descendants().filter(
      (node) => (' ' + node.className + ' ').indexOf(' ' + name + ' ') !== -1
    );
  }

  addEventListener(type, handler) {
    (this.listeners[type] = this.listeners[type] || []).push(handler);
  }

  /** Dispatch a click that bubbles to the root, like a real user click. */
  click() {
    const event = { type: 'click', target: this };
    let node = this;
    while (node) {
      if (typeof node.onclick === 'function') node.onclick(event);
      const handlers = node.listeners && node.listeners.click;
      if (handlers) for (const handler of handlers.slice()) handler(event);
      node = node.parentNode;
    }
  }
}

/** Build a document whose `getElementById` searches the whole tree. */
export function createDocument() {
  const root = new Element('body');
  const document = {
    documentElement: new Element('html'),
    body: root,
    readyState: 'complete',
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => new TextNode(text),
    addEventListener: () => {},
    getElementById(id) {
      if (root.id === id) return root;
      return root.descendants().find((node) => node.id === id) || null;
    },
  };
  return document;
}

export { Element, TextNode };

/** `<tag id="..." class="...">` shorthand used to assemble fixtures. */
export function element(tag, { id = '', className = '', attrs = {}, text = '' } = {}) {
  const node = new Element(tag);
  if (id) node.id = id;
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.appendChild(new TextNode(text));
  return node;
}
