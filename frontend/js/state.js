// Claudio FM — 共享状态

export const state = {
  theme: localStorage.getItem('claudio-theme') || 'dark',
  isPlaying: false,
  currentTrack: null,
  volume: parseInt(localStorage.getItem('claudio-volume') || '80'),
  queue: [],
  lovedSongs: new Set(),
  ncmLoggedIn: false,
  ncmVipType: 0,
  ncmNickname: '',
  isFmMode: false,
  isSmartMode: false,
  isPlaylistMode: false,
  playlistQueue: [],
  playlistModeMeta: null,
  playMode: localStorage.getItem('claudio-playmode') || 'list',
  _shuffleHistory: [],
  _playlistShuffleHistory: [],
  currentLyrics: [],
  currentLyricIndex: -1,
  lyricsVisible: false,
  _playlists: [],
};

export const userCoords = { lat: null, lon: null };

export const sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
