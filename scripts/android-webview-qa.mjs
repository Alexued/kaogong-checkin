import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import fs from 'node:fs';
import path from 'node:path';

const endpoint = process.env.KGC_CDP_ENDPOINT || 'http://127.0.0.1:9222/json';

async function target() {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`CDP_TARGET_HTTP_${response.status}`);
  const pages = await response.json();
  const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
  if (!page) throw new Error('CDP_TARGET_NOT_FOUND');
  return page;
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  let id = 0;
  const pending = new Map();
  socket.on('message', (bytes) => {
    const message = JSON.parse(String(bytes));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    send(method, params = {}) {
      id += 1;
      const requestId = id;
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

const visible = `(element) => {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}`;

function expressionFor(command, args) {
  if (command === 'eval') return args.join(' ');
  if (command === 'goto') {
    const href = JSON.stringify(args[0] || '/');
    return `(() => {
      const path = ${href};
      const anchor = [...document.querySelectorAll('a[href]')].find((item) => item.getAttribute('href') === path);
      if (!anchor) throw new Error('ROUTE_NOT_FOUND:' + path);
      anchor.click();
      return path;
    })()`;
  }
  if (command === 'reload') return `(() => { location.reload(); return true; })()`;
  if (command === 'expire-pomodoro') {
    const focusesCompleted = args[0] === undefined ? null : Number(args[0]);
    return `(() => {
      const key = 'kgc-pomodoro-v1';
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      if (!value?.startedAt) throw new Error('POMODORO_NOT_STARTED');
      ${Number.isFinite(focusesCompleted) ? `value.focusesCompleted = ${focusesCompleted};` : ''}
      value.startedAt = new Date(Date.now() - value.durationMs - 250).toISOString();
      value.deadlineAt = Date.now() - 250;
      value.remainingAtPauseMs = 0;
      value.running = true;
      localStorage.setItem(key, JSON.stringify(value));
      location.reload();
      return { stage: value.stage, focusesCompleted: value.focusesCompleted, durationMs: value.durationMs };
    })()`;
  }
  if (command === 'state-summary') return `(() => {
    const parse = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || fallback); } catch { return null; } };
    const state = parse('kgc-state', '{}') || {};
    const repository = parse('kgc-repository-v3', '{}') || {};
    const queue = parse('kgc-queue', '[]') || [];
    const envelopeState = repository.envelope?.state || {};
    const project = (item) => ({
      id: item.id,
      label: item.label || item.title || item.categoryLabel || '',
      mode: item.mode || item.source || '',
      deleted: Boolean(item.deleted || item.deletedAt),
      createdAt: item.createdAt || '',
      updatedAt: item.updatedAt || '',
    });
    return {
      href: location.href,
      legacy: {
        schemaVersion: state.schemaVersion,
        tasks: (state.tasks || []).map(project),
        subtasks: (state.subtasks || []).map(project),
        checkins: (state.checkins || []).map(project),
        timers: (state.timers || []).map(project),
        drills: (state.drills || []).map(project),
        formulaDrills: (state.formulaDrills || []).map(project),
        speedDrills: (state.speedDrills || []).map(project),
        analysisReviews: (state.analysisReviews || []).map(project),
      },
      repository: {
        deviceId: repository.envelope?.deviceId || '',
        revision: repository.envelope?.revision ?? null,
        outboxCount: (repository.outbox || []).length,
        tasks: (envelopeState.tasks || []).map(project),
        checkins: (envelopeState.dailyProgress || []).map(project),
        timers: (envelopeState.timerSessions || []).map(project),
        drills: (envelopeState.drillAttempts || []).map(project),
        speeds: (envelopeState.speedAttempts || []).map(project),
        reviews: (envelopeState.analysisReviews || []).map(project),
      },
      queue: queue.map((item) => ({
        kind: item.kind,
        entity: item.entity,
        id: item.payload?.id || '',
        label: item.payload?.label || item.payload?.title || item.payload?.categoryLabel || '',
        deleted: Boolean(item.payload?.deleted),
        createdAt: item.payload?.createdAt || '',
      })),
      pomodoro: parse('kgc-pomodoro-v1', 'null'),
      nowMs: Date.now(),
      clockText: document.querySelector('.timer-page .clock')?.textContent?.trim() || '',
      localStorageKeys: Object.keys(localStorage).sort(),
    };
  })()`;
  if (command === 'screen') return `(() => {
    const inViewport = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < innerWidth && rect.top < innerHeight
        && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const controls = [...document.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="tab"]')]
      .filter(inViewport)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || element.getAttribute('aria-label') || element.placeholder || '').trim(),
          type: element.type || '', value: element.value ?? '', disabled: Boolean(element.disabled),
          href: element.getAttribute('href'),
          rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        };
      });
    const elements = [...document.querySelectorAll('h1,h2,h3,p,span,small,strong')]
      .filter(inViewport)
      .map((element) => (element.innerText || '').trim())
      .filter(Boolean);
    return { href: location.href, viewport: [innerWidth, innerHeight], elements, controls };
  })()`;
  if (command === 'ocr-file') {
    const filePath = path.resolve(args.join(' '));
    const extension = path.extname(filePath).toLowerCase();
    const mediaType = extension === '.png' ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mediaType};base64,${fs.readFileSync(filePath).toString('base64')}`;
    return `window.Capacitor.Plugins.TextRecognition.recognize({ dataUrl: ${JSON.stringify(dataUrl)} })`;
  }
  if (command === 'snapshot') return `(() => {
    const isVisible = ${visible};
    const controls = [...document.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="tab"]')]
      .filter(isVisible)
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        return {
          index,
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || element.getAttribute('aria-label') || element.placeholder || '').trim(),
          type: element.type || '',
          value: element.value ?? '',
          disabled: Boolean(element.disabled),
          selected: element.getAttribute('aria-selected'),
          href: element.getAttribute('href'),
          rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
        };
      });
    return { title: document.title, url: location.href, text: document.body.innerText, controls };
  })()`;
  if (command === 'click-text') {
    const text = JSON.stringify(args.join(' '));
    return `(() => {
      const expected = ${text}; const isVisible = ${visible};
      const elements = [...document.querySelectorAll('button,a,[role="button"],[role="tab"],label')].filter(isVisible);
      const element = elements.find((item) => (item.innerText || item.getAttribute('aria-label') || '').trim() === expected)
        || elements.find((item) => (item.innerText || item.getAttribute('aria-label') || '').includes(expected));
      if (!element) throw new Error('CONTROL_NOT_FOUND:' + expected);
      element.click();
      return { tag: element.tagName.toLowerCase(), text: (element.innerText || element.getAttribute('aria-label') || '').trim() };
    })()`;
  }
  if (command === 'click-css') {
    const selector = JSON.stringify(args.join(' '));
    return `(() => { const element = document.querySelector(${selector}); if (!element) throw new Error('SELECTOR_NOT_FOUND'); element.click(); return true; })()`;
  }
  if (command === 'fill') {
    const selector = JSON.stringify(args[0] || '');
    const value = JSON.stringify(args.slice(1).join(' '));
    return `(() => {
      const element = document.querySelector(${selector});
      if (!element) throw new Error('SELECTOR_NOT_FOUND');
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(element, ${value});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return element.value;
    })()`;
  }
  throw new Error(`UNKNOWN_COMMAND:${command}`);
}

const [, , command = 'snapshot', ...args] = process.argv;
const page = await target();
const cdp = await connect(page.webSocketDebuggerUrl);
try {
  await cdp.send('Runtime.enable');
  if (command === 'reduced-motion') {
    const value = args[0] === 'reduce' ? 'reduce' : 'no-preference';
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  }
  const result = await cdp.send('Runtime.evaluate', {
    expression: command === 'reduced-motion'
      ? `(() => ({ matches: matchMedia('(prefers-reduced-motion: reduce)').matches, animations: document.getAnimations().map((item) => ({ playState: item.playState, duration: item.effect?.getTiming?.().duration })) }))()`
      : expressionFor(command, args),
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'CDP_EVALUATION_FAILED');
  }
  process.stdout.write(`${JSON.stringify(result.result.value, null, 2)}\n`);
} finally {
  cdp.close();
}
