/* Keyboard/touch navigation shared by catalogue and watch pages. */
(function(root) {
    let closeDrawer=()=>{};
    function init() {
        const doc=root.document;
        doc.querySelectorAll('.dnav-dropdown').forEach(dropdown=>{
            const toggle=dropdown.querySelector('.dropdown-toggle'),menu=dropdown.querySelector('.dnav-dropdown-content');
            if(!toggle || !menu || toggle.dataset.menuReady)return;
            toggle.dataset.menuReady='true';toggle.setAttribute('aria-haspopup','true');toggle.setAttribute('aria-expanded','false');
            const setOpen=open=>{dropdown.classList.toggle('genre-open',open);dropdown.classList.toggle('genre-dismissed',!open);toggle.setAttribute('aria-expanded',String(open));};
            let pointerWasOpen=false;
            toggle.addEventListener('pointerdown',()=>{pointerWasOpen=dropdown.classList.contains('genre-open');});
            toggle.addEventListener('click',event=>{event.preventDefault();setOpen(event.detail>0 ? !pointerWasOpen : !dropdown.classList.contains('genre-open'));});
            dropdown.addEventListener('keydown',event=>{
                if(event.key==='Escape'){event.preventDefault();toggle.focus();setOpen(false);}
                else if(event.key==='ArrowDown' && event.target===toggle){event.preventDefault();dropdown.classList.remove('genre-dismissed');setOpen(true);menu.querySelector('a')?.focus();}
                else if(event.key===' ' && event.target===toggle){event.preventDefault();setOpen(!dropdown.classList.contains('genre-open'));}
            });
            toggle.addEventListener('focus',()=>setOpen(true));
            dropdown.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')setOpen(true);});
            dropdown.addEventListener('pointerleave',()=>{if(!dropdown.contains(doc.activeElement))setOpen(false);});
            doc.addEventListener('pointerdown',event=>{if(!dropdown.contains(event.target))setOpen(false);});
            dropdown.addEventListener('focusout',()=>root.setTimeout(()=>{if(!dropdown.contains(doc.activeElement))setOpen(false);},0));
        });
        const button=doc.getElementById('hamburger-btn'),nav=doc.getElementById('mobile-nav'),overlay=doc.getElementById('mobile-nav-overlay');
        if(!button || !nav || button.dataset.menuReady)return;
        button.dataset.menuReady='true';button.setAttribute('aria-controls','mobile-nav');
        const links=[...nav.querySelectorAll('a,button')],previous=new Map(links.map(link=>[link,link.getAttribute('tabindex')]));
        let open=false,savedOverflow='';
        const setOpen=(value,restore=true)=>{
            if(value===open && nav.hasAttribute('aria-hidden'))return;
            if(value)savedOverflow=doc.body.style.overflow;
            open=value;nav.classList.toggle('open',value);overlay?.classList.toggle('open',value);button.classList.toggle('open',value);
            button.setAttribute('aria-expanded',String(value));button.setAttribute('aria-label',value?'Close menu':'Open menu');
            nav.setAttribute('aria-hidden',String(!value));nav.inert=!value;
            for(const link of links){if(value){const old=previous.get(link);if(old===null)link.removeAttribute('tabindex');else link.setAttribute('tabindex',old);}else link.setAttribute('tabindex','-1');}
            doc.body.style.overflow=value?'hidden':savedOverflow;
            if(value)links[0]?.focus();else if(restore)button.focus();
        };
        setOpen(false,false);
        closeDrawer=()=>setOpen(false,false);
        button.addEventListener('click',()=>setOpen(!open));
        overlay?.addEventListener('click',()=>setOpen(false));
        links.forEach(link=>link.addEventListener('click',()=>setOpen(false,false)));
        doc.addEventListener('keydown',event=>{
            if(!open)return;
            if(event.key==='Escape'){event.preventDefault();setOpen(false);return;}
            if(event.key==='Tab'){
                const stops=[button,...links.filter(link=>!link.disabled)],index=stops.indexOf(doc.activeElement);
                if(index<0 || event.shiftKey && index===0 || !event.shiftKey && index===stops.length-1){event.preventDefault();(event.shiftKey?stops.at(-1):stops[0]).focus();}
            }
        });
        doc.addEventListener('focusin',event=>{if(open && event.target!==button && !nav.contains(event.target))links[0]?.focus();});
        root.addEventListener('resize',()=>{if(open && !root.matchMedia('(max-width:900px)').matches)setOpen(false);},{passive:true});
        return {setOpen};
    }
    const api={init,close:()=>closeDrawer()};
    if(typeof module==='object' && module.exports)module.exports=api;else root.NavigationUI=api;
})(typeof window==='object'?window:globalThis);
