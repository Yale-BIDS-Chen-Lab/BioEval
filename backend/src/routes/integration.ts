import * as express from "express";
import { validatedRoute } from "../middleware/zod-validator";
import { z } from "zod/v4";
import { providerExists } from "../db/queries/provider";
import { StatusCodes } from "http-status-codes";
import { integrationsArguments } from "../schemas/user";
import {
  getIntegration,
  getIntegrations,
  getUserConfig,
  upsertIntegration,
} from "../db/queries/integration";
import Ajv2020 from "ajv/dist/2020";
import { AuthedRequest } from "../types/auth";

const router = express.Router();

const updateIntegrationSchema = z.object({
  providerId: z.string().nonempty(),
  settings: integrationsArguments,
});

// TODO: integration schema should be stored in the integrations table; settings should be a JSON field on user profile
router.post(
  "/update",
  ...validatedRoute(
    updateIntegrationSchema,
    async (req, res) => {
      const validProvider = await providerExists(req.body.providerId);
      if (!validProvider) {
        return res.status(StatusCodes.NOT_FOUND);
      }

      const integration = await getIntegration(req.body.providerId);
      if (!integration) {
        return res.status(StatusCodes.NOT_FOUND);
      }

      const ajv = new Ajv2020();
      const validate = ajv.compile(integration.schema);
      const valid = validate(req.body.settings);
      if (!valid) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: "Invalid integration settings",
        });
      }

      await upsertIntegration(
        req.body.providerId,
        req.user.id,
        req.body.settings
      );

      return res.status(StatusCodes.OK).json({ success: true });
    },
    "body"
  )
);

router.get("/list", async (req: AuthedRequest, res) => {
  const providers = await getIntegrations();
  const integrations = await Promise.all(
    providers.map(async (prov) => {
      const cfg = await getUserConfig(prov.providerId, req.user.id);
      console.log("config", cfg, "provider", prov);
      return {
        ...prov,
        settings: cfg?.settings ?? null,
      };
    })
  );

  res.json({
    success: true,
    integrations,
  });
});

export default router;
