/**
 * Frontend TypeScript unit tests verifying 7-digit course code preservation,
 * deterministic study planner states, credit deduplication, and degree audit refusal.
 *
 * Run with: npx tsx tests/frontend/test_planner_logic.ts
 */

import assert from 'node:assert/strict';
import {
  evaluateDeterministicPlanOffline,
  preserveSevenDigitCode,
} from '../../src/services/apiClient';
import {
  EXCLUDED_SYNTHETIC_ASSETS,
  EXPECTED_DATASET_DIAGNOSTICS,
  REPRESENTED_25_PROGRAMS,
} from '../../src/data/verifiedReferenceData';

function runFrontendTests(): void {
  // 1. Verify 25 represented programs and dataset diagnostic constants
  assert.equal(REPRESENTED_25_PROGRAMS.length, 25, 'Must represent all 25 program/department entries');
  assert.equal(EXPECTED_DATASET_DIAGNOSTICS.program_course_records, 1617);
  assert.equal(EXPECTED_DATASET_DIAGNOSTICS.distinct_course_numbers, 1099);
  assert.equal(EXPECTED_DATASET_DIAGNOSTICS.website_conflicts, 53);
  assert.equal(EXPECTED_DATASET_DIAGNOSTICS.data_gaps, 1655);
  assert.equal(EXPECTED_DATASET_DIAGNOSTICS.prerequisite_rules_total, 964);

  const medEntry = REPRESENTED_25_PROGRAMS.find((p) => p.program_code === 'MED');
  assert.ok(medEntry, 'MED departmental listing entry must exist');
  assert.equal(medEntry.is_departmental_listing_only, true);
  assert.equal(medEntry.evidence_level, 'catalog_only');

  // 2. Verify hard exclusions list
  const excludedFiles = EXCLUDED_SYNTHETIC_ASSETS.map((e) => e.file);
  assert.ok(excludedFiles.includes('sections.csv'));
  assert.ok(excludedFiles.includes('section_meetings.csv'));
  assert.ok(excludedFiles.includes('rooms.csv'));
  assert.ok(excludedFiles.includes('IEEE_RAG_Student_Guide_Academic_Advisor_AR.pdf'));

  // 3. Verify 7-digit leading zero course number preservation
  assert.equal(preserveSevenDigitCode('0302101'), '0302101');
  assert.equal(preserveSevenDigitCode('302101'), '0302101');

  // 4. Verify deterministic planner states and non-double-counted credit calculation
  const evalResult = evaluateDeterministicPlanOffline(
    'COMP-BS',
    [
      {
        course_number: '0302101',
        status: 'completed',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302101',
        status: 'completed',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302102',
        status: 'in_progress',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
      {
        course_number: '0302310',
        status: 'completed',
        is_repeat: false,
        is_transfer_or_substitution: false,
      },
    ],
    ['0302102', '0302204', '0302205', '0302310', '0302350', '0302499']
  );

  // 0302101 (3 cr) counted once; 0302310 has a recorded conflict (3 vs 4 cr) so excluded from verified credits
  assert.equal(evalResult.credits_summary.validated_completed_credits, 3);
  assert.deepEqual(evalResult.credits_summary.duplicate_completed_inputs_ignored, ['0302101']);
  assert.equal(evalResult.degree_audit_guaranteed, false);
  assert.equal(evalResult.official_graduation_percentage, null);

  const byCode = Object.fromEntries(
    evalResult.course_evaluations.map((e) => [e.course_number, e])
  );
  // 0302102 requires 0302101 (which is completed) -> requirements_met
  assert.equal(byCode['0302102'].readiness_state, 'requirements_met');
  // 0302204 requires 0302102 (which is only in_progress, not completed) -> missing_prerequisite
  assert.equal(byCode['0302204'].readiness_state, 'missing_prerequisite');
  // 0302205 has corequisite 0302204 -> corequisite_condition
  assert.equal(byCode['0302205'].readiness_state, 'corequisite_condition');
  // 0302350 has ambiguous rule -> needs_verification
  assert.equal(byCode['0302350'].readiness_state, 'needs_verification');
  // 0302499 has raw_only + department permission -> needs_verification
  assert.equal(byCode['0302499'].readiness_state, 'needs_verification');
  // 0302310 has website conflict -> needs_verification
  assert.equal(byCode['0302310'].readiness_state, 'needs_verification');

  console.log('ALL FRONTEND DETERMINISTIC PLANNER & CATALOG INVARIANT TESTS PASSED.');
}

runFrontendTests();
