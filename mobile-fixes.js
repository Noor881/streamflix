// Mobile fixes: toggle search input visibility on small screens
(function(){
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchContainer = document.querySelector('.search-container');

    if (!searchBtn || !searchInput || !searchContainer) return;

    searchBtn.addEventListener('click', (e) => {
        // If input is hidden or nearly zero width, open it and focus
        const rect = searchInput.getBoundingClientRect();
        const style = window.getComputedStyle(searchInput);
        const isHidden = parseFloat(style.opacity) === 0 || rect.width < 30;
        if (isHidden) {
            // Reveal input
            searchContainer.classList.add('search-open');
            // Give the browser a tick to apply styles then focus
            setTimeout(() => {
                searchInput.focus();
            }, 50);
        }
    });

    // Close the mobile search if user taps outside or presses Escape
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target)) {
            searchContainer.classList.remove('search-open');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') searchContainer.classList.remove('search-open');
    });
})();
