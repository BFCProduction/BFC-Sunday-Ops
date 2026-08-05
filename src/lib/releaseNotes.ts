export interface ReleaseNote {
  date: string
  label: string
  title: string
  summary: string
  points: string[]
}

export const changelogUrl = 'https://github.com/bfcproduction/BFC-Sunday-Ops/blob/main/CHANGELOG.md'

export const releaseNotes: ReleaseNote[] = [
  {
    date: 'Aug 4, 2026',
    label: 'Event & Workbook Modules',
    title: 'Crew, Supplies, and Intercom are now live modules',
    summary: 'Operational tools can now belong to one Event or be shared across a Workbook, with one consistent module workspace.',
    points: [
      'Crew, Supplies, and Intercom can be added at either the Event or Workbook level.',
      'Workbooks collect their attached Events’ modules behind a focused owner/module switcher.',
      'The old Send Update boundary is retired—these are live documents until the event is over.',
      'Managers organize modules; Admin-only pay, rates, and supply prices stay protected.',
    ],
  },
  {
    date: 'Jul 24, 2026',
    label: 'Sign-in & Data Entry',
    title: 'Switch accounts + save service data on Enter',
    summary: 'Two field-requested fixes for shared-device sign-in and faster, safer service-data entry.',
    points: [
      'New "Log in as someone else" button lets a different person sign in when Planning Center is already active on the device.',
      'On Runtimes, Attendance, and Loudness, pressing Enter now saves the value immediately.',
      'Entered data is no longer lost by leaving the page before clicking Save.',
    ],
  },
  {
    date: 'May 25, 2026',
    label: 'Workbooks',
    title: 'Multi-event scheduling',
    summary: 'A new Workbooks layer coordinates multi-event, multi-day productions above the individual event level.',
    points: [
      'Group events, rooms/locations, and schedule items (calls, rehearsals, meals, transitions, and more).',
      'Assign crew to schedule items and print a coordinated production schedule.',
      'Export a printable schedule for the whole production.',
    ],
  },
  {
    date: 'Apr 26, 2026',
    label: 'Evaluation',
    title: 'Admin response review moved into the app',
    summary: 'Admins can now review submitted post-service evaluations directly from Sunday Ops while operators keep a clean submission-only view.',
    points: [
      'Response summaries appear near the top of the Evaluation screen.',
      'Submitted notes and broken-moment details are visible to admins.',
      'Event report export still includes the full evaluation context.',
    ],
  },
  {
    date: 'Apr 25, 2026',
    label: 'Navigation',
    title: 'Home-first event navigation',
    summary: 'Sunday Ops now opens on a dedicated Home layer so teams can choose the right event before entering the event workspace.',
    points: [
      'Current, upcoming, and recent events share one timeline.',
      'Event rows show readiness, checklist progress, issues, and eval status.',
      'Desktop and mobile navigation now treat Home as the primary starting point.',
    ],
  },
  {
    date: 'Apr 25, 2026',
    label: 'Reliability',
    title: 'Event-native history cleanup',
    summary: 'Older issue and evaluation rows were reviewed so historical data lines up with the correct event instead of ambiguous Sunday-level records.',
    points: [
      'Review artifacts make future cleanup safer.',
      'YouTube imports now resolve event IDs before writing analytics.',
      'Riskier historical scripts gained explicit safety guards.',
    ],
  },
]
