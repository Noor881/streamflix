// Handles beforeinstallprompt and shows a button with id 'install-btn'
(function(){
  let deferredPrompt = null;
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = 'inline-block';
  });
  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.style.display = 'none';
    btn.disabled = false;
  });
})();
