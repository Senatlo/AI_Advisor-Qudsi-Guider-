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
- Python tests: 19 passed after unavailable features were retired. These include real local Chroma with deterministic test embeddings and do not validate every imported dataset record.
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

## Prerequisite course-name lookup

Retrieval now follows one hop of course-number references in a catalog row's original prerequisite text. It adds matching same-program course records to the evidence before lower-ranked search hits, within the citation budget. Generic catalog records are fallback only; a name from another program is not silently substituted. Missing names are explicitly marked unavailable. This does not parse AND/OR rules or establish registration eligibility.

The screenshot query for `LOCAL-CMP-BSC` now retrieves `0702113`, `Programming Fundamentals for Eng.`, with the Computer Engineering catalog source. Retrieval evidence is saved in `local-prerequisite-retrieval-verification.json`. The full implementation is in `backend/rag/retriever.py`; regression checks are in `tests/python/test_vector_index.py`.

The exact screenshot question, `what is the prerequiset for data structure`, passed a live frontend-to-backend-to-Qwen check in 7.5 seconds. The final answer includes both `Programming Fundamentals for Eng.` and `0702113`; its citation list includes the same-program prerequisite record. See `local-prerequisite-chat-verification.json`.

An earlier live attempt produced an empty final answer despite retrieving the name. Local chat now requests `think=false` to obtain the direct final response and rejects empty response content instead of reporting it as an answered question. This follows Ollama's documented chat controls: https://github.com/ollama/ollama/blob/main/docs/capabilities/thinking.mdx. Regression tests are in `tests/python/test_ollama_responses.py`. The backend is running with these changes.

## Response language follows the page

The chat form sends `language: ar` or `language: en` from the page language selection. FastAPI validates and forwards it to retrieval/generation; the standalone fallback server forwards it too. The model receives an explicit response-language instruction independent of the question and history languages. Refusal and model-error messages have Arabic/English variants. Each generated answer retains its language and RTL/LTR direction; changing the page language affects new replies, not previously generated history.

Verified in the real browser form against local Qwen: an English prerequisite question on the Arabic page produced an Arabic response; after switching to English, an Arabic question produced an English response even with the previous Arabic turn in history. Captured requests, responses, and rendered directions are in `local-language-browser-verification.json`. These checks passed again after feature cleanup.

## Current active feature set

The application now exposes overview, chat, course explorer, and sources/data status only. The incomplete study planner, disconnected portal controls, demo UI/fallback data, and static benchmark claims were removed. Planner and portal public routes now return HTTP 404. Legacy fixtures remain only in tests. Live catalog browsing includes pagination and source-backed details. See `FEATURE_CLEANUP.md` for the removal inventory and verification evidence.

Live checks through the frontend proxy: Qwen 3.5 returned a sourced answer identifying course `0303201` as `Data Structures & Algorithms I`, with 4.0 credits. The initial check took 60.4 seconds; the final check took 54.6 seconds and was saved directly as UTF-8 with its request in `local-rag-chat-verification.json`. The running API also refused the unsupported housing-fees question. This verifies the tested retrieval and answer path, not every possible question or the correctness of the source curriculum.
