(() => {
  const lessons = [...document.querySelectorAll("[data-lesson-toggle]")];
  const status = document.querySelector("[data-lesson-status]");
  const refreshLessons = () => {
    const done = lessons.filter(
      (button) => button.getAttribute("aria-pressed") === "true",
    ).length;
    document.querySelectorAll(".lesson").forEach((row) => {
      const button = row.querySelector("[data-lesson-toggle]");
      const complete = button.getAttribute("aria-pressed") === "true";
      row.classList.toggle("is-done", complete);
      row.querySelector(".lesson-mark").textContent = complete ? "✓" : "○";
      row.querySelector(".lesson-note").textContent = complete
        ? "已完成 · 今日留痕"
        : "待完成 · 点击落笔";
    });
    if (status)
      status.textContent = `${done} 项已毕 · ${lessons.length - done ? `还剩 ${lessons.length - done} 项，慢慢做完即可。` : "今日功课已毕，收卷。"}`;
  };
  lessons.forEach((button) =>
    button.addEventListener("click", () => {
      button.setAttribute(
        "aria-pressed",
        button.getAttribute("aria-pressed") !== "true",
      );
      refreshLessons();
    }),
  );
  const value = document.querySelector("[data-timer-value]");
  const statusLine = document.querySelector("[data-timer-status]");
  const toggle = document.querySelector("[data-timer-toggle]");
  const reset = document.querySelector("[data-timer-reset]");
  let seconds = 1500;
  let timer = 0;
  const render = () => {
    if (value)
      value.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };
  toggle?.addEventListener("click", () => {
    if (timer) {
      stop();
      toggle.textContent = "继续专注";
      if (statusLine) statusLine.textContent = "已暂停，准备好时继续。";
      return;
    }
    toggle.textContent = "暂停专注";
    if (statusLine) statusLine.textContent = "专注进行中 · 其他事情稍后再做。";
    timer = window.setInterval(() => {
      seconds = Math.max(0, seconds - 1);
      render();
      if (!seconds) {
        stop();
        toggle.textContent = "开始专注";
        if (statusLine) statusLine.textContent = "一炷香已毕，记下收获吧。";
      }
    }, 1000);
  });
  reset?.addEventListener("click", () => {
    stop();
    seconds = 1500;
    render();
    if (toggle) toggle.textContent = "开始专注";
    if (statusLine) statusLine.textContent = "准备好时，点一下开始。";
  });
  document
    .querySelector("[data-card-reveal]")
    ?.addEventListener("click", (event) => {
      const card = document.querySelector("[data-memory-card]");
      const revealed = card?.classList.toggle("is-revealed");
      event.currentTarget.setAttribute(
        "aria-expanded",
        String(Boolean(revealed)),
      );
    });
  refreshLessons();
  render();
})();
