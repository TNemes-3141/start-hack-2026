"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";
import image from "@/public/images/image.png"

interface LandingImageProps {
  className?: string;
}

export default function LandingImage({ className }: LandingImageProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      if (!frameRef.current) return;

      gsap.set(frameRef.current, { transformOrigin: "top center" });
      gsap.to(frameRef.current, {
        scale: () => {
          if (!frameRef.current) return 1;
          const rect = frameRef.current.getBoundingClientRect();
          const widthScale = window.innerWidth / rect.width;
          const heightScale = window.innerHeight / rect.height;
          return Math.max(widthScale, heightScale);
        },
        y: () => -window.innerHeight * 0.3,
        borderRadius: 0,
        ease: "none",
        scrollTrigger: {
          trigger: frameRef.current,
          start: "top 25%",
          end: "+=900",
          pin: true,
          pinSpacing: true,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
    }, triggerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={triggerRef} className={cn("relative w-full", className)}>
      <div
        ref={frameRef}
        className="relative mx-auto aspect-2602/1608 w-full max-w-4xl overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-lg backdrop-blur-sm will-change-transform"
      >
        <Image
          src={image}
          alt="Dashboard preview"
          fill
          sizes="(max-width: 1024px) 100vw, 896px"
          className="object-cover"
        />
      </div>
    </div>
  );
}
