import { NextFunction, RequestHandler, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AuthedRequest } from "../types/auth";
import { z, ZodError, ZodSchema } from "zod/v4";

function normaliseQueryKeys(q: Record<string, any>) {
  const cleaned: Record<string, any> = { ...q };

  for (const key of Object.keys(cleaned)) {
    if (key.endsWith("[]")) {
      const newKey = key.slice(0, -2);

      const val = cleaned[key];
      cleaned[newKey] = Array.isArray(val) ? val : [val];

      delete cleaned[key];
    }
  }
  return cleaned;
}

function validatedRoute<T extends ZodSchema>(
  schema: T,
  handler: (
    req: AuthedRequest<z.infer<T>>,
    res: Response,
    next: NextFunction
  ) => void,
  source: "body"
): RequestHandler[];

function validatedRoute<T extends ZodSchema>(
  schema: T,
  handler: (
    req: AuthedRequest<{}, z.infer<T>>,
    res: Response,
    next: NextFunction
  ) => void,
  source: "query"
): RequestHandler[];

function validatedRoute<T extends ZodSchema<any>>(
  schema: T,
  handler: (
    req: AuthedRequest<z.infer<T>>,
    res: Response,
    next: NextFunction
  ) => void,
  source: "body" | "query"
) {
  return [validate(schema, source), handler as RequestHandler];
}

function validate<T extends ZodSchema<any>>(
  schema: T,
  source: "body" | "query"
) {
  return (
    req: AuthedRequest<z.infer<T>>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const payload =
        source === "query" ? normaliseQueryKeys(req.query) : req.body;
      console.log("payload", payload);

      schema.parse(payload);
      if (source === "query") {
        Object.assign(req.query, payload);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        console.log(error.message);
        res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid body" });
      } else {
        console.log(error);
        res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ error: "Internal Server Error" });
      }
    }
  };
}

export { validatedRoute };
