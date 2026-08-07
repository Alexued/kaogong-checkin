(() => {
  "use strict";

  const status = document.querySelector("[data-copy-status]");

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = document
        .getElementById(button.dataset.copyTarget)
        ?.textContent?.trim();
      if (!value || value === "构建后写入") {
        if (status) status.textContent = "正式构建完成后将写入校验值。";
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        if (status) status.textContent = "SHA-256 校验值已复制。";
      } catch {
        if (status) status.textContent = "无法访问剪贴板，请手动选择校验值。";
      }
    });
  });
})();
