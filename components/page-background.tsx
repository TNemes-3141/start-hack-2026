import Dither from "@/components/Dither"
import Dot from "@/components/animata/background/dot"

export function PageBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <Dot className="absolute inset-0 opacity-15" spacing={30} />
      <Dither
        waveColor={[0.5, 0.5, 0.5]}
        disableAnimation={false}
        enableMouseInteraction
        mouseRadius={0.3}
        colorNum={4}
        waveAmplitude={0.3}
        waveFrequency={3}
        waveSpeed={0.05}
        className="absolute inset-0 opacity-15"
      />
    </div>
  )
}
