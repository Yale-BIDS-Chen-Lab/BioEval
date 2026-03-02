import * as express from "express";
import { validatedRoute } from "../middleware/zod-validator";
import { z } from "zod/v4";
import { StatusCodes } from "http-status-codes";
import {
  createCustomParsingFunction,
  deleteCustomParsingFunction,
  getParsingFunctions,
  parsingFunctionExists,
} from "../db/queries/parsing";

const router = express.Router();

const createParsingFunctionSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
});

const deleteParsingFunctionSchema = z.object({
  funcId: z.string().min(1),
});

router.post(
  "/create",
  ...validatedRoute(createParsingFunctionSchema, async (req, res) => {
    const funcId = `custom_${req.user.id}_${Date.now()}`;

    // Collision is extremely unlikely given the timestamp, but guard anyway
    const exists = await parsingFunctionExists(funcId);
    if (exists) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        error: "Function ID already exists, please try again",
      });
    }

    try {
      const result = await createCustomParsingFunction(
        funcId,
        req.body.name,
        req.body.code,
        req.user.id
      );

      res.status(StatusCodes.CREATED).json({
        success: true,
        function: result,
      });
    } catch (error) {
      console.error("Error creating custom parsing function:", error);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: "Failed to create parsing function",
      });
    }
  }, "body")
);

// Get all parsing functions (built-in + user's custom)
router.get("/list", async (req: any, res) => {
  try {
    const functions = await getParsingFunctions(req.user.id);
    res.json({
      success: true,
      functions,
    });
  } catch (error) {
    console.error("Error fetching parsing functions:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: "Failed to fetch parsing functions",
    });
  }
});

router.delete(
  "/delete",
  ...validatedRoute(deleteParsingFunctionSchema, async (req, res) => {
    try {
      const funcId = req.body.funcId;
      const result = await deleteCustomParsingFunction(funcId, req.user.id);
      
      res.json({
        success: true,
        message: "Custom parsing function deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting custom parsing function:", error);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: "Failed to delete parsing function",
      });
    }
  }, "body")
);

export default router;

