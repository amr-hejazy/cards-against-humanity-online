import type { GameMode } from "@cah/shared";
import { GameModeStrategy } from "./GameModeStrategy";
import { NormalStrategy } from "./normal";
import { RandoCardrissianStrategy } from "./rando-cardrissian";
import { CzarIsDeadStrategy } from "./czar-is-dead";
import { BlankOnlyStrategy } from "./blank-only";

const registry: Record<string, new () => GameModeStrategy> = {
  normal: NormalStrategy,
  rando_cardrissian: RandoCardrissianStrategy,
  czar_is_dead: CzarIsDeadStrategy,
  blank_only: BlankOnlyStrategy,
};

export function getStrategy(mode: GameMode): GameModeStrategy {
  const Ctor = registry[mode];
  if (!Ctor) {
    return new NormalStrategy();
  }
  return new Ctor();
}

export { GameModeStrategy } from "./GameModeStrategy";
export { NormalStrategy } from "./normal";
export { RandoCardrissianStrategy } from "./rando-cardrissian";
export { CzarIsDeadStrategy } from "./czar-is-dead";
export { BlankOnlyStrategy } from "./blank-only";
