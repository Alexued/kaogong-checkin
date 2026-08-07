(() => {
  "use strict";

  const status = document.querySelector("[data-copy-status]");

  const setButtonState = (button, state, duration = 520) => {
    button.classList.remove("is-copying", "is-copied", "is-copy-error");
    void button.offsetWidth;
    button.classList.add(state);
    window.setTimeout(() => button.classList.remove(state), duration);
  };

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      setButtonState(button, "is-copying", 1200);
      const value = document
        .getElementById(button.dataset.copyTarget)
        ?.textContent?.trim();
      if (!value || value === "构建后写入") {
        if (status) status.textContent = "正式构建完成后将写入校验值。";
        setButtonState(button, "is-copy-error");
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        if (status) status.textContent = "SHA-256 校验值已复制。";
        setButtonState(button, "is-copied");
      } catch {
        if (status) status.textContent = "无法访问剪贴板，请手动选择校验值。";
        setButtonState(button, "is-copy-error");
      }
    });
  });
})();
