# Contributing to BioEval

Thanks for your interest in contributing to BioEval.

We welcome contributions across:
- bug fixes
- UI and UX improvements
- new datasets and benchmark workflows
- new models, parsers, and metric functions
- documentation improvements

## Before You Start

- Please open an issue for substantial changes before starting implementation.
- Keep pull requests focused. Small, reviewable changes are much easier to merge.
- If your change affects evaluation logic, inference behavior, or ranking logic, include a short note on how you validated it.

## Local Development

### Default Docker Setup

```bash
cd docker-files
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`.

### macOS with Local HuggingFace on Apple GPU

Use this path if you want Docker for the shared services but want `inference-service`
to run natively on macOS and use `mps`.

```bash
cd docker-files
cp .env.example .env
./start-macos-host-stack.sh
```

In a second terminal:

```bash
cd inference-service
./scripts/run-macos-host.sh
```

Important:
- Do not run the Docker `inference` service and the macOS host-native worker at the same time.
- If you are switching from the all-Docker path, stop the full stack first:

```bash
cd docker-files
docker compose down
```

## Validation

Please run the smallest relevant checks for your change.

### Frontend

```bash
cd frontend
npm run build
```

If you add or change component behavior, consider:

```bash
cd frontend
npm test
```

### Backend

```bash
cd backend
npm run build
```

### Inference Service

For Python syntax checks:

```bash
cd inference-service
python3 -m py_compile src/__main__.py
```

If you change a specific module, it is fine to validate just that file, for example:

```bash
cd inference-service
python3 -m py_compile src/inference/huggingface.py
```

## Contribution Guidelines

- Preserve the current product behavior unless the change is intentional and documented.
- Prefer explicit configuration over fragile model-name heuristics when adding provider-specific behavior.
- Avoid mixing unrelated UI, backend, and inference changes in one pull request.
- Keep copy concise and user-facing explanations clear.
- If you add a new model, metric, or parser, update any related seed/config code and validate the full path.

## Pull Requests

Please include:
- a short summary of the change
- why the change is needed
- how you tested it
- screenshots for UI changes when helpful

## Need Help?

- If you run into issues, please open a GitHub issue and include your environment and logs when possible.
- If you need help extending BioEval with new models, metrics, or benchmark workflows, please email `xuguang.ai@outlook.com`.
