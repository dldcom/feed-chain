import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@feed-chain/shared";
import { GameScene } from "./GameScene";

export function GameCanvas(): JSX.Element {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: 1280,
      height: 720,
      backgroundColor: "#83c867",
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: "100%", height: "100%" },
      scene: [GameScene],
      render: { antialias: false, pixelArt: true, roundPixels: true },
    });
    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene("ecosystem");
      scene.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    });
    return () => game.destroy(true);
  }, []);

  return <div ref={host} className="game-canvas" aria-label="생태계 게임 맵" />;
}
