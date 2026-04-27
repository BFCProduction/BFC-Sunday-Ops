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
