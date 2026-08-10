window.ApexaBoot = (() => {
    const scripts = [
        'js/core/config.js',
        'js/core/api.js',
        'js/core/app.js',
    ];

    return new Promise((resolve) => {
        const loadNext = (index) => {
            if (index >= scripts.length) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = scripts[index];
            script.async = false;
            script.onload = () => loadNext(index + 1);
            script.onerror = () => loadNext(index + 1);
            document.head.appendChild(script);
        };
        loadNext(0);
    });
})();
