import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PLAYABLE_SPECIES, isPlayableSpeciesId, type PlayableSpeciesId } from "@feed-chain/shared";
import { PixelSpeciesIcon } from "./PixelSpeciesIcon";
import type { PlayerSnapshot } from "../types";

const ROLE_SPECIES_ORDER: readonly PlayableSpeciesId[] = [
  "hawk",
  "weasel",
  "snake",
  "bulbul",
  "duck",
  "frog",
  "grasshopper",
  "caterpillar",
  "rabbit",
  "squirrel",
];
const ROLE_LEVEL_ORDER = ["apex", "secondary", "primary"] as const;

interface RoleAssignmentModalProps {
  player: PlayerSnapshot;
  assignedSpecies?: PlayableSpeciesId;
  playableSpecies: ReadonlySet<PlayableSpeciesId>;
  anchor: { x: number; y: number };
  onAssign: (species: PlayableSpeciesId) => void;
  onClose: () => void;
}

export function RoleAssignmentModal({
  player,
  assignedSpecies,
  playableSpecies,
  anchor,
  onAssign,
  onClose,
}: RoleAssignmentModalProps): JSX.Element {
  const dialogRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState(anchor);
  const currentSpecies = assignedSpecies ?? (isPlayableSpeciesId(player.species) ? player.species : undefined);
  const availableRoleSpecies = ROLE_SPECIES_ORDER
    .filter((speciesId) => playableSpecies.has(speciesId))
    .map((speciesId) => PLAYABLE_SPECIES.find((species) => species.id === speciesId))
    .filter((species): species is (typeof PLAYABLE_SPECIES)[number] => Boolean(species));
  const roleSpeciesByLevel = ROLE_LEVEL_ORDER
    .map((level) => ({ level, species: availableRoleSpecies.filter((species) => species.level === level) }))
    .filter(({ species }) => species.length);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const margin = 8;
    const nextPosition = {
      x: Math.min(Math.max(anchor.x, margin), Math.max(margin, window.innerWidth - dialog.offsetWidth - margin)),
      y: Math.min(Math.max(anchor.y, margin), Math.max(margin, window.innerHeight - dialog.offsetHeight - margin)),
    };
    setPosition((previous) => (
      previous.x === nextPosition.x && previous.y === nextPosition.y ? previous : nextPosition
    ));
  }, [anchor]);

  useEffect(() => {
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="role-assignment-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="role-assignment-modal"
        style={{ left: position.x, top: position.y }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-assignment-title"
        tabIndex={-1}
      >
        <h2 id="role-assignment-title">역할 배정</h2>
        <div className="role-assignment-options">
          {roleSpeciesByLevel.map(({ level, species }) => (
            <div key={level} className="role-assignment-row">
              {species.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  className={`role-assignment-option ${currentSpecies === role.id ? "active" : ""}`}
                  onClick={() => onAssign(role.id)}
                >
                  <PixelSpeciesIcon speciesId={role.id} />
                  <span>{role.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
