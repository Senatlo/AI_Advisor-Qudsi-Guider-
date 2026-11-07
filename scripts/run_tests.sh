#!/usr/bin/env bash
set -euo pipefail

echo "=== 1. Running Python Backend Unit & Integration Tests ==="
python3 -m unittest discover -s tests/python -v

echo "=== 2. Running Frontend TypeScript Deterministic Planner Tests ==="
npx tsx tests/frontend/test_planner_logic.ts

echo "=== 3. Running TypeScript Typecheck (npm run lint) ==="
npm run lint

echo "=== All Verified Test Suites Passed ==="
