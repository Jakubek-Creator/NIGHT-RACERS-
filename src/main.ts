import Phaser from 'phaser';
import './style.css';
import { GameScene } from './scenes/GameScene';
import { loadSave } from './systems/Save';

async function boot() {
  const save = await loadSave();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#05060a',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    fps: { target: 60 },
    input: { mouse: { preventDefaultWheel: true } },
    scene: [new GameScene(save)],
  });
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

boot();
