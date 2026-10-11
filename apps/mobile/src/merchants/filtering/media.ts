/**
 * Stores autoplay product clips, ads and background music; iOS treats any earlier tap on the page as permission.
 * Media may play only after the shopper taps that player (the media element or a video/player container holding it).
 * Runs before page scripts, in every frame.
 */
export const mediaGuardScript = `(() => {
  if (window.__moryMedia || typeof HTMLMediaElement === 'undefined') return;
  window.__moryMedia = true;
  let tapped = null;
  const PLAYER = 'video, audio, [class*="video" i], [class*="player" i], [id*="video" i], [id*="player" i]';
  const allowed = (media) => !!tapped && (tapped === media || (tapped.contains && tapped.contains(media)));
  document.addEventListener('click', (event) => {
    const target = event.target;
    tapped = target && target.closest ? target.closest(PLAYER) : null;
  }, true);
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (allowed(this)) return play.call(this);
    this.pause();
    return Promise.reject(new DOMException('Playback needs a tap on the player', 'NotAllowedError'));
  };
  // Media with the autoplay attribute starts without calling play().
  document.addEventListener('play', (event) => {
    const media = event.target;
    if (media && media.pause && !allowed(media)) media.pause();
  }, true);
})(); true;`;

/** Pauses everything playing in a store that is being hidden. */
export const pauseMediaScript = `(() => {
  for (const media of document.querySelectorAll('video, audio')) media.pause();
})(); true;`;
