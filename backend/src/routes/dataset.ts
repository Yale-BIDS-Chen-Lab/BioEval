import * as express from "express";
import * as fs from "fs";
import { StatusCodes } from "http-status-codes";
import * as multer from "multer";
import * as os from "os";
import { ParquetWriter } from "parquetjs";
import * as path from "path";
import {
  createDataset,
  datasetExists,
  deleteDataset,
  getDatasetObject,
  getDatasetObjectKey,
  getDatasets,
} from "../db/queries/dataset";
import { getTasks, taskExists } from "../db/queries/task";
import { validatedRoute } from "../middleware/zod-validator";
import {
  datasetRowParquetSchema,
  datasetRowSchema,
  getDatasetSchema,
  uploadDatasetSchema,
} from "../schemas/dataset";
import { S3Connection } from "../storage/duckdb";
import { minioClient } from "../storage/minio";
import { AuthedRequest } from "../types/auth";
import { randomId } from "../utils/misc";
import { NewDataset } from "../db/schema";
import { 
  getDatasetInferenceIds, 
  deleteInference 
} from "../db/queries/inference";
import { deleteEvaluationsByInference } from "../db/queries/evaluation";
import { deleteNotesByInference } from "../db/queries/note";
import { deleteHighlightsByInference } from "../db/queries/highlight";
import { z } from "zod/v4";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get(
  "/get",
  ...validatedRoute(
    getDatasetSchema,
    async (req, res) => {
      const dataset = await getDatasetObject(req.query.datasetId, req.user.id);
      if (!dataset) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          error: "Dataset doesn't exist",
        });
      }

      res.json({
        success: true,
        dataset,
      });
    },
    "query"
  )
);

router.get(
  "/dataview",
  ...validatedRoute(
    getDatasetSchema,
    async (req, res) => {
      const dataset = await getDatasetObject(req.query.datasetId, req.user.id);
      if (!dataset) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          error: "Dataset doesn't exist",
        });
      }

      const s3conn = await new S3Connection().connect();
      s3conn.createTable("dataset", dataset.objectKey);

      const result = await s3conn.con.runAndReadAll("SELECT * from dataset");
      const records = result.getRowObjectsJson();

      await s3conn.dispose();

      res.json({
        success: true,
        records,
        name: dataset.name,
      });
    },
    "query"
  )
);

router.get("/list", async (req: AuthedRequest, res) => {
  const datasets = await getDatasets(req.user.id);

  res.json({
    success: true,
    datasets,
  });
});

router.get("/create-options", async (req, res) => {
  const tasks = await getTasks();

  res.json({
    success: true,
    tasks,
  });
});

router.get(
  "/get-default-prompt",
  ...validatedRoute(
    getDatasetSchema,
    async (req, res) => {
      const dataset = await getDatasetObject(req.query.datasetId, req.user.id);

      res.json({
        success: true,
        defaultPrompt: dataset.defaultPrompt,
      });
    },
    "query"
  )
);

router.put(
  "/upload-custom",
  upload.single("datasetFile"),
  async (req, res, next) => {
    req.body.datasetFile = req.file;
    next();
  },
  ...validatedRoute(
    uploadDatasetSchema,
    async (req, res) => {
      if (!(await taskExists(req.body.taskId))) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: "Invalid task",
        });
      }

      const isSpan = req.body.taskId == "ner" || req.body.taskId == "mlc";
      if (isSpan && !Array.isArray(req.body.classes)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: "Please input your classes",
        });
      }

      let datasetJson;
      try {
        datasetJson = JSON.parse(req.body.datasetFile.buffer.toString("utf-8"));
      } catch (e) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: "Invalid JSON file",
        });
      }
      if (!Array.isArray(datasetJson)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: "Invalid JSON file",
        });
      }

      const datasetId = randomId(12);
      const objectKey = `${datasetId}.parquet`;

      const tempPath = path.join(os.tmpdir(), objectKey);
      const writer = await ParquetWriter.openFile(
        datasetRowParquetSchema,
        tempPath
      );

      const formatRow = (row) => {
        if (!isSpan) {
          return row;
        }

        if (
          typeof row === "object" &&
          !Array.isArray(row) &&
          row.hasOwnProperty("reference")
        ) {
          return {
            reference: JSON.stringify(row.reference),
            ...row,
          };
        }

        return row;
      };

      for (const row of datasetJson) {
        const formattedRow = formatRow(row);
        const parsedRecord = await datasetRowSchema.safeParseAsync(
          formattedRow
        );
        if (!parsedRecord.success) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            error: "Invalid JSON file",
          });
        }

        await writer.appendRow({
          id: parsedRecord.data.id,
          input: parsedRecord.data.input_raw,
          reference: parsedRecord.data.reference,
        });
      }
      await writer.close();

      await minioClient.fPutObject("dataset", objectKey, tempPath);
      fs.unlinkSync(tempPath);

      const classes = isSpan ? req.body.classes : null;

      const newDataset: NewDataset = {
        datasetId,
        name: req.body.name,
        description: req.body.description,
        defaultPrompt: req.body.defaultPrompt,
        taskId: req.body.taskId,
        objectKey,
        isPublic: false,
        ownerId: req.user.id,
        classes,
      };
      await createDataset(newDataset);

      res.json({
        success: true,
        message: "Uploaded custom dataset",
      });
    },
    "body"
  )
);

const deleteDatasetSchema = z.object({
  datasetId: z.string().nonempty(),
});

router.post(
  "/delete",
  ...validatedRoute(
    deleteDatasetSchema,
    async (req, res) => {
      const { datasetId } = req.body;

      const ok = await datasetExists(datasetId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Dataset doesn't exist" });
      }

      // Get the object key before deleting
      const datasetObj = await getDatasetObject(datasetId, req.user.id);
      const objectKey = datasetObj?.objectKey;

      // Cascade delete: Get all inferences using this dataset and delete them
      const inferenceIds = await getDatasetInferenceIds(datasetId, req.user.id);
      
      // Delete all related data for each inference
      for (const inferenceId of inferenceIds) {
        await deleteEvaluationsByInference(inferenceId, req.user.id);
        await deleteNotesByInference(inferenceId);
        await deleteHighlightsByInference(inferenceId);
        await deleteInference(inferenceId, req.user.id);
      }

      // Delete the dataset file from MinIO storage
      if (objectKey) {
        try {
          await minioClient.removeObject("dataset", objectKey);
        } catch (error) {
          console.error("Failed to delete dataset file from MinIO:", error);
          // Continue with database deletion even if file deletion fails
        }
      }

      // Finally delete the dataset itself
      await deleteDataset(datasetId, req.user.id);
      return res.json({ success: true });
    },
    "body"
  )
);

export default router;
