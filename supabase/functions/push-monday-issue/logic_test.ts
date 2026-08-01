import {
  buildMondayItemName,
  buildMondayColumnValues,
  buildMondayUpdateBody,
  CLAIMABLE_SYNC_STATUSES,
  isMondaySyncComplete,
  isUuid,
  shouldCreateMondayItem,
} from './logic.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

Deno.test('validates UUID issue ids', () => {
  assertEquals(isUuid('2bb98b78-b96a-4a06-8c8e-7ee76025ef31'), true)
  assertEquals(isUuid('not-an-issue-id'), false)
})

Deno.test('normalizes and truncates Monday item names', () => {
  assertEquals(buildMondayItemName('  Audio   console offline  ', 'High'), 'Audio console offline')
  assertEquals(buildMondayItemName(' '.repeat(4), 'Critical'), 'Critical')

  const longName = buildMondayItemName('x'.repeat(100), 'Low')
  assertEquals(longName.length, 80)
  assertEquals(longName.endsWith('...'), true)
})

Deno.test('builds the canonical issue update with numbered photos', () => {
  assertEquals(
    buildMondayUpdateBody(
      '  Replace the failed cable.  ',
      'Medium',
      '2bb98b78-b96a-4a06-8c8e-7ee76025ef31',
      ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
    ),
    [
      'Severity: Medium',
      'Issue ID: 2bb98b78-b96a-4a06-8c8e-7ee76025ef31',
      '',
      'Replace the failed cable.',
      '',
      'Photos:',
      '1. https://example.com/one.jpg',
      '2. https://example.com/two.jpg',
    ].join('\n'),
  )
})

Deno.test('retries claim failed work and reuse a previously-created item', () => {
  assertEquals(CLAIMABLE_SYNC_STATUSES.includes('failed'), true)
  assertEquals(isMondaySyncComplete('failed'), false)
  assertEquals(isMondaySyncComplete('synced'), true)
  assertEquals(shouldCreateMondayItem(null), true)
  assertEquals(shouldCreateMondayItem('1234567890'), false)
})

Deno.test('stores the Sunday Ops issue id in Monday column values', () => {
  assertEquals(
    buildMondayColumnValues('text_issue_id', '2bb98b78-b96a-4a06-8c8e-7ee76025ef31', 'status', 'High'),
    JSON.stringify({
      text_issue_id: '2bb98b78-b96a-4a06-8c8e-7ee76025ef31',
      status: { label: 'High' },
    }),
  )
})
