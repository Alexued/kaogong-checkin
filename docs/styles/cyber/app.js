(() => {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const replayMotion = (element, className, duration = 420) => {
    if (!element || reduceMotion) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), duration);
  };

  const radar = document.querySelector("[data-radar-visual]");
  const radarButton = document.querySelector("[data-radar-toggle]");
  const radarLabel = document.querySelector("[data-radar-label]");
  const radarStatus = document.querySelector("[data-radar-status]");
  const radarNode = document.querySelector("[data-radar-node]");
  let scanTimer = 0;
  let nodeTimer = 0;
  radarButton?.addEventListener("click", () => {
    const scanning = radar?.classList.toggle("is-scanning");
    if (!scanning) {
      window.clearTimeout(scanTimer);
      if (radarLabel) radarLabel.textContent = "扫描局域网";
      if (radarStatus) radarStatus.textContent = "雷达静默 · 电脑同步已关闭";
      if (radarNode) {
        const finishClear = () => {
          radarNode.classList.remove("is-found", "is-clearing");
          radarNode.innerHTML = "WINDOWS<br /><small>OFFLINE</small>";
        };
        if (reduceMotion || !radarNode.classList.contains("is-found")) {
          finishClear();
        } else {
          radarNode.classList.add("is-clearing");
          nodeTimer = window.setTimeout(finishClear, 180);
        }
      }
      return;
    }
    window.clearTimeout(nodeTimer);
    radarNode?.classList.remove("is-found", "is-clearing");
    if (radarNode)
      radarNode.innerHTML = "WINDOWS<br /><small>SEARCHING</small>";
    replayMotion(radar, "is-starting", 840);
    if (radarLabel) radarLabel.textContent = "扫描中…";
    if (radarStatus) radarStatus.textContent = "正在寻找已配对的 Windows 节点…";
    scanTimer = window.setTimeout(() => {
      if (!radar?.classList.contains("is-scanning")) return;
      radarLabel.textContent = "停止扫描";
      radarStatus.textContent = "发现 1 个节点 · 版本匹配将在同步开启后检查";
      radarNode?.classList.add("is-found");
      if (radarNode)
        radarNode.innerHTML = "WINDOWS<br /><small>READY / LAN</small>";
    }, 900);
  });

  const moduleButtons = [...document.querySelectorAll("[data-module]")];
  const modulePanels = [...document.querySelectorAll("[data-module-panel]")];
  const panelTimers = new WeakMap();

  const clearPanelTimer = (panel) => {
    const timer = panelTimers.get(panel);
    if (timer) window.clearTimeout(timer);
  };

  const selectModule = (button, immediate = false) => {
    const key = button.dataset.module;

    moduleButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("is-active", selected);
      item.setAttribute("aria-expanded", String(selected));
    });

    modulePanels.forEach((panel) => {
      const selected = panel.dataset.modulePanel === key;
      clearPanelTimer(panel);

      if (selected) {
        panel.hidden = false;
        panel.classList.remove("is-closing");
        panel.classList.add("is-open");
        if (!immediate && !reduceMotion) {
          panel.classList.add("is-opening");
          panelTimers.set(
            panel,
            window.setTimeout(() => panel.classList.remove("is-opening"), 340),
          );
        }
        return;
      }

      panel.classList.remove("is-opening", "is-open");
      if (immediate || reduceMotion || panel.hidden) {
        panel.classList.remove("is-closing");
        panel.hidden = true;
        return;
      }

      panel.classList.add("is-closing");
      panelTimers.set(
        panel,
        window.setTimeout(() => {
          panel.classList.remove("is-closing");
          panel.hidden = true;
        }, 150),
      );
    });
  };

  moduleButtons.forEach((button) =>
    button.addEventListener("click", () => selectModule(button)),
  );

  const initialModule =
    moduleButtons.find((button) => button.classList.contains("is-active")) ??
    moduleButtons[0];
  if (initialModule) selectModule(initialModule, true);
})();
