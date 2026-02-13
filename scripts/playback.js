// Basic HTML5 player helpers: handles play modal, resume, captions, speed control
(function(){
  function createModal(){
    if (document.getElementById('video-modal')) return;
    const div = document.createElement('div');
    div.id = 'video-modal';
    div.innerHTML = `
      <div class="video-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;"> 
        <div style="position:relative;max-width:1200px;width:100%;">
          <video id="player" controls style="width:100%;height:auto;background:#000" crossorigin="anonymous"></video>
          <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
            <label style="color:#fff">Speed: <select id="player-speed"><option>0.5</option><option>0.75</option><option selected>1</option><option>1.25</option><option>1.5</option><option>2</option></select></label>
            <button id="player-close" style="padding:6px 10px;border-radius:6px">Close</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div);
    document.getElementById('player-close').addEventListener('click', ()=>{ document.getElementById('video-modal').remove(); });
    const speed = document.getElementById('player-speed');
    speed.addEventListener('change', ()=>{ const v = document.getElementById('player'); v.playbackRate = parseFloat(speed.value); });
  }

  async function openPlayer(srcs, subs){
    createModal();
    const player = document.getElementById('player');
    player.innerHTML = '';
    if (Array.isArray(srcs)){
      for(const s of srcs){ const source = document.createElement('source'); source.src = s.src; source.type = s.type || ''; player.appendChild(source); }
    } else {
      const source = document.createElement('source'); source.src = srcs; player.appendChild(source);
    }
    if (subs){
      for(const t of subs){ const track = document.createElement('track'); track.kind='subtitles'; track.label=t.label||'sub'; track.srclang=t.lang||'en'; track.src=t.src; player.appendChild(track); }
    }
    // resume position if present
    const key = `player-pos-${location.pathname}`;
    try{ const pos = parseFloat(localStorage.getItem(key) || '0'); if (pos>0) player.currentTime = pos; }catch(e){}
    player.play().catch(()=>{});
    player.addEventListener('timeupdate', ()=>{ localStorage.setItem(key, player.currentTime); });
    player.addEventListener('ended', ()=>{ localStorage.removeItem(key); });
  }

  // Wire elements with data-play-src (single) or data-play-list (comma list)
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-play-src],[data-play-list]');
    if (!btn) return;
    e.preventDefault();
    const list = btn.getAttribute('data-play-list');
    if (list){ const urls = list.split(',').map(s=>s.trim()); openPlayer(urls); return; }
    const src = btn.getAttribute('data-play-src');
    const subs = btn.getAttribute('data-subtitles');
    let subsArr = null;
    if (subs){ try{ subsArr = JSON.parse(subs); }catch(e){ subsArr = null } }
    openPlayer(src, subsArr);
  });

})();
