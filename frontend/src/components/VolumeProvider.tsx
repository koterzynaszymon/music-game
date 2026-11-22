import { useState, type ReactNode } from "react";
import { loadVolume, saveVolume, VolumeContext } from "../lib/volume.ts";

// Holds the one volume for the whole app. Wrap the app in it (see main.tsx).
export default function VolumeProvider({ children }: { children: ReactNode }) {
  const [volume, setVolumeState] = useState(loadVolume);

  function setVolume(newVolume: number) {
    setVolumeState(newVolume);  
    saveVolume(newVolume); 
  }


  return <VolumeContext value={{ volume, setVolume }}>{children}</VolumeContext>;
}
