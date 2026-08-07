(() => {
  const radar = document.querySelector("[data-radar-visual]");
  const radarButton = document.querySelector("[data-radar-toggle]");
  const radarLabel = document.querySelector("[data-radar-label]");
  const radarStatus = document.querySelector("[data-radar-status]");
  const radarNode = document.querySelector("[data-radar-node]");
  let scanTimer = 0;
  radarButton?.addEventListener("click", () => {
    const scanning = radar?.classList.toggle("is-scanning");
    if (!scanning) {
      window.clearTimeout(scanTimer);
      if (radarLabel) radarLabel.textContent = "扫描局域网";
      if (radarStatus) radarStatus.textContent = "雷达静默 · 电脑同步已关闭";
      if (radarNode) {
        radarNode.classList.remove("is-found");
        radarNode.innerHTML = "WINDOWS<br /><small>OFFLINE</small>";
      }
      return;
    }
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
  document.querySelectorAll("[data-module]").forEach((button) =>
    button.addEventListener("click", () => {
      const key = button.dataset.module;
      document
        .querySelectorAll("[data-module]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
      document
        .querySelectorAll("[data-module-panel]")
        .forEach((panel) =>
          panel.classList.toggle("is-open", panel.dataset.modulePanel === key),
        );
    }),
  );
})();
