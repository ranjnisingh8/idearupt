import { useEffect, useRef } from "react";

/**
 * Hook that adds scroll-reveal animation to the referenced element.
 * Uses IntersectionObserver for performant scroll-triggered animations.
 */
export const useScrollReveal = <T extends HTMLElement = HTMLDivElement>(
  options?: { threshold?: number; delay?: number }
) => {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Add initial hidden state
    el.classList.add("scroll-reveal");
    if (options?.delay) {
      el.style.transitionDelay = `${options.delay}ms`;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: options?.threshold ?? 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [options?.threshold, options?.delay]);

  return ref;
};
