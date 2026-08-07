(() => {
  "use strict";

  const commands = [...document.querySelectorAll("[data-command]")];
  const panels = [...document.querySelectorAll("[data-command-panel]")];
  const activeCommand = document.querySelector("[data-active-command]");
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const panelTimers = new WeakMap();

  const clearPanelTimer = (panel) => {
    const timer = panelTimers.get(panel);
    if (timer) window.clearTimeout(timer);
  };

  const selectCommand = (button, moveFocus = false, immediate = false) => {
    const command = button.dataset.command;

    commands.forEach((item) => {
      const selected = item === button;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
    });

    panels.forEach((panel) => {
      const selected = panel.dataset.commandPanel === command;
      clearPanelTimer(panel);

      if (selected) {
        panel.hidden = false;
        panel.classList.remove("is-exiting");
        panel.classList.add("is-active");
        if (!immediate && !reduceMotion) {
          panel.classList.add("is-entering");
          panelTimers.set(
            panel,
            window.setTimeout(() => panel.classList.remove("is-entering"), 380),
          );
        }
        return;
      }

      panel.classList.remove("is-entering");
      if (immediate || reduceMotion || !panel.classList.contains("is-active")) {
        panel.classList.remove("is-active", "is-exiting");
        panel.hidden = true;
        return;
      }

      panel.classList.add("is-exiting");
      panelTimers.set(
        panel,
        window.setTimeout(() => {
          panel.classList.remove("is-active", "is-exiting");
          panel.hidden = true;
        }, 150),
      );
    });

    if (activeCommand) activeCommand.textContent = `~/today $ kgc ${command}`;
    if (moveFocus) button.focus();
  };

  commands.forEach((button, index) => {
    button.addEventListener("click", () => selectCommand(button));
    button.addEventListener("keydown", (event) => {
      let nextIndex = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown")
        nextIndex = (index + 1) % commands.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
        nextIndex = (index - 1 + commands.length) % commands.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = commands.length - 1;
      else return;
      event.preventDefault();
      selectCommand(commands[nextIndex], true);
    });
  });

  if (commands.length) selectCommand(commands[0], false, true);

  const syncToggle = document.querySelector("[data-sync-toggle]");
  const syncIndicator = document.querySelector("[data-sync-indicator]");
  const syncDetail = document.querySelector("[data-sync-detail]");
  const syncResult = document.querySelector("[data-sync-result]");
  const syncRoot = document.querySelector("[data-sync-root]");

  syncToggle?.addEventListener("click", () => {
    const enabled = syncToggle.getAttribute("aria-pressed") !== "true";
    syncToggle.setAttribute("aria-pressed", String(enabled));
    syncToggle.textContent = enabled ? "切换为 OFF" : "切换为 ON";
    syncIndicator.textContent = enabled ? "ON" : "OFF";
    syncDetail.textContent = enabled
      ? "开始发现可信局域网中的 Windows 伴侣；配对后才会建立连接。"
      : "REST、WebSocket、UDP 发现与局域网更新均未运行。";
    syncResult.textContent = enabled
      ? "discovery started. local records remain unchanged."
      : "all network activity stopped. local records preserved.";
    if (!reduceMotion && syncRoot) {
      syncRoot.classList.remove("is-updating");
      void syncRoot.offsetWidth;
      syncRoot.classList.add("is-updating");
      window.setTimeout(() => syncRoot.classList.remove("is-updating"), 300);
    }
  });
})();
