import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { PlayableSpeciesId } from "@feed-chain/shared";
import { GameTestScene, type GameTestStatus } from "./GameTestScene";

interface GameTestCanvasProps {
  speciesId: PlayableSpeciesId;
  onReady: (scene: GameTestScene | null) => void;
  onStatus: (status: GameTestStatus) => void;
}

export function GameTestCanvas({ speciesId, onReady, onStatus }: GameTestCanvasProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameTestScene | null>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    if (!host.current) return;
    const scene = new GameTestScene({
      initialSpeciesId: speciesId,
      onReady: (readyScene) => {
        sceneRef.current = readyScene;
        onReady(readyScene);
      },
      onStatus: (status) => statusRef.current(status),
    });
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: 960,
      height: 540,
      backgroundColor: "#5e9c48",
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: "100%", height: "100%" },
      scene: [scene],
      render: { antialias: false, pixelArt: true, roundPixels: true },
    });
    return () => {
      onReady(null);
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setSpecies(speciesId);
  }, [speciesId]);

  return <div ref={host} className="game-test-canvas" aria-label="역할과 스킬을 시험하는 생태계 맵" />;
}
