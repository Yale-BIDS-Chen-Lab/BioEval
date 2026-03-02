import * as express from "express";
import {
  createProject,
  deleteProject,
  getUserProjects,
  projectExists,
  renameProject,
} from "../db/queries/project";
import { NewProject } from "../db/schema";
import { validatedRoute } from "../middleware/zod-validator";
import { createProjectSchema } from "../schemas/project";
import { AuthedRequest } from "../types/auth";
import { randomId } from "../utils/misc";
import { z } from "zod/v4";
import { StatusCodes } from "http-status-codes";
import { 
  getProjectInferenceIds, 
  deleteInference 
} from "../db/queries/inference";
import { deleteEvaluationsByInference } from "../db/queries/evaluation";
import { deleteNotesByInference } from "../db/queries/note";
import { deleteHighlightsByInference } from "../db/queries/highlight";

const router = express.Router();

router.post(
  "/create",
  ...validatedRoute(
    createProjectSchema,
    async (req, res) => {
      const newProject: NewProject = {
        userId: req.user.id,
        projectId: randomId(12),
        name: req.body.name,
      };
      await createProject(newProject);
      res.json({ success: true, message: "Created project." });
    },
    "body"
  )
);

// TODO: add pagination
router.get("/list", async (req: AuthedRequest<{}>, res) => {
  const userProjects = await getUserProjects(req.user.id);
  res.json({ success: true, projects: userProjects });
});

const renameProjectSchema = z.object({
  projectId: z.string().nonempty(),
  name: z.string().nonempty().max(100),
});

router.post(
  "/rename",
  ...validatedRoute(
    renameProjectSchema,
    async (req, res) => {
      const { projectId, name } = req.body;

      const ok = await projectExists(projectId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Project doesn't exist" });
      }

      await renameProject(projectId, req.user.id, name);
      return res.json({ success: true });
    },
    "body"
  )
);

const deleteProjectSchema = z.object({
  projectId: z.string().nonempty(),
});

router.post(
  "/delete",
  ...validatedRoute(
    deleteProjectSchema,
    async (req, res) => {
      const { projectId } = req.body;

      const ok = await projectExists(projectId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Project doesn't exist" });
      }

      // Cascade delete: Get all inferences in this project and delete them
      const inferenceIds = await getProjectInferenceIds(projectId, req.user.id);
      
      // Delete all related data for each inference
      for (const inferenceId of inferenceIds) {
        await deleteEvaluationsByInference(inferenceId, req.user.id);
        await deleteNotesByInference(inferenceId);
        await deleteHighlightsByInference(inferenceId);
        await deleteInference(inferenceId, req.user.id);
      }

      // Finally delete the project itself
      await deleteProject(projectId, req.user.id);
      return res.json({ success: true });
    },
    "body"
  )
);

export default router;
