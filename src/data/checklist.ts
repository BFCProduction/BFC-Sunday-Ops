import type { ChecklistItem } from '../types'

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  // ControlFlex
  { id: 1,  task: 'Amp Power', role: 'A1', section: 'ControlFlex' },
  { id: 2,  task: 'Main Projector Power (on at 8:15am)', role: 'Video', section: 'ControlFlex' },
  { id: 3,  task: 'Confidence Projector Power', role: 'Video', section: 'ControlFlex' },
  { id: 4,  task: 'Confidence Screen Power', role: 'Video', section: 'ControlFlex' },
  { id: 5,  task: 'Multiviewer Power', role: 'Video', section: 'ControlFlex' },
  { id: 6,  task: 'Lighting Power', role: 'Lighting', section: 'ControlFlex' },
  { id: 7,  task: 'House Lights are off on keypad', role: 'Lighting', section: 'ControlFlex' },
  { id: 8,  task: 'Keypad locked', role: 'Lighting', section: 'ControlFlex' },
  { id: 9,  task: 'Curtain Motors functional', role: 'A1', section: 'ControlFlex' },
  // FOH Audio - DiGiCo SD12
  { id: 10, task: 'Console is on', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12', note: 'Two power switches on back right of console' },
  { id: 11, task: 'Correct session is loaded', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12', note: 'See Loading a Session on the SD12' },
  { id: 12, task: 'Spotify Audio is working', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12', note: 'Mac Mini on right side of console running Waves Super Rack' },
  { id: 13, task: 'CG A Audio is working', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12', note: 'Coordinate with video crew to play a video, confirm signal on CG A fader' },
  { id: 14, task: 'Sound check for all VIP mics', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12', note: 'Confirm signal and routing through PA Mix Bus and Broadcast Matrix' },
  { id: 15, task: 'Line check for worship', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12', note: 'Ask each band member to play; confirm line and monitor' },
  { id: 16, task: 'Line check Organ monitor', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12' },
  { id: 17, task: 'Walk-in snapshot works', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12', note: 'Fire snapshot and confirm PA responds correctly' },
  { id: 18, task: 'Bumper snapshot works', role: 'A1', section: 'FOH Audio', subsection: 'DiGiCo SD12', note: 'Fire snapshot and confirm PA responds correctly' },
  // FOH Audio - PA
  { id: 19, task: 'Main LR is working', role: 'A1', section: 'FOH Audio', subsection: 'PA', note: 'Confirm PA on in ControlFlex, PA control group unmuted on console' },
  { id: 20, task: 'Front Fills are working', role: 'A1', section: 'FOH Audio', subsection: 'PA', note: 'Fed off PA processor — if not working, reset Venueflex Definition Processor' },
  { id: 21, task: 'Subs are working', role: 'A1', section: 'FOH Audio', subsection: 'PA' },
  { id: 22, task: 'Surrounds are working', role: 'A1', section: 'FOH Audio', subsection: 'PA', note: 'Fed from Surround Aux on SD12 via Venueflex Definition Processor' },
  { id: 23, task: 'Spaceflex is working', role: 'A1', section: 'FOH Audio', subsection: 'PA' },
  // FOH Audio - Waves
  { id: 24, task: 'Waves Server connected to network', role: 'A1', section: 'FOH Audio', subsection: 'Waves Server', note: 'Check for green indicator in Waves Superrack' },
  { id: 25, task: 'Waves linked to DiGiCo', role: 'A1', section: 'FOH Audio', subsection: 'Waves Server', note: 'Waves follows the SD12 automatically when sessions are recalled or cues fired' },
  // FOH Audio - Recorders
  { id: 26, task: 'SD Recorder in record-pause mode', role: 'A1', section: 'FOH Audio', subsection: 'Recorders', note: 'Denon SD recorder in FOH rack; press record once — auto starts/stops at set times' },
  { id: 27, task: 'Virtual Soundcheck is working', role: 'A1', section: 'FOH Audio', subsection: 'Recorders' },
  // FOH Audio - Broadcast
  { id: 28, task: 'Broadcast Feed works', role: 'A1', section: 'FOH Audio', subsection: 'Broadcast', note: 'Confirm Broadcast Wet signal at Bcast Wet L+R matrix outputs' },
  { id: 29, task: 'Lobby speakers on', role: 'A1', section: 'FOH Audio', subsection: 'Broadcast' },
  // Stage / Backstage
  { id: 30, task: 'Stage setup ready for musicians', role: 'Stage', section: 'Stage / Backstage', note: 'Confirm against stage plot and input list in "00 Prod Doc This Week" folder' },
  { id: 31, task: 'Wireless mics and monitors have fresh batteries', role: 'Stage', section: 'Stage / Backstage', note: 'Replace all rechargeable batteries; place removed batteries on charger (top of backstage mic cabinet)' },
  { id: 32, task: 'Wireless mics in hooks on correct side of stage', role: 'Stage', section: 'Stage / Backstage', note: 'Place mics/packs on the side of the stage the person will enter from' },
  { id: 33, task: 'Stage TV is on and tested', role: 'Stage', section: 'Stage / Backstage', note: 'Confirm video crew is sending signal to it' },
  { id: 34, task: 'Stage TV cable is neatly stored', role: 'Stage', section: 'Stage / Backstage', note: 'Cable must unwrap cleanly — moved onto stage by one person during service' },
  { id: 35, task: 'Podium and stage props ready', role: 'Stage', section: 'Stage / Backstage', note: 'Normal Sunday: podium, stool, and TV for Pastor Rick' },
  { id: 36, task: 'East/west manual curtains correct orientation', role: 'Stage', section: 'Stage / Backstage', note: 'If motorized curtain is open and stained glass is visible, smaller curtains behind must be fully closed' },
  { id: 37, task: 'Backstage and exterior lights off', role: 'Stage', section: 'Stage / Backstage' },
  { id: 38, task: 'Stage clear of paper/trash', role: 'Stage', section: 'Stage / Backstage' },
  { id: 39, task: 'VIPs have mics and know their cues', role: 'Stage', section: 'Stage / Backstage' },
  // Lighting
  { id: 40, task: 'GrandMA is on', role: 'Lighting', section: 'Lighting', note: 'Power button upper right corner of console; generally left on' },
  { id: 41, task: 'Correct firmware loaded (1.9.2.2)', role: 'Lighting', section: 'Lighting', note: 'Version shown in title bar; restart to auto-load correct version' },
  { id: 42, task: 'GrandMA connected to Nodes', role: 'Lighting', section: 'Lighting', note: 'Feeds 6 ETC Nodes via sACN over lighting VLAN; see DMX Protocols window' },
  { id: 43, task: 'Correct Arena composition loaded', role: 'Lighting', section: 'Lighting' },
  { id: 44, task: 'Restart Arena 10 min before service', role: 'Lighting', section: 'Lighting' },
  // Video - Switcher
  { id: 45, task: 'Video signal from all cameras', role: 'Video', section: 'Video', subsection: 'Switcher (ATEM)' },
  { id: 46, task: 'CCU control is working', role: 'Video', section: 'Video', subsection: 'Switcher (ATEM)' },
  { id: 47, task: 'ATEM Outputs are correct', role: 'Video', section: 'Video', subsection: 'Switcher (ATEM)', note: 'See ATEM Output Configuration' },
  { id: 48, task: 'Lower/side thirds look right when keyed', role: 'Video', section: 'Video', subsection: 'Switcher (ATEM)', note: 'Check CG A and CG B keyers via Stream Deck' },
  { id: 49, task: 'MADI 1 set to unity and unmuted', role: 'Video', section: 'Video', subsection: 'Switcher (ATEM)', note: 'ATEM Audio tab → MADI 1 fader at +0.00, set to ON' },
  // Video - ProPresenter
  { id: 50, task: 'All CG computer outputs working', role: 'Graphics', section: 'Video', subsection: 'ProPresenter' },
  { id: 51, task: 'MIDI Connected (CG A, CG B, TD)', role: 'Graphics', section: 'Video', subsection: 'ProPresenter' },
  { id: 52, task: 'CG A Dante running', role: 'Graphics', section: 'Video', subsection: 'ProPresenter', note: 'See CG A Dante Virtual Soundcard' },
  { id: 53, task: 'Apply correct theme to songs on CG B', role: 'Graphics', section: 'Video', subsection: 'ProPresenter', note: 'See Applying ProPresenter Theme on CG B' },
  { id: 54, task: 'Check CG B Prayer time slides', role: 'Graphics', section: 'Video', subsection: 'ProPresenter' },
  // Video - Stream Deck / Companion
  { id: 55, task: 'Companion is working', role: 'Video', section: 'Video', subsection: 'Stream Deck / Companion' },
  { id: 56, task: 'All sources are connected', role: 'Video', section: 'Video', subsection: 'Stream Deck / Companion' },
  { id: 57, task: 'All buttons are functioning', role: 'Video', section: 'Video', subsection: 'Stream Deck / Companion' },
  { id: 58, task: 'Control ready for rehearsal', role: 'Video', section: 'Video', subsection: 'Stream Deck / Companion' },
  { id: 59, task: 'Walk-in countdown + preshow adds up to 15 min', role: 'Video', section: 'Video', subsection: 'Stream Deck / Companion' },
  // Video - HyperDecks
  { id: 60, task: 'All decks have drives', role: 'Video', section: 'Video', subsection: 'Recorders (HyperDecks)', note: '1 drive per HyperDeck, labeled with date and HyperDeck number' },
  { id: 61, task: 'All drives formatted (HFS+)', role: 'Video', section: 'Video', subsection: 'Recorders (HyperDecks)', note: 'HyperDeck → Menu → Format → Drive 1 → HFS+' },
  { id: 62, task: 'Campus getting kiosk until walk-in', role: 'Video', section: 'Video', subsection: 'Recorders (HyperDecks)', note: 'Set Aux 4 to BFC Kiosk' },
  // Stream - RESI
  { id: 63, task: 'Confirm encoder inputs on Ross Dashboard', role: 'Video', section: 'Stream', subsection: 'RESI', note: 'Out 71 [RESI 1] = In 15 [SW Out 15 - ME3]; Out 72 [RESI 2] = In 48 [Hyperdeck 4]' },
  { id: 64, task: 'Encoder scheduled', role: 'Video', section: 'Stream', subsection: 'RESI' },
  { id: 65, task: 'Web events scheduled for both services', role: 'Video', section: 'Stream', subsection: 'RESI' },
  { id: 66, task: 'Update date in title on web events', role: 'Video', section: 'Stream', subsection: 'RESI' },
  { id: 67, task: 'Facebook and YouTube feeds scheduled for both services', role: 'Video', section: 'Stream', subsection: 'RESI' },
  // Stream - Church Online
  { id: 68, task: 'Services scheduled', role: 'Video', section: 'Stream', subsection: 'Church Online' },
  { id: 69, task: 'Services have correct RESI embed link', role: 'Video', section: 'Stream', subsection: 'Church Online' },
  { id: 70, task: 'Duration set to 1 hour 20 minutes', role: 'Video', section: 'Stream', subsection: 'Church Online' },
  { id: 71, task: 'Start video 10 minutes before service', role: 'Video', section: 'Stream', subsection: 'Church Online' },
  // Stream - Tulakes
  { id: 72, task: 'Encoder receiving signal at 10:55', role: 'Video', section: 'Stream', subsection: 'Tulakes' },
  { id: 73, task: 'Audio is working', role: 'Video', section: 'Stream', subsection: 'Tulakes' },
]

export const SECTIONS = [...new Set(CHECKLIST_ITEMS.map(i => i.section))]

export const ROLE_COLORS: Record<string, string> = {
  A1: '#f59e0b',
  Video: '#3b82f6',
  Graphics: '#8b5cf6',
  'PTZ Op': '#06b6d4',
  Lighting: '#f97316',
  Stage: '#10b981',
}

export const CHECKLIST_ROLE_OPTIONS = ['A1', 'Video', 'Graphics', 'PTZ Op', 'Lighting', 'Stage'] as const
export const ROLES = ['All', ...CHECKLIST_ROLE_OPTIONS] as const
