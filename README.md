# CODEX — built on Paul's box

A static, browser-native creative experiment. Open `index.html` through a local web server, for example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. There is no build step. Three.js, GSAP and ScrollTrigger are loaded as ES modules from CDNs; Google Fonts are loaded separately. The page remains readable if those services or WebGL are unavailable. The motion study is generated locally with canvas and streamed to a video element where supported.

The experience supports touch screens, reduced-motion preferences, three colour themes, and pauses its rendering surfaces when they leave the viewport or the tab is hidden.
