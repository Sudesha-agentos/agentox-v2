import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Lenis from "lenis";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let active: Lenis | null = null;

/** Slow, inertial page scroll. Off for people who prefer reduced motion. */
export function useSmoothScroll() {
  useEffect(() => {
    if (reduced()) return;
    const lenis = new Lenis({ duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4), wheelMultiplier: 0.85, touchMultiplier: 1.2 });
    active = lenis;
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      active = null;
    };
  }, []);
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (active) active.scrollTo(el, { offset: -72, duration: 1.8 });
  else el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
}

/** Fades content up once it enters the viewport. */
export function Reveal({ children, delay = 0, className, as: Tag = "div", style }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li"; style?: CSSProperties }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) return setShown(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={`reveal ${shown ? "in" : ""} ${className ?? ""}`} style={{ ...style, transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** 0 → 1 progress of an element through the viewport, for subtle parallax. */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        setP(Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height))));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return [ref, p] as const;
}
