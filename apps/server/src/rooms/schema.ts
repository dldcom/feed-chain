import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") species = "grasshopper";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") facingX = 0;
  @type("number") facingY = 1;
  @type("number") moveSpeed = 0;
  @type("number") boundsStage = 0;
  @type("string") status = "active";
  @type("number") score = 0;
  @type("number") hunger = 100;
  @type("number") wrongUntil = 0;
  @type("number") eatReadyAt = 0;
  @type("number") ghostUntil = 0;
  @type("number") skillReadyAt = 0;
  @type("number") skillActiveUntil = 0;
  @type("number") escapeUntil = 0;
  @type("boolean") shielded = false;
  @type("boolean") stealth = false;
  @type("boolean") connected = true;
  @type("number") eatAttempts = 0;
  @type("number") successfulEats = 0;
  @type("number") timesEaten = 0;
  @type("number") survivalMs = 0;
  @type("number") livesEnded = 0;
}

export class PlantState extends Schema {
  @type("string") id = "";
  @type("string") species = "grass";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("boolean") active = true;
  @type("number") respawnAt = 0;
}

export class AnimalNpcState extends Schema {
  @type("string") id = "";
  @type("string") species = "grasshopper";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hunger = 100;
  @type("number") meals = 0;
  @type("number") reproduceReadyAt = 0;
}

export class RelationState extends Schema {
  @type("string") prey = "";
  @type("string") predator = "";
  @type("number") count = 0;
}

export class IndividualRelationState extends Schema {
  @type("string") preyPlayerId = "";
  @type("string") predatorPlayerId = "";
  @type("string") preySpecies = "";
  @type("string") predatorSpecies = "";
  @type("number") count = 0;
}

export class GameState extends Schema {
  @type("string") phase = "lobby";
  @type("string") roomCode = "";
  @type("boolean") paused = false;
  @type("number") timeRemainingMs = 0;
  @type("number") shrinkStage = 0;
  @type("number") roundNumber = 0;
  @type("string") removedSpecies = "";
  @type("string") experimentJson = "";
  @type("number") expectedRelations = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: PlantState }) plants = new MapSchema<PlantState>();
  @type({ map: AnimalNpcState }) animals = new MapSchema<AnimalNpcState>();
  @type({ map: RelationState }) observedRelations = new MapSchema<RelationState>();
  @type({ map: RelationState }) blueRelations = new MapSchema<RelationState>();
  @type({ map: IndividualRelationState }) individualRelations = new MapSchema<IndividualRelationState>();
  @type(["string"]) announcements = new ArraySchema<string>();
}
