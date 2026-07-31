/**
 * Tab 根页左右滑动切换（ViewPager 方案）。
 *
 * 5 个 Tab 页常驻同一条横向轨道（只挂载一次，切换不卸载），
 * 轨道 translateX = -当前页索引×屏宽 + 拖动位移：
 * - 跟手：相邻页本来就在屏外就位，拖动零挂载、零卡顿；
 * - 松手：按位移/速度决定切到相邻页（滑满后换路由并瞬时归位）或弹回；
 * - 点 TabBar 等外部导航：轨道以同样缓动滑到目标页；
 * - 边缘（首个/末个 Tab 反向拖）橡皮筋阻尼（位移 ×0.35）。
 *
 * 每个 Tab 页是独立竖向滚动容器（.swipe-page overflow-y:auto），
 * 各自保留滚动位置，互不影响。
 *
 * 手势判定：10px slop 内不决策；垂直分量更大则放行页面滚动；
 * 水平角 < ~30°（|dy| < |dx|·tan30°）才接管并 preventDefault。
 * touchstart 落在可横向滚动的容器（或标记 data-swipe-ignore）内时不劫持。
 * 仅 5 个 Tab 根页参与；二级页不响应（返回由 backButton 处理）。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export const TAB_PATHS = ['/', '/timer', '/drill', '/stats', '/settings'];

const SLOP = 10; // 决策阈值 px
const TAN30 = 0.577; // 水平判定：|dy| < |dx| * tan(30°)
const DIST_RATIO = 0.22; // 位移阈值：屏宽 22%（含速度投影，接近 iOS 手感）
const VELOCITY = 0.3; // 速度阈值 px/ms
const PROJECT_MS = 180; // 松手判定：按速度向前投影 180ms 的位移
const IOS_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'; // iOS 系统页面切换曲线
const ANIM_MS = 320; // 外部导航（点 Tab）固定时长

/** iOS 橡皮筋：位移越大阻力越大（非线性渐近屏宽上限） */
function rubberBand(dx: number, dim: number): number {
  const c = 0.55;
  return (Math.sign(dx) * (c * Math.abs(dx) * dim)) / (dim + c * Math.abs(dx));
}

/** touchstart 目标是否位于可横向滚动的容器内（这类容器不劫持手势） */
function inHorizontalScroller(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  for (let depth = 0; el && el instanceof HTMLElement && depth < 6; depth++, el = el.parentElement) {
    if (el.hasAttribute('data-swipe-ignore')) return true;
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 4) {
      return true;
    }
    if (el.classList.contains('swipe-page') || el.tagName === 'BODY') break;
  }
  return false;
}

export function useSwipeTabs() {
  const router = useRouter();
  const route = useRoute();

  const dragOffset = ref(0);
  const animating = ref(false); // 动画中（开过渡）
  const animMs = ref(ANIM_MS); // 松手动画时长（按剩余位移/速度动态计算）
  const vw = ref(window.innerWidth);

  const isTabPage = computed(() => TAB_PATHS.includes(route.path));
  const activeIndex = computed(() => Math.max(0, TAB_PATHS.indexOf(route.path)));

  const trackStyle = computed(() => ({
    transform: `translateX(${-activeIndex.value * vw.value + dragOffset.value}px)`,
    transition: animating.value ? `transform ${animMs.value}ms ${IOS_CURVE}` : 'none',
  }));

  let startX = 0;
  let startY = 0;
  let startT = 0;
  let lastRawDx = 0;
  let decided: 'none' | 'h' | 'v' = 'none';
  /** 内部发起的滑动导航（路由变化 watch 走瞬时归位分支） */
  let internalNav = false;

  function onTouchStart(e: TouchEvent) {
    decided = 'none';
    // 非 Tab 根页 / 动画中 / 多点触控 / 落在横向滚动容器内：本轮不接管
    if (!isTabPage.value || animating.value || e.touches.length !== 1) {
      decided = 'v';
      return;
    }
    if (inHorizontalScroller(e.target)) {
      decided = 'v';
      return;
    }
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startT = e.timeStamp;
    lastRawDx = 0;
  }

  function onTouchMove(e: TouchEvent) {
    if (decided === 'v' || animating.value) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (decided === 'none') {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // 垂直优先：垂直分量更大或非水平角度 → 放行页面滚动
      if (Math.abs(dy) >= Math.abs(dx) || Math.abs(dy) > Math.abs(dx) * TAN30) {
        decided = 'v';
        return;
      }
      decided = 'h';
    }
    e.preventDefault();
    lastRawDx = dx;

    const idx = activeIndex.value;
    // 边缘 iOS 橡皮筋（非线性阻尼），其余直接 1:1 跟手
    if ((idx === 0 && dx > 0) || (idx === TAB_PATHS.length - 1 && dx < 0)) {
      dragOffset.value = rubberBand(dx, vw.value);
    } else {
      dragOffset.value = dx;
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (decided !== 'h') {
      decided = 'none';
      return;
    }
    decided = 'none';

    const idx = activeIndex.value;
    const dt = Math.max(1, e.timeStamp - startT);
    const v = lastRawDx / dt;
    // iOS 手感：把当前位移按速度向前投影一段再判定，轻甩即可翻页
    const projected = dragOffset.value + v * PROJECT_MS;

    let target = idx;
    if (Math.abs(projected) > vw.value * DIST_RATIO || Math.abs(v) > VELOCITY) {
      if (lastRawDx < 0 && idx < TAB_PATHS.length - 1) target = idx + 1;
      else if (lastRawDx > 0 && idx > 0) target = idx - 1;
    }

    // 时长随剩余位移/速度动态计算：甩得快落得也快，慢拖缓缓归位
    const remaining =
      target !== idx ? vw.value - Math.abs(dragOffset.value) : Math.abs(dragOffset.value);
    animMs.value = Math.round(
      Math.max(180, Math.min(420, remaining / Math.max(Math.abs(v), 1.1)))
    );

    animating.value = true;
    if (target !== idx) {
      // 先滑满到目标页位置，动画结束后再换路由并瞬时归位（无跳变）
      dragOffset.value = (idx - target) * vw.value;
      setTimeout(() => {
        internalNav = true;
        void router.push(TAB_PATHS[target]);
      }, animMs.value);
    } else {
      // 未过阈值：弹回原位
      dragOffset.value = 0;
      setTimeout(() => {
        animating.value = false;
      }, animMs.value + 20);
    }
  }

  watch(
    () => route.path,
    () => {
      if (internalNav) {
        // 滑动提交：路由已变，dragOffset 仍是 ±一屏；同步归零 → 视觉位置不变
        animating.value = false;
        dragOffset.value = 0;
        void nextTick(() => {
          internalNav = false;
        });
      } else if (isTabPage.value) {
        // 外部导航（点 TabBar）：轨道滑动过去
        animMs.value = ANIM_MS;
        animating.value = true;
        dragOffset.value = 0;
        setTimeout(() => {
          animating.value = false;
        }, ANIM_MS + 20);
      }
    }
  );

  function onResize() {
    vw.value = window.innerWidth;
  }

  onMounted(() => {
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('resize', onResize);
  });

  onUnmounted(() => {
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('resize', onResize);
  });

  return { trackStyle, isTabPage };
}
