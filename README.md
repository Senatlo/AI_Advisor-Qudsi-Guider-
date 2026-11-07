# Al-Quds AI Academic Advisor | المرشد الأكاديمي الذكي — جامعة القدس

> **Independent Student Project Disclaimer**: This application is an independent student project built for the IEEE RAG Academic Advisor Hackathon. It is **not** an official system of, nor endorsed by, Al-Quds University. Prerequisite readiness and study plan evaluations are advisory only and never constitute official academic registration approval.

---

## 1. Mission & Non-Negotiable Architecture

**Al-Quds AI Academic Advisor** is a locally deployable catalog and RAG chat application scoped exclusively to **Al-Quds University** across **25 represented program and department entries**.

The active UI contains overview, chat, course explorer, and live sources/data status. Incomplete study planning and disconnected portal features have been removed, along with their public API routes. Demo data is retained only in test fixtures. See [FEATURE_CLEANUP.md](FEATURE_CLEANUP.md) for the removal inventory and current verification.

- **100% Local Model Inference (Zero Cloud LLM Runtime)**:
  - Chat inference runs locally via Ollama (`POST /api/chat`) using a configurable Qwen model (`OLLAMA_CHAT_MODEL`, documented optional default `qwen2.5:3b` if installed; discovered dynamically via `ollama list` or `GET /api/tags` and never silently substituted).
  - Multilingual semantic embeddings run locally via Ollama (`POST /api/embed`) using `OLLAMA_EMBED_MODEL` (default `bge-m3`).
  - **No Gemini, OpenAI, or remote cloud AI SDK** is ever called at application runtime.
- **RAG Only — Zero Model Fine-Tuning**:
  - Ingests official Al-Quds catalog CSVs and verified university bylaws into a local **SQLite + FTS5** relational store and **ChromaDB** vector store without altering model weights.
- **Advising scope**:
  - Chat explains catalog facts and follows prerequisite course references to their names. It does not establish registration eligibility. Legacy planner code remains for regression/reference only.
- **Explicit connection failures**:
  - If the backend is inaccessible, the app displays an unavailable state. It does not substitute illustrative answers, programs, or course rows.

---

## 2. Verified Dataset Inventory & Hard Exclusions

### Observed Dataset Scope (`alquds_expanded_dataset(1).zip`)
These metrics are enforced as import diagnostics in `backend/ingest/importer.py` (never treated as proof of curriculum completeness):

| Metric | Observed Count | Handling in System |
| :--- | ---: | :--- |
| Program-course records (`courses_master_official_only.csv`) | `1,617` | Preserved at row level (`row_id`); never naively deduplicated by course number alone |
| Distinct 7-digit course numbers | `1,099` | Stored and queried as `TEXT` strings preserving leading zeros (e.g., `0302101`) |
| Represented program / department entries | `25` | Assigned transparent `evidence_level` (`verified_planning`, `partial_planning`, `catalog_only`) |
| Prerequisite / corequisite rules (`prerequisite_rules.csv`) | `964` | Source diagnostics describe `912` parsed, `40` raw, and `12` ambiguous rules. The current importer treats all `964` as raw; eligibility planning is removed. Chat uses original catalog prerequisite text and name lookup. |
| Plan course requirements (`plan_course_requirements.csv`) | `1,617` | Labeled `recommended` — **never** treated as proof that every course is mandatory |
| Website conflicts (`website_conflicts.csv`) | `53` | Current count appears in data status; chat warns when retrieved courses have recorded source conflicts. Verify details against university sources. |
| Documented data gaps (`data_gaps.csv`) | `1,655` | Surfaced per course and program to transparently bound academic advice |

### Explicit Hard Exclusions
1. **`sections.csv`, `section_meetings.csv`, `rooms.csv`**: Contain **synthetic/generated demo timetables**, fake instructor assignments, weekdays, lecture times, and rooms. Strictly excluded at ingestion (`backend/ingest/importer.py`) and refused at query time (`refusal_type="excluded_synthetic_schedule"`).
2. **`IEEE_RAG_Student_Guide_Academic_Advisor_AR.pdf`**: The IEEE hackathon technical instructions document, **not** official Al-Quds University academic policy. Strictly blocked from entering the `policy_chunks` table.
3. **Placeholder Arabic Titles in `courses.csv`**: Detected via `is_placeholder_arabic_title()` in `backend/ingest/arabic_utils.py` and suppressed from official display.
4. **Departmental `MED` Listings**: Explicitly flagged (`is_departmental_listing_only = 1`) as departmental course listings, **not** a verified official MD degree plan.

---

## 3. Local Setup & Execution Instructions (Unix/macOS & Windows)

### Step 1: Configure `.env`
Copy `.env.example` to `.env`:

**Unix / macOS (bash/zsh):**
```bash
cp .env.example .env
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

### Step 2: Verify Local Ollama & Pull Required Models
Inspect your actually installed Qwen model tag first (do not expose Ollama to the public internet; keep it bound to `127.0.0.1:11434`):

```bash
ollama serve
ollama list
# Pull your preferred Qwen chat model (match OLLAMA_CHAT_MODEL in .env) and multilingual embedding model:
ollama pull qwen2.5:3b
ollama pull bge-m3
```

### Step 3: Set Up Python Virtual Environment & Ingest Dataset
Place `alquds_expanded_dataset(1).zip` in the project root (or pass its path via `--zip`).

**Unix / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Ingest dataset ZIP into local SQLite + FTS5
python3 -m backend.ingest.importer --zip "./alquds_expanded_dataset(1).zip"
```

**Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# Ingest dataset ZIP into local SQLite + FTS5
python -m backend.ingest.importer --zip ".\alquds_expanded_dataset(1).zip"
```

### Step 4: Build the Local Semantic Index

With Ollama running and `bge-m3` installed, run from the project root:

```powershell
.\.venv\Scripts\python.exe -m backend.ingest.index_vectors --batch-size 16
```

On Unix/macOS, use `python3 -m backend.ingest.index_vectors --batch-size 16`.
The command loads `.env`, embeds normalized catalog rows and already approved policy
chunks, and preserves each row's source citation and program identity. It excludes
raw demo schedule fields. Reruns skip unchanged records and remove obsolete IDs only
after all embedding batches succeed. Run this after importing updated source data,
with the backend stopped while the local persistent index is being updated.
The completed report is saved to `backend/data/chroma_index/index-report.json`
(or the configured `CHROMA_PERSIST_DIR`). No model weights are changed.

### Step 5: Start the Local Python FastAPI Backend (Port 8000)
```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload --env-file .env
```
*(Fallback if running in a minimal Python 3.10+ environment without FastAPI installed: `python3 -m backend.main`)*

### Step 6: Start the React + Vite Frontend (Port 3000)
```bash
npm install
npm run dev
```
Open `http://localhost:3000`. Vite automatically proxies `/api/*` requests to `http://127.0.0.1:8000`.

---

## 4. Running Automated Tests

Run the complete verification suite (Python unit/integration tests + TypeScript deterministic planner tests + TypeScript compiler check):

**Unix / macOS:**
```bash
bash scripts/run_tests.sh
```

**Windows / Cross-Platform Individual Commands:**
```bash
python3 -m unittest discover -s tests/python -v
npx tsx tests/frontend/test_planner_logic.ts
npx tsx tests/frontend/test_live_data.ts
npm run lint
npm run build
```

---

## 5. Privacy, Security & Portal Policy Constraints

- **No Real Student Personal Data**: In compliance with the IEEE hackathon rules, only manual student-entered records or synthetic test profiles are used. Do not import, record, or submit real students' personal transcripts or credentials.
- **University Portals (`https://student.alquds.edu/en/login` & `https://portal.alquds.edu/en/login`)**:
  - `StudentPortalAdapter` and `LecturerPortalAdapter` (`backend/portals/adapters.py`) are kept in a read-only `not_connected` / `unsupported_pending_verification` state until formal institutional permission and a verified test account are granted.
  - The React UI never renders a university password field, never stores credentials or cookies in `localStorage`, and never simulates login success.
  - Server-side session management enforces user-to-session binding (`user_id`), institutional role verification (`student` vs. `lecturer`), CSRF token verification, and 900-second session TTL.

---

## 6. AI-Assistance Disclosure & Hackathon Submission Notes

- **Development Environment**: Architectural scaffolding, Python FastAPI/SQLite/ChromaDB ingestion & RAG pipelines, deterministic study planner logic, React RTL/LTR interface, and automated test suites were generated and verified with AI engineering assistance in Google AI Studio Build.
- **Runtime Independence**: At runtime, the application operates **100% locally** via the user's local Ollama instance (`OLLAMA_CHAT_MODEL` and `OLLAMA_EMBED_MODEL`) and local SQLite/ChromaDB storage, with zero cloud LLM dependencies.
