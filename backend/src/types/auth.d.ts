import { Request } from "express";
import { auth } from "../utils/auth";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type User = Session["user"];

export interface AuthedRequest<T = any, U = any> extends Request<{}, {}, T, U> {
  user: User;
}
