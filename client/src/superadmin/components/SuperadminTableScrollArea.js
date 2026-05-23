import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

function getScrollState(node) {
  if (!node) {
    return { canScrollLeft: false, canScrollRight: false, hasOverflow: false };
  }

  const maxLeft = node.scrollWidth - node.clientWidth;
  return {
    canScrollLeft: node.scrollLeft > 8,
    canScrollRight: node.scrollLeft < maxLeft - 8,
    hasOverflow: maxLeft > 8,
  };
}

export function SuperadminTableScrollArea({
  children,
  className,
  viewportClassName,
}) {
  const viewportRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
  });

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return undefined;
    }

    const updateState = () => setScrollState(getScrollState(node));
    updateState();

    const resizeObserver = new ResizeObserver(updateState);
    resizeObserver.observe(node);
    window.addEventListener("resize", updateState);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateState);
    };
  }, []);

  const handleScrollBy = (direction) => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    node.scrollBy({
      left: Math.max(node.clientWidth * 0.8, 280) * direction,
      behavior: "smooth",
    });

    window.requestAnimationFrame(() => {
      setScrollState(getScrollState(node));
    });
  };

  return (
    <div className={className}>
      {scrollState.hasOverflow ? (
        <div className="mb-3 flex items-center justify-end gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Table scroll
          </span>
          <button
            type="button"
            onClick={() => handleScrollBy(-1)}
            disabled={!scrollState.canScrollLeft}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleScrollBy(1)}
            disabled={!scrollState.canScrollRight}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        onScroll={() => setScrollState(getScrollState(viewportRef.current))}
        className={cn("overflow-x-auto scroll-smooth scrollbar-hide", viewportClassName)}
      >
        {children}
      </div>
    </div>
  );
}
