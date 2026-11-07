import assert from 'node:assert/strict';
import { fetchCourses, fetchPrograms } from '../../src/services/apiClient';
import { fetchSourceRecords } from '../../src/services/liveData';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
try {
  globalThis.fetch = async () => { throw new Error('Backend offline'); };
  const offlinePrograms = await fetchPrograms();
  const offlineCourses = await fetchCourses({});
  assert.equal(offlinePrograms.fromLiveBackend, false);
  assert.deepEqual(offlinePrograms.programs, []);
  assert.equal(offlineCourses.fromLiveBackend, false);
  assert.deepEqual(offlineCourses.courses, []);
  assert.equal(offlineCourses.total, 0);

  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ total: 30, courses: [{ course_number: '0702211' }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const secondPage = await fetchCourses({ page: 2, page_size: 25, program_id: 'LOCAL-CMP-BSC' });
  assert.equal(secondPage.fromLiveBackend, true);
  assert.equal(secondPage.total, 30);
  assert.match(requestedUrl, /page=2/);
  assert.match(requestedUrl, /program_id=LOCAL-CMP-BSC/);

  globalThis.fetch = async () => new Response(JSON.stringify({ sources: [
    { source_id: 'real', title: '', url: 'https://www.alquds.edu/catalog' },
    { source_id: 'empty', title: '', url: '' },
  ] }));
  const sources = await fetchSourceRecords();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].source_id, 'real');
  console.log('PASS: offline data stays empty, pagination reaches the API, and source links use loaded records');
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
}
