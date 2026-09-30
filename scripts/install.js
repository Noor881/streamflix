// Handles beforeinstallprompt and shows a button with id 'install-btn'
(function(){
  let deferredPrompt = null;
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = 'inline-block';
    btn.removeAttribute('aria-hidden');
  });
  btn.addEventListener('click', async ()=>{
    if (!deferredPrompt) return;
    btn.disabled = true;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
    } finally { btn.disabled = false; }
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; btn.style.display = 'none'; btn.setAttribute('aria-hidden', 'true'); });
})();
