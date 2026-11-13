import {
  AfterViewInit,
  Directive,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  Renderer2,
} from '@angular/core';

@Directive({
  selector: '.table-responsive',
  standalone: true,
})
export class StickyScrollbarDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly ngZone = inject(NgZone);

  private parentEl: HTMLElement | null = null;
  private barEl: HTMLElement | null = null;
  private innerEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private observedTable: Element | null = null;
  private metricsRafId: number | null = null;
  private sourceResetTimerId: number | null = null;
  private timerIds: number[] = [];
  private cleanupListeners: Array<() => void> = [];

  private activeSource: 'host' | 'bar' | null = null;
  private isDraggingBar = false;

  private lastVisible: boolean | null = null;
  private lastPinned: boolean | null = null;
  private lastLeft: number | null = null;
  private lastWidth: number | null = null;
  private lastBottom: number | null = null;
  private lastScrollWidth: number | null = null;

  ngAfterViewInit(): void {
    const hostEl = this.el.nativeElement;
    const parentEl = hostEl.parentElement;
    if (!parentEl || !parentEl.classList.contains('table-wrapper')) {
      return;
    }
    this.parentEl = parentEl;

    this.ngZone.runOutsideAngular(() => {
      const barEl = this.renderer.createElement('div') as HTMLElement;
      this.renderer.addClass(barEl, 'table-sticky-scrollbar');
      this.renderer.setAttribute(barEl, 'aria-hidden', 'true');

      const innerEl = this.renderer.createElement('div') as HTMLElement;
      this.renderer.addClass(innerEl, 'table-sticky-scrollbar-inner');

      this.renderer.appendChild(barEl, innerEl);
      this.renderer.appendChild(document.body, barEl);

      this.barEl = barEl;
      this.innerEl = innerEl;

      const scheduleSourceReset = (): void => {
        if (this.sourceResetTimerId !== null) {
          clearTimeout(this.sourceResetTimerId);
        }
        this.sourceResetTimerId = window.setTimeout(() => {
          this.sourceResetTimerId = null;
          if (!this.isDraggingBar) {
            this.activeSource = null;
          }
        }, 150);
      };

      const onBarPointerDown = (): void => {
        this.isDraggingBar = true;
        this.activeSource = 'bar';
        if (this.sourceResetTimerId !== null) {
          clearTimeout(this.sourceResetTimerId);
          this.sourceResetTimerId = null;
        }
      };

      const onBarPointerEnd = (): void => {
        if (!this.isDraggingBar) {
          return;
        }
        this.isDraggingBar = false;
        scheduleSourceReset();
      };

      const onBarScroll = (): void => {
        if (this.activeSource === 'host' && !this.isDraggingBar) {
          return;
        }
        this.activeSource = 'bar';
        scheduleSourceReset();
        const targetScrollLeft = barEl.scrollLeft;
        if (Math.abs(hostEl.scrollLeft - targetScrollLeft) >= 0.5) {
          hostEl.scrollLeft = targetScrollLeft;
        }
      };

      const onHostScroll = (): void => {
        if (this.isDraggingBar || this.activeSource === 'bar') {
          return;
        }
        this.activeSource = 'host';
        scheduleSourceReset();
        const targetScrollLeft = hostEl.scrollLeft;
        if (Math.abs(barEl.scrollLeft - targetScrollLeft) >= 0.5) {
          barEl.scrollLeft = targetScrollLeft;
        }
      };

      const onWindowScroll = (): void => this.scheduleUpdateMetrics();
      const onWindowResize = (): void => this.scheduleUpdateMetrics();

      barEl.addEventListener('pointerdown', onBarPointerDown, { passive: true });
      window.addEventListener('pointerup', onBarPointerEnd, { passive: true });
      window.addEventListener('pointercancel', onBarPointerEnd, { passive: true });
      barEl.addEventListener('scroll', onBarScroll, { passive: true });
      hostEl.addEventListener('scroll', onHostScroll, { passive: true });
      window.addEventListener('scroll', onWindowScroll, { passive: true });
      window.addEventListener('resize', onWindowResize, { passive: true });

      this.cleanupListeners.push(
        () => barEl.removeEventListener('pointerdown', onBarPointerDown),
        () => window.removeEventListener('pointerup', onBarPointerEnd),
        () => window.removeEventListener('pointercancel', onBarPointerEnd),
        () => barEl.removeEventListener('scroll', onBarScroll),
        () => hostEl.removeEventListener('scroll', onHostScroll),
        () => window.removeEventListener('scroll', onWindowScroll),
        () => window.removeEventListener('resize', onWindowResize),
      );

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.scheduleUpdateMetrics());
        this.resizeObserver.observe(hostEl);
        this.resizeObserver.observe(parentEl);
        this.observeInnerTable();
      }

      if (typeof MutationObserver !== 'undefined') {
        this.mutationObserver = new MutationObserver(() => {
          this.observeInnerTable();
          this.scheduleUpdateMetrics();
        });
        this.mutationObserver.observe(hostEl, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }

      this.updateMetrics();
      this.scheduleUpdateMetrics();
      this.timerIds.push(
        window.setTimeout(() => this.scheduleUpdateMetrics(), 50),
        window.setTimeout(() => this.scheduleUpdateMetrics(), 250),
      );
    });
  }

  ngOnDestroy(): void {
    if (this.metricsRafId !== null) {
      cancelAnimationFrame(this.metricsRafId);
      this.metricsRafId = null;
    }
    if (this.sourceResetTimerId !== null) {
      clearTimeout(this.sourceResetTimerId);
      this.sourceResetTimerId = null;
    }
    for (const timerId of this.timerIds) {
      clearTimeout(timerId);
    }
    this.timerIds = [];

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.observedTable = null;

    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }
    this.cleanupListeners = [];

    const hostEl = this.el.nativeElement;
    this.renderer.removeClass(hostEl, 'has-sticky-scrollbar');
    if (this.parentEl) {
      this.renderer.removeClass(this.parentEl, 'has-sticky-scrollbar');
      this.parentEl = null;
    }

    if (this.barEl && this.barEl.parentNode) {
      this.renderer.removeChild(this.barEl.parentNode, this.barEl);
    }
    this.barEl = null;
    this.innerEl = null;
  }

  private observeInnerTable(): void {
    if (!this.resizeObserver) {
      return;
    }
    const tableEl = this.el.nativeElement.querySelector('table');
    if (tableEl && tableEl !== this.observedTable) {
      if (this.observedTable) {
        this.resizeObserver.unobserve(this.observedTable);
      }
      this.resizeObserver.observe(tableEl);
      this.observedTable = tableEl;
    }
  }

  private scheduleUpdateMetrics(): void {
    if (this.metricsRafId !== null) {
      return;
    }
    this.metricsRafId = requestAnimationFrame(() => {
      this.metricsRafId = null;
      this.updateMetrics();
    });
  }

  private updateMetrics(): void {
    const hostEl = this.el.nativeElement;
    const parentEl = this.parentEl;
    const barEl = this.barEl;
    const innerEl = this.innerEl;
    if (!parentEl || !barEl || !innerEl) {
      return;
    }

    const scrollWidth = hostEl.scrollWidth;
    const clientWidth = hostEl.clientWidth;
    const hostRect = hostEl.getBoundingClientRect();
    const wrapperRect = parentEl.getBoundingClientRect();

    const hasHorizontalOverflow = scrollWidth > clientWidth + 1;
    const isVisibleInViewport =
      hostRect.width > 0 &&
      wrapperRect.bottom > 48 &&
      hostRect.top < window.innerHeight - 24;

    const shouldShow = hasHorizontalOverflow && isVisibleInViewport;

    if (shouldShow) {
      const leftPx = Math.round(hostRect.left);
      const widthPx = Math.round(hostRect.width);
      const bottomPx = Math.max(0, Math.round(window.innerHeight - wrapperRect.bottom));
      const isPinned = bottomPx === 0;

      if (this.lastVisible !== true) {
        this.renderer.addClass(hostEl, 'has-sticky-scrollbar');
        this.renderer.addClass(parentEl, 'has-sticky-scrollbar');
        this.renderer.addClass(barEl, 'is-visible');
        this.lastVisible = true;
      }

      if (this.lastPinned !== isPinned) {
        if (isPinned) {
          this.renderer.addClass(barEl, 'is-pinned-viewport');
        } else {
          this.renderer.removeClass(barEl, 'is-pinned-viewport');
        }
        this.lastPinned = isPinned;
      }

      if (this.lastLeft !== leftPx) {
        this.renderer.setStyle(barEl, 'left', `${leftPx}px`);
        this.lastLeft = leftPx;
      }
      if (this.lastWidth !== widthPx) {
        this.renderer.setStyle(barEl, 'width', `${widthPx}px`);
        this.lastWidth = widthPx;
      }
      if (this.lastBottom !== bottomPx) {
        this.renderer.setStyle(barEl, 'bottom', `${bottomPx}px`);
        this.lastBottom = bottomPx;
      }
      if (this.lastScrollWidth !== scrollWidth) {
        this.renderer.setStyle(innerEl, 'width', `${scrollWidth}px`);
        this.lastScrollWidth = scrollWidth;
      }

      if (!this.isDraggingBar && this.activeSource !== 'bar') {
        const hostScrollLeft = hostEl.scrollLeft;
        if (Math.abs(barEl.scrollLeft - hostScrollLeft) >= 0.5) {
          barEl.scrollLeft = hostScrollLeft;
        }
      }
    } else if (this.lastVisible !== false) {
      this.renderer.removeClass(barEl, 'is-visible');
      this.renderer.removeClass(barEl, 'is-pinned-viewport');
      this.renderer.removeClass(hostEl, 'has-sticky-scrollbar');
      this.renderer.removeClass(parentEl, 'has-sticky-scrollbar');
      this.lastVisible = false;
      this.lastPinned = false;
    }
  }
}
