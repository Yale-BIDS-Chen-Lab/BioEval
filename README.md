# BioEval

A web platform for benchmarking LLMs on biomedical NLP tasks.  
Supports inference via **Azure OpenAI** and **HuggingFace** (local GPU), with 12 built-in public benchmarks and the ability to **upload your own datasets**. Covers tasks including text generation, multiple-choice QA, named entity recognition, single-label classification, and multi-label classification.

![BioEval Overview](docs/overview.png)

---

## Prerequisites

| Requirement | Notes |
|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / Mac) or [Docker Engine](https://docs.docker.com/engine/install/) + [Compose plugin](https://docs.docker.com/compose/install/) (Linux) | Required for all platforms |
| NVIDIA GPU + [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) | Required only for local HuggingFace inference (**Linux only**). Azure OpenAI works on all platforms without a GPU. |

---

## Quick Start

```bash
git clone https://github.com/xuguang-ai/medreporter-project.git
cd medreporter-project/docker-files
cp .env.example .env
docker compose up --build
```

Open **http://localhost:3000**, create an account, and add an integration under **Settings**.

---

## Platform Notes

### Windows

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/) and enable the **WSL 2** backend.
2. GPU inference is only supported on Linux — use the **Azure OpenAI** integration on Windows.
3. Open **PowerShell** or **Windows Terminal (WSL)**:
   ```bash
   cd docker-files
   docker compose up --build
   ```

### macOS

1. Install [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/).
2. NVIDIA GPU is not supported on macOS — use the **Azure OpenAI** integration for inference.
3. Open **Terminal**:
   ```bash
   cd docker-files
   docker compose up --build
   ```

### Linux

1. Install [Docker Engine](https://docs.docker.com/engine/install/) and the [Compose plugin](https://docs.docker.com/compose/install/linux/).
2. For GPU support, install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html):
   ```bash
   # Ubuntu / Debian
   curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
   curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
     sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
     sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
   sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```
3. Run:
   ```bash
   cd docker-files
   docker compose up --build
   ```
   For HuggingFace inference with GPU:
   ```bash
   cd docker-files
   docker compose -f docker-compose.yml -f docker-compose-gpu.yml up --build
   ```

---

## Remote Server Access

If BioEval is running on a remote Linux server, forward the ports over SSH:

```bash
ssh -L 3000:localhost:3000 -L 3001:localhost:3001 user@your-server-ip
```

Then open **http://localhost:3000** in your local browser.

---

## Stopping & Resetting

```bash
# Stop all services
docker compose down

# Stop and delete all data (database, model outputs, datasets)
docker compose down -v
```

---

## License

This project is licensed under **CC BY-NC-ND 4.0**. See the `LICENSE` file for details.
