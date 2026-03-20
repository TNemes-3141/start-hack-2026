"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import Dither from '@/components/Dither';
import Dot from "@/components/animata/background/dot";
import AbstractShape from "@/components/animata/abstract-shape";
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true) }, []);

  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();
    let offset = 0;

    const animate = (ts: number) => {
      const track = carouselTrackRef.current;
      if (!track) {
        rafId = requestAnimationFrame(animate);
        return;
      }

      const singleLoopWidth = track.scrollWidth / 2;
      if (singleLoopWidth > 0) {
        const delta = ts - lastTs;
        const speedPxPerSecond = 36;
        offset = (offset + (delta * speedPxPerSecond) / 1000) % singleLoopWidth;

        // Move left continuously; duplicate content makes this seamless.
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      }
      lastTs = ts;
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []);

  const folder = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const carouselImages = [
    { src: `/images/${folder}/image1.png`, alt: "Dashboard preview 1" },
    { src: `/images/${folder}/image2.png`, alt: "Dashboard preview 2" },
    { src: `/images/${folder}/image0.png`, alt: "Dashboard preview 3" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <Dot className="absolute top-0 inset-0 opacity-15" spacing={30} />
        <Dither
          waveColor={[0.5, 0.5, 0.5]}
          disableAnimation={false}
          enableMouseInteraction
          mouseRadius={0.3}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
          className="absolute top-0 inset-0 opacity-15"
        />
      </div>

      <main className="relative z-10 mx-auto grid min-h-screen w-full grid-cols-1 items-center p-8 text-center lg:grid-cols-12 lg:grid-rows-12">
        <h1 className="w-full max-w-4xl text-left text-[9vw] font-medium leading-none lg:col-start-1 lg:col-span-8 lg:row-start-1 lg:row-span-4 lg:self-start">
          PENROSE PROCURE
        </h1>
        <p className="w-full text-justify max-w-2xl text-sm text-muted-foreground sm:text-base lg:col-start-1 lg:col-span-7 lg:row-start-5 lg:row-span-2 lg:self-start">
          Penrose Procure automates procurement management and aids procurement auditing using a multi agentic model.
          Benefit from faster procurement services, more reliable auditing, and ease of use.
        </p>
        <nav className="text-xl flex justify-end gap-8 lg:col-start-9 lg:col-span-4 lg:row-start-1 lg:row-span-1 pr-6 z-10">
          <Link href="/procurement" className="underline underline-offset-5">Dashboard</Link>
          <Link href="/client" className="underline underline-offset-5">Client</Link>
        </nav>

<div className="hidden lg:flex flex-col gap-6 lg:col-start-9 lg:col-span-4 lg:row-start-2 lg:row-span-11 lg:self-stretch z-10 pr-6 py-8">
  {[
    { name: "Ian Wimmer",   photo: "/images/ian.jpeg",    company: "/images/thun.png" },
    { name: "Janosch Moor", photo: "/images/janosch.jpeg", company: "/images/google.png" },
    { name: "Rui Zhang",    photo: "/images/rui.jpeg",     company: "/images/imc.png" },
    { name: "Tamas Nemes",  photo: "/images/tamas.jpeg",  company: "/images/julich.png" },
  ].map((member) => (
    <div
      key={member.name}
      className="group relative flex items-center gap-6 rounded-3xl bg-gradient-to-br from-white/10 to-white/[0.02] backdrop-blur-md border border-white/10 p-4 transition-all duration-500 hover:scale-[1.02] hover:bg-white/[0.12] hover:border-white/20 shadow-2xl"
    >
      {/* Large Profile Image Container */}
      <div className="relative shrink-0">
        {/* Doubled size: size-28 (112px) */}
        <div className="size-28 rounded-2xl overflow-hidden ring-2 ring-white/10 group-hover:ring-white/30 transition-all shadow-inner">
          <img 
            src={member.photo} 
            alt={member.name} 
            className="w-full h-full object-cover object-top saturate-[0.8] group-hover:saturate-100 transition-all duration-500" 
          />
        </div>
        
        {/* Doubled Company Badge: size-10 (40px) */}
        <div className="absolute -bottom-2 -right-2 size-12 rounded-xl bg-white/90 backdrop-blur-md p-1.5 shadow-xl ring-1 ring-black/10 flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300">
          <img 
            src={member.company} 
            alt="company" 
            className="w-full h-full object-contain" 
          />
        </div>
      </div>

      {/* Text Info - Scaled up for balance */}
      <div className="flex flex-col gap-1">
        <span className="text-lg font-bold tracking-tight text-foreground leading-tight">
          {member.name}
        </span>
        <div className="flex items-center gap-2">
          <span className="h-px w-4 bg-blue-500/50" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-blue-400/80 font-black">
            Core Team
          </span>
        </div>
      </div>

      {/* Background Glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-blue-600 blur-[40px] transition-opacity -z-10 rounded-full" />
    </div>
  ))}
</div>

        {/* AbstractShape background */}
        <div className="h-full w-full justify-self-center lg:col-start-1 lg:col-span-12 lg:row-start-1 lg:row-span-12">
          <AbstractShape />
        </div>

        {/* Carousel — left side, bottom rows */}
        <div className="lg:col-start-1 lg:col-span-8 lg:row-start-7 lg:row-span-6 relative z-10 h-full overflow-hidden">
          <div
            ref={carouselTrackRef}
            className="flex h-full w-max items-end gap-2 will-change-transform"
          >
            {[...carouselImages, ...carouselImages].map((image, index) => (
              <Image
                key={`${image.alt}-${index}`}
                src={image.src}
                alt={image.alt}
                width={2984}
                height={1836}
                className="h-[300px] w-auto shrink-0 rounded-lg object-contain transition-transform duration-300 ease-out hover:z-10 hover:scale-101"
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
