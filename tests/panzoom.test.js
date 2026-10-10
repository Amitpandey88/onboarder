import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePanzoom } from '../public/js/diagramPane.js';

function fixture({ width = 600, height = 400, treeWidth = 1500, treeHeight = 20000 } = {}) {
  globalThis.SVGElement = class {};
  const events = new Map();
  const canvas = {
    clientWidth: width, clientHeight: height,
    classList: { add() {}, remove() {} },
    addEventListener: (name, callback) => events.set(name, callback),
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: width, bottom: height }),
  };
  const root = { offsetLeft: 10, offsetTop: 10000, offsetHeight: 46 };
  const content = {
    style: {}, classList: { contains: () => false },
    firstElementChild: {
      offsetWidth: treeWidth, offsetHeight: treeHeight,
      classList: { contains: (name) => name === 'mm' },
      querySelector: () => root,
    },
  };
  const controller = makePanzoom(canvas, content);
  const transform = () => {
    const numbers = content.style.transform.match(/-?\d+(?:\.\d+)?/g).map(Number);
    return { x: numbers[0], y: numbers[1], scale: numbers[2] };
  };
  return { controller, content, events, transform, root };
}

test('fitting thousands of tree rows keeps readable cards and the root in view', () => {
  const { controller, transform, root } = fixture();
  controller.fit();
  const fitted = transform();
  assert.equal(fitted.scale, 0.9);
  assert.equal(fitted.x + root.offsetLeft * fitted.scale, 24);
  assert.ok(Math.abs(fitted.y + (root.offsetTop + 23) * fitted.scale - 200) < 0.001);
});

test('expansion preserves the anchor screen position and current zoom', () => {
  const { controller, transform } = fixture();
  controller.fit();
  const before = transform();
  const oldCell = { x: 260, y: 10000 };
  const expandedCell = { x: 260, y: 15000 };
  controller.reanchor(oldCell, expandedCell);
  const after = transform();
  assert.equal(after.scale, before.scale);
  assert.equal(after.x + expandedCell.x * after.scale, before.x + oldCell.x * before.scale);
  assert.ok(Math.abs((after.y + expandedCell.y * after.scale) - (before.y + oldCell.y * before.scale)) < 0.001);
});

test('sidebar navigation centers a distant folder without changing zoom', () => {
  const { controller, transform } = fixture();
  controller.fit();
  const cell = { x: 760, y: 18000, w: 204, h: 46 };
  controller.focusPoint(cell);
  const moved = transform();
  assert.equal(moved.scale, 0.9);
  assert.ok(Math.abs(moved.x + (cell.x + 102) * moved.scale - 300) < 0.001);
  assert.ok(Math.abs(moved.y + (cell.y + 23) * moved.scale - 200) < 0.001);
});

test('double-clicking a tree cell does not reset its zoom', () => {
  const { controller, events, transform } = fixture();
  controller.home();
  events.get('dblclick')({ target: { closest: () => ({}) } });
  assert.equal(transform().scale, 1);
  events.get('dblclick')({ target: { closest: () => null } });
  assert.equal(transform().scale, 0.9);
});
