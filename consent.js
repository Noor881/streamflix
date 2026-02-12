// Simple cookie consent banner
(function(){
  if (typeof window === 'undefined') return;
  try{
    const key = 'sf_consent_v1';
    if (localStorage.getItem(key)) return;

    function loadGtag(){
      if (window.__gtag_loaded) return;
      window.__gtag_loaded = true;
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=G-ZHQKVYP1WN';
      document.head.appendChild(s);
      s.onload = () => {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function(){dataLayer.push(arguments);} ;
        window.gtag('js', new Date());
        window.gtag('config', 'G-ZHQKVYP1WN');
      };
    }

    function accept(){
      localStorage.setItem(key,'1');
      const el = document.getElementById('cookie-consent');
      if (el) el.remove();
      try{ loadGtag(); }catch(e){}
    }

    function build(){
      const div = document.createElement('div');
      div.id = 'cookie-consent';
      div.innerHTML = '\n        <div class="cookie-consent-inner">\n          <div class="cookie-text">We use cookies for analytics and to improve your experience.\n          <a href="#/privacy">Privacy Policy</a></div>\n          <div class="cookie-actions">\n            <button id="cookie-accept" class="btn">Accept</button>\n          </div>\n        </div>';
      document.body.appendChild(div);
      document.getElementById('cookie-accept').addEventListener('click', accept);
    }

    // If user already consented, load analytics immediately (but after DOM ready)
    function init(){
      if (localStorage.getItem(key)){
        try{ loadGtag(); }catch(e){}
        return;
      }
      build();
    }

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', init);
    } else init();
  }catch(e){}
})();
