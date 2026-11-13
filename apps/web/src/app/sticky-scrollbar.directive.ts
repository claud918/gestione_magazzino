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
  private syncRafId: number | null = null;
  private timerIds: number[] = [];
  private cleanupListeners: Array<() => void> = [];

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

      let syncingFrom: 'host' | 'bar' | null = null;

      const syncScroll = (from: 'host' | 'bar', source: HTMLElement, target: HTMLElement): void => {
        if (syncingFrom && syncingFrom !== from) {
          return;
        }
        if (target.scrollLeft === source.scrollLeft) {
          return;
        }
        syncingFrom = from;
        target.scrollLeft = source.scrollLeft;

        if (this.syncRafId !== null) {
          cancelAnimationFrame(this.syncRafId);
        }
        this.syncRafId = requestAnimationFrame(() => {
          syncingFrom = null;
          this.syncRafId = null;
        });
      };

      const onHostScroll = (): void => syncScroll('host', hostEl, barEl);
      const onBarScroll = (): void => syncScroll('bar', barEl, hostEl);
      const onWindowChange = (): void => this.scheduleUpdateMetrics();

      hostEl.addEventListener('scroll', onHostScroll, { passive: true });
      barEl.addEventListener('scroll', onBarScroll, { passive: true });
      window.addEventListener('scroll', onWindowChange, { passive: true, capture: true });
      window.addEventListener('resize', onWindowChange, { passive: true });

      this.cleanupListeners.push(
        () => hostEl.removeEventListener('scroll', onHostScroll),
        () => barEl.removeEventListener('scroll', onBarScroll),
        () => window.removeEventListener('scroll', onWindowChange, { capture: true }),
        () => window.removeEventListener('resize', onWindowChange),
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
    if (this.syncRafId !== null) {
      cancelAnimationFrame(this.syncRafId);
      this.syncRafId = null;
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

    if (hasHorizontalOverflow && isVisibleInViewport) {
      const bottomPx = Math.max(0, Math.round(window.innerHeight - wrapperRect.bottom));
      this.renderer.addClass(hostEl, 'has-sticky-scrollbar');
      this.renderer.addClass(parentEl, 'has-sticky-scrollbar');
      this.renderer.addClass(barEl, 'is-visible');
      if (bottomPx === 0) {
        this.renderer.addClass(barEl, 'is-pinned-viewport');
      } else {
        this.renderer.removeClass(barEl, 'is-pinned-viewport');
      }

      this.renderer.setStyle(barEl, 'left', `${Math.round(hostRect.left)}px`);
      this.renderer.setStyle(barEl, 'width', `${Math.round(hostRect.width)}px`);
      this.renderer.setStyle(barEl, 'bottom', `${bottomPx}px`);
      this.renderer.setStyle(innerEl, 'width', `${scrollWidth}px`);
      barEl.scrollLeft = hostEl.scrollLeft;
    } else {
      this.renderer.removeClass(barEl, 'is-visible');
      this.renderer.removeClass(barEl, 'is-pinned-viewport');
      this.renderer.removeClass(hostEl, 'has-sticky-scrollbar');
      this.renderer.removeClass(parentEl, 'has-sticky-scrollbar');
    }
  }
}
