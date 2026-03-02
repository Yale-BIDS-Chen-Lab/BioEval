import { fromNodeHeaders } from "better-auth/node";
import { NextFunction, Response } from "express";
import { AuthedRequest } from "../types/auth";
import { auth } from "../utils/auth";

async function authMiddleware(
  req: AuthedRequest<{}>,
  res: Response,
  next: NextFunction
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) {
    res.status(400).json({
      message: "Unauthorized",
    });
    return;
  }

  req.user = session.user;
  next();
}

export { authMiddleware };
