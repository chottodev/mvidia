/** Разделяет поток экрана: видео для screen.webm, audio — для system-audio.webm */
export function splitDisplayStream(display: MediaStream): {
  screenVideo: MediaStream;
  systemAudio: MediaStream | null;
} {
  const videoTracks = display.getVideoTracks();
  const audioTracks = display.getAudioTracks();
  const screenVideo = new MediaStream(videoTracks);
  const systemAudio = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
  return { screenVideo, systemAudio };
}
