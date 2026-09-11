// Screens a completed-state banner may deep-link into.
// Keys mirror the Flutter feature folders (lib/features/<key>) so the app can route
// on them directly. Admin panel renders these as a dropdown so an invalid route
// can never be saved — a typo here is a dead banner with no error to surface it.
const PROFILE_QUESTION_SCREENS = [
  { key: 'dashboard', label: 'Home' },
  { key: 'courses', label: 'Courses' },
  { key: 'chat', label: 'Community Chat' },
  { key: 'chatai', label: 'AI Assistant' },
  { key: 'quiz', label: 'Quizzes' },
  { key: 'journey', label: 'Import / Export Journey' },
  { key: 'news', label: 'Trade Updates' },
  { key: 'tools', label: 'Smart Tools' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'freevideos', label: 'Free Videos' },
  { key: 'gallery', label: 'Success Stories' },
  { key: 'seminars', label: 'Seminars' },
  { key: 'profile', label: 'Profile' },
];

const SCREEN_KEYS = PROFILE_QUESTION_SCREENS.map((s) => s.key);

module.exports = { PROFILE_QUESTION_SCREENS, SCREEN_KEYS };
