import { z } from "zod";
import { NUM_ROWS } from "../game/types";

// Invite codes deliberately omit characters that are easy to confuse when
// read aloud. Keeping this contract shared prevents REST and realtime joins
// from accepting different identifiers.
export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{5}$/, "Enter a valid invite code");

export const matchJoinPayloadSchema = z
  .object({ code: inviteCodeSchema })
  .strict();

const cardIdSchema = z
  .string()
  .regex(/^(?:[2-9]|1[0-4])[shdc]$/, "Invalid card");

export const placePayloadSchema = z
  .object({
    cardId: cardIdSchema,
    row: z.number().int().min(0).max(NUM_ROWS - 1),
  })
  .strict();

export const discardPayloadSchema = z
  .object({ cardId: cardIdSchema })
  .strict();
