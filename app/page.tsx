"use client";

import { useEffect, useRef } from "react";
import Dither from '@/components/Dither';
import Dot from "@/components/animata/background/dot";
import AbstractShape from "@/components/animata/abstract-shape";
import image0 from "@/public/images/image0.png"
import image1 from "@/public/images/image1.png"
import image2 from "@/public/images/image2.png"
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  const carouselTrackRef = useRef<HTMLDivElement>(null);

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

  const carouselImages = [
    { src: image1, alt: "Dashboard preview 1" },
    { src: image2, alt: "Dashboard preview 2" },
    { src: image0, alt: "Dashboard preview 3" },
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
        <h1 className="w-full max-w-4xl text-left text-[9vw] text font-medium leading-none lg:col-start-1 lg:col-span-8 lg:row-start-1 lg:row-span-5 lg:self-start">
          TEST
        </h1>
        <p className="w-full text-justify max-w-3xl text-sm text-muted-foreground sm:text-base lg:col-start-9 lg:col-span-4 lg:row-start-7 lg:row-span-2 lg:self-end pb-10">
          Penrose Function turns market complexity into clarity, combining data,
          context, and intelligent analysis so you can move from research to
          confident decisions faster.
        </p>
        <nav className="text-xl flex justify-between lg:col-start-9 lg:col-span-4 lg:row-start-1 lg:row-span-1 pr-14 z-10">
          <Link href="/procurement" className="underline underline-offset-5">Dashboard</Link>
          <Link href="/client" className="underline underline-offset-5">Client</Link>
        </nav>
        <div className="h-full w-full justify-self-center lg:col-start-1 lg:col-span-12 lg:row-start-1 lg:row-span-12">
          <AbstractShape />
        </div>
        <div className="lg:col-start-1 lg:col-span-12 lg:row-start-8 lg:row-span-5 relative h-full overflow-hidden">
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
