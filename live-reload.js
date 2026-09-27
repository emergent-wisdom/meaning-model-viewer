// The standalone run adapter follows changes in every shared representation.
// Loaded synchronously before the MCP UI, only by an explicit --live server.
(() => {
  const initialRevision = document.currentScript?.dataset.revision;
  if (!initialRevision) return;
  const cleanURL = new URL(location.href);
  if (cleanURL.searchParams.has('live')) {
    cleanURL.searchParams.delete('live');
    history.replaceState(history.state, '', cleanURL.href);
  }
  let checking = false, scheduled = false;
  const playing = () => {
    if (!['space', 'temporal'].includes(document.body?.dataset.representation)) return false;
    // Temporal playback does not update aria-pressed; Space can leave its old
    // attribute behind when changing representations. The shared button's
    // current pause glyph is the common, visible playback state.
    return document.getElementById('play')?.textContent.trim() === '❚❚';
  };
  const check = async () => {
    if (checking || scheduled || document.readyState !== 'complete' || playing()) return;
    checking = true;
    try {
      const response = await fetch('data/live.json', { cache: 'no-store' });
      if (!response.ok) return;
      const next = await response.json();
      if (next.revision && next.revision !== initialRevision) {
        scheduled = true;
        // Allow pending time/selection URL updates to finish. Re-read the
        // active representation's playback state before reloading in place.
        setTimeout(() => {
          scheduled = false;
          if (!playing()) location.reload();
        }, 1000);
      }
    } catch { /* A stopped server or failed refresh leaves the current view. */ }
    finally { checking = false; }
  };
  const timer = setInterval(check, 20_000);
  addEventListener('pagehide', (event) => { if (!event.persisted) clearInterval(timer); });
})();
