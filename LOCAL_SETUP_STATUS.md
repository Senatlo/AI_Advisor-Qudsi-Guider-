# Local setup status

Verified on 2026-11-07 in this project folder.

## Installed and prepared

- Node.js 24.19.0 and Python 3.12.10 were already installed.
- Created `.env` from `.env.example` and a project-local `.venv`.
- Installed the packages in `backend/requirements.txt`; `pip check` passed.
- Installed frontend dependencies and generated `package-lock.json`.
- Updated the direct `esbuild` dependency to `^0.28.0` to resolve Vite 8's peer dependency conflict.
- Found existing Ollama at `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`; no replacement installation was needed.
- Downloaded `qwen2.5:3b` and `bge-m3`; both downloads completed with digest verification.
- Copied `../Third/alquds_expanded_dataset.zip` into this folder as `alquds_expanded_dataset(1).zip` and imported it into `backend/data/alquds_catalog.db`.
- The importer reported 1,617 course records, 1,099 distinct course numbers, and 25 program entries.

## Verification

- `npm run build`: passed.
- `npm run lint` (TypeScript check): passed.
- Existing frontend planner tests: passed.
- Python tests: 11 passed after semantic indexing was added. These include real local Chroma with deterministic test embeddings and do not validate every imported dataset record.
- FastAPI TestClient: health, knowledge status, programs, and course search returned HTTP 200.
- Health reports SQLite ready, dataset loaded, Ollama reachable, and both configured model tags installed.
- BGE-M3 local inference returned one 1,024-dimensional embedding.
- Qwen local inference returned `READY` with a 180-second timeout, then passed again with the normal 45-second timeout once warm. Its initial cold start exceeded 45 seconds; both backend and frontend chat currently use a 45-second timeout.

## Start the application

Run from this project folder. Keep Ollama running through its desktop application.

Backend, in PowerShell:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload --env-file .env
```

Frontend, in another PowerShell terminal:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Open http://localhost:3000. Inspect http://127.0.0.1:8000/api/health for readiness.
Backend and frontend are now running locally on ports 8000 and 3000. Their launch process IDs are recorded in `.local-runtime.json`; logs are in `backend-local.*.log` and `frontend-local.*.log`.

## Ollama connection verified

- Selected the newly installed `qwen3.5:4b` for chat in `.env`; embeddings remain `bge-m3`.
- Backend Ollama timeout is 180 seconds; frontend chat timeout is 195 seconds so the backend can return its response first.
- A real request through `http://127.0.0.1:3000/api/chat` returned `status=answered`, `model_used=qwen3.5:4b`, `ollama_connected=true`, and eight retrieved citations in 78.5 seconds. The response is saved in `local-chat-verification.json`.
- That initial response noted missing title/source fields. The catalog importer has since been corrected for the dataset's `master_row_id`, `course_name_en/ar`, `course_source_url`, and prerequisite-text columns; all 1,617 imported catalog rows now have a title and source URL.
- Changed the FastAPI chat handler to regular `def`, allowing its synchronous Ollama call to run in FastAPI's threadpool. A concurrency check verified that health requests respond while chat generation is blocked. See https://fastapi.tiangolo.com/async/ for the framework behavior.
- TypeScript check and frontend build passed after the timeout change.

## Remaining application and data limitations

- The real CSV uses `logic_status`, but the importer reads `parse_status`, `status`, or `parsing_status`. All 964 imported prerequisite rules therefore became `raw_only`, rather than the documented 912 parsed / 40 raw / 12 ambiguous split. This needs an importer compatibility fix and verification against the real dataset.
- Chroma now contains 1,617 BGE-M3 catalog vectors. English and Arabic semantic queries and unsupported fee-question refusals passed live local checks recorded in `local-semantic-verification.json`.
- No university policy chunks are loaded. Official university bylaws PDFs or their official source links are needed to add regulation evidence; the hackathon guide is excluded by project policy.
- University portal adapters remain disabled; basic local operation needs no university credentials.
- npm reported one low-severity advisory. No forced dependency upgrades were applied.

These findings distinguish installed dependencies from complete application functionality. Sources: local installer outputs, dataset import diagnostics, existing test output, API responses, `backend/ingest/importer.py`, and `backend/rag/retriever.py`.

## Refreshing the semantic knowledge base

Stop this project's backend before importing updated data and running:

```powershell
.\.venv\Scripts\python.exe -m backend.ingest.index_vectors --batch-size 16
```

The complete implementation is in `backend/ingest/index_vectors.py`. It embeds only normalized catalog passages and approved policy chunks, uses explicit local Ollama embeddings, retains per-program row identity and citations, skips unchanged hashes, and prunes obsolete IDs after successful completion. The repeat run embedded zero records and reused all 1,617 vectors. The embedding model's digest is recorded to reject mixing embeddings from changed model weights.

`SEMANTIC_MAX_DISTANCE=1.12` rejects distant neighbors using Chroma's default squared-L2 distance. This initial cutoff was checked against English/Arabic course queries and unrelated housing-fee queries, not a comprehensive relevance benchmark. Fee and regulation questions are refused while no policy chunks are loaded. These checks reduce unsupported matches; they do not establish perfect retrieval or academic correctness.

The pre-refresh SQLite backup is `backend/data/alquds_catalog.before-vectors.db`. Model weights were not changed. Index counts and model identity are available from `/api/knowledge/status` and `backend/data/chroma_index/index-report.json`.

Live checks through the frontend proxy: Qwen 3.5 returned a sourced answer identifying course `0303201` as `Data Structures & Algorithms I`, with 4.0 credits. The initial check took 60.4 seconds; the final check took 54.6 seconds and was saved directly as UTF-8 with its request in `local-rag-chat-verification.json`. The running API also refused the unsupported housing-fees question. This verifies the tested retrieval and answer path, not every possible question or the correctness of the source curriculum.
