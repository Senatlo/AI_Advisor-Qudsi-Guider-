# Active feature cleanup

Completed 2026-11-07 for the request to remove functionality that does not work.

## Kept in the application

- Arabic/English chat using the page language, local Qwen, BGE-M3 retrieval, source citations, and same-program prerequisite course-name lookup.
- Live catalog search, program filtering, course details, source links, and pagination.
- Overview counts and program lists loaded from the backend.
- Live source links and current dataset/index counts.
- Connection checks, explicit unavailable states, language switching, and mobile navigation.

## Removed from the application

- Study planner screen, completion/desire shortcuts, synthetic student profiles, and planner handoffs. Current imported prerequisites are not ready for eligibility evaluation.
- Portal settings screen and static portal status. University portal integration is not connected.
- Public `/api/planner/evaluate` and `/api/portal/status` routes, including the fallback HTTP server routes. Both now return HTTP 404.
- Chat demo cards and illustrative answers; fabricated catalog/program fallback rows; fake starter examples.
- Static evidence/conflict/gap cards and benchmark PASS labels. Source/data status now reads real backend values.
- Automatic retrieval benchmarks on `/api/evidence`; fetching sources no longer starts a benchmark.
- Five retired view components. Legacy sample data and the offline planner helper were moved to `tests/frontend/fixtures/catalog.ts` and `tests/frontend/offline_planner_fixture.ts`, outside application imports.

The local dataset, vector index, Ollama models, database backups, saved user browser data, and backend regression/reference code were preserved. Removing active features does not erase stored records.

## Verification

- TypeScript check and production build passed.
- All 19 Python tests passed, including checks that retired public routes return 404.
- Existing frontend planner/catalog invariants passed using test-only fixtures.
- New frontend live-data tests passed: backend failure yields empty unavailable data, not sample rows; page two reaches the API; source links use loaded records.
- Real browser checks passed for live overview counts, program-to-catalog handoff, 25-row pagination, catalog search, source-backed details, and live source links.
- A simulated catalog HTTP 503 displayed an unavailable message with no sample rows.
- Arabic and English live chat both returned prerequisite names and source citations. Clear Session was disabled during generation and cleared completed history successfully. Recent history now passes to the model in chronological order.
- At a 390-pixel mobile viewport the menu opened, catalog navigation closed it, and there was no page-level horizontal overflow.
- Running API: health and evidence returned HTTP 200, evidence contained 33 source records and no benchmark report, and both retired routes returned HTTP 404.

These are checks of the retained paths and known failure cases, not proof that every possible question or external university page is correct. Prerequisite eligibility evaluation and university bylaws remain unavailable. Catalog prerequisite text and course names remain usable in chat.

## Main implementation files

- `src/App.tsx`: active navigation, connection state, language, and view handoffs.
- `src/components/LiveOverview.tsx`: current counts and live program browsing.
- `src/components/LiveCourseExplorer.tsx`: real catalog rows, search, pagination, details.
- `src/components/LiveSourcesView.tsx` and `src/services/liveData.ts`: current sources and data status.
- `src/components/AdvisorChatView.tsx`: real chat only, correct history order, safe session clearing.
- `src/services/apiClient.ts`: live program/course requests without demo fallbacks.
- `backend/main.py` and `backend/service.py`: retired routes removed and lightweight evidence endpoint.
