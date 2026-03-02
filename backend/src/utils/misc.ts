import { randomBytes } from "crypto";

export function randomId(size: number) {
  return randomBytes(size).toString("hex");
}
