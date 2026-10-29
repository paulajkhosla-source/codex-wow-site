const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const loader = $('.loader');
const count = $('.loader-count');
const loaderLine = $('.loader-line i');
let gsap, ScrollTrigger;
let theme = 'midnight';
const palettes = { midnight: ['#a18cff', '#d5f87c'], aurora: ['#57d7c5', '#8a9dff'], ember: ['#f25d87', '#ffc16b'] };
let updateShaderTheme = () => {};
let updateCanvasThemes = () => {};

// The opening always completes, even when an animation library cannot be loaded.
function intro() {
  if (reduced) { loader.remove(); $$('.headline-inner').forEach(el => el.style.transform = 'none'); return; }
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / 1500, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    count.innerHTML = `${String(Math.round(eased * 100)).padStart(2, '0')}<span>%</span>`;
    loaderLine.style.width = `${eased * 100}%`;
    if (progress < 1) requestAnimationFrame(tick);
    else {
      loader.style.transition = 'clip-path 1s cubic-bezier(.76,0,.24,1)';
      loader.style.clipPath = 'inset(0 0 100% 0)';
      $$('.headline-inner').forEach((el, i) => { el.style.transition = `transform 1.2s ${0.25 + i * .14}s cubic-bezier(.16,1,.3,1)`; el.style.transform = 'translateY(0)'; });
      setTimeout(() => loader.remove(), 1200);
    }
  }
  requestAnimationFrame(tick);
}
intro();

// Pointer details are only installed for devices with a precise pointer.
if (matchMedia('(pointer:fine)').matches && !reduced) {
  const dot = $('.cursor-dot'), ring = $('.cursor-ring');
  let x = -100, y = -100, rx = -100, ry = -100;
  window.addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; dot.style.opacity = ring.style.opacity = '1'; }, { passive: true });
  document.addEventListener('pointerover', e => ring.classList.toggle('hover', !!e.target.closest('a,button')));
  function cursorFrame() { rx += (x-rx)*.13; ry += (y-ry)*.13; dot.style.transform = `translate(${x-3}px,${y-3}px)`; ring.style.left = `${rx}px`; ring.style.top = `${ry}px`; ring.style.transform = 'translate(-50%,-50%)'; requestAnimationFrame(cursorFrame); }
  cursorFrame();
  $$('.magnetic').forEach(el => {
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); const target = el.querySelector('span') || el; if (target !== el) target.style.transform = `translate(${(e.clientX-r.left-r.width/2)*.18}px, ${(e.clientY-r.top-r.height/2)*.18}px)`; });
    el.addEventListener('pointerleave', () => { const target = el.querySelector('span'); if (target) target.style.transform = ''; });
  });
}
const menu = $('.menu-toggle'), nav = $('.mobile-nav');
menu.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); });
$$('a', nav).forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }));

$$('.theme-button').forEach(button => button.addEventListener('click', event => {
  const apply = () => { theme = button.dataset.theme; document.body.dataset.theme = theme; $$('.theme-button').forEach(b => { const active = b.dataset.theme === theme; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); }); updateShaderTheme(); updateCanvasThemes(); };
  if (!document.startViewTransition || reduced) { apply(); return; }
  const rect = button.getBoundingClientRect();
  const x = event.detail ? event.clientX : rect.left + rect.width / 2, y = event.detail ? event.clientY : rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth-x), Math.max(y, innerHeight-y));
  const transition = document.startViewTransition(apply);
  transition.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
}));

// Visibility gate shared by the three rendering surfaces.
function visibility(element, callback) {
  let visible = true;
  const update = () => callback(visible && !document.hidden);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); }, { threshold: 0 }).observe(element);
  document.addEventListener('visibilitychange', update);
  update();
}

async function setupWebGL() {
  try {
    const THREE = await import('three');
    const container = $('#webgl');
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = { uTime: { value: 0 }, uResolution: { value: new THREE.Vector2() }, uMouse: { value: new THREE.Vector2(0,0) }, uVelocity: { value: 0 }, uColour1: { value: new THREE.Color(palettes[theme][0]) }, uColour2: { value: new THREE.Color(palettes[theme][1]) } };
    updateShaderTheme = () => { uniforms.uColour1.value.set(palettes[theme][0]); uniforms.uColour2.value.set(palettes[theme][1]); if (reduced) render(); };
    const material = new THREE.ShaderMaterial({ uniforms, transparent: true, vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.);}`, fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform vec2 uResolution; uniform vec2 uMouse; uniform float uVelocity; uniform vec3 uColour1; uniform vec3 uColour2;
      float noise(vec3 p){return sin(p.x)*sin(p.y)*sin(p.z);}
      void main(){
        vec2 uv=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.); vec2 centre=vec2(.22, .01)+uMouse*.055; vec2 p=uv-centre;
        float t=uTime*.19; float a=atan(p.y,p.x); float r=length(p); float wobble=.028*sin(a*5.+t*2.)+.018*sin(a*9.-t*1.4)+.015*sin(a*3.+t+uVelocity*.2);
        float radius=.265+wobble; float edge=1.-smoothstep(radius-.012,radius+.012,r); vec2 q=p/max(radius,.001); float z=sqrt(max(0.,1.-dot(q,q)));
        vec3 n=normalize(vec3(q,z)); float flow=noise(vec3(n.x*3.+t,n.y*4.-t,n.z*3.+t));
        float bands=sin(n.x*5.-n.y*3.+flow*2.7+t*1.5); vec3 col=mix(uColour1,uColour2,smoothstep(-.8,.9,bands));
        col=mix(col,vec3(.13,.10,.2),smoothstep(.1,.95,length(q))*.72); col+=vec3(.8,.9,1.)*pow(max(0.,dot(n,normalize(vec3(-.5,.7,1.)))),12.)*.75;
        float glow=exp(-max(r-radius,0.)*15.)*.19; vec3 background=mix(uColour1,uColour2,.5)*glow;
        gl_FragColor=vec4(background+col*edge, max(glow,edge));
      }` });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), material));
    function resize() { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w,h,false); uniforms.uResolution.value.set(w,h); if (reduced) render(); }
    function render() { renderer.render(scene,camera); }
    resize(); window.addEventListener('resize', resize);
    window.addEventListener('pointermove', e => { uniforms.uMouse.value.set(e.clientX/innerWidth*2-1, 1-e.clientY/innerHeight*2); }, { passive: true });
    let lastScroll = scrollY, velocity = 0, active = false, raf = 0, time = 0, last = 0;
    window.addEventListener('scroll', () => { velocity = Math.min(30, Math.abs(scrollY-lastScroll)); lastScroll = scrollY; }, { passive: true });
    function frame(now) { if (!active) return; time += Math.min((now-last)/1000 || 0, .05); last = now; velocity *= .94; uniforms.uTime.value = time; uniforms.uVelocity.value = velocity; render(); raf = requestAnimationFrame(frame); }
    visibility(container, isVisible => { active = isVisible && !reduced; cancelAnimationFrame(raf); if (active) { last = performance.now(); raf = requestAnimationFrame(frame); } else if (isVisible) render(); });
  } catch (error) { document.documentElement.classList.add('no-webgl'); }
}
setupWebGL();

async function setupScroll() {
  if (reduced) return;
  try {
    const modules = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap = modules[0].gsap; ScrollTrigger = modules[1].ScrollTrigger; gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('.reveal-text').forEach(el => {
      const nodes = [];
      function split(node) { [...node.childNodes].forEach(child => { if (child.nodeType === Node.TEXT_NODE) { const fragment = document.createDocumentFragment(); child.textContent.split(/(\s+)/).forEach(word => { if (!word) return; if (/^\s+$/.test(word)) fragment.appendChild(document.createTextNode(word)); else { const span = document.createElement('span'); span.textContent = word; span.style.display = 'inline-block'; nodes.push(span); fragment.appendChild(span); } }); child.replaceWith(fragment); } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') split(child); }); }
      split(el);
      gsap.from(nodes, { y: 35, opacity: 0, stagger: .035, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 82%' } });
    });
    gsap.matchMedia().add('(min-width: 768px)', () => {
      const section = $('.horizontal-section'), track = $('.cards-track');
      const distance = () => Math.max(0, track.scrollWidth - (innerWidth - innerWidth*.084));
      const tween = gsap.to(track, { x: () => -distance(), ease: 'none', scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${distance() + 300}`, pin: true, scrub: 1, invalidateOnRefresh: true } });
      gsap.to($('.track-progress i'), { width: '100%', ease: 'none', scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${distance() + 300}`, scrub: true } });
      gsap.from('.card-art', { clipPath: 'inset(100% 0 0 0)', stagger: .15, duration: 1, scrollTrigger: { trigger: section, start: 'top 70%' } });
      gsap.to('.orb-small', { y: -35, ease: 'none', scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true } });
      return () => tween.kill();
    });
    gsap.to('.hero-glow', { yPercent: 30, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.from('.film-frame', { clipPath: 'inset(12% 8% 12% 8%)', ease: 'none', scrollTrigger: { trigger: '.film-frame', start: 'top bottom', end: 'top 25%', scrub: true } });
  } catch (error) { /* The document remains readable without the animation CDN. */ }
}
setupScroll();

// Keep the progress indicator and heading motion independent of the animation CDN.
const progressBar = $('.scroll-progress i');
const motionHeadings = $$('.intro h2, .horizontal-heading h2, .manifesto h2, .particle-heading h2, .film-heading h2');
motionHeadings.forEach(el => el.classList.add('velocity-heading'));
let previousScroll = scrollY, scrollVelocity = 0, scrollFrame = 0;
function updateScrollMotion() {
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  progressBar.style.transform = `scaleX(${maxScroll > 0 ? Math.min(1, Math.max(0, scrollY / maxScroll)) : 0})`;
  if (!reduced) {
    scrollVelocity *= .82;
    const skew = Math.max(-3, Math.min(3, scrollVelocity * .035));
    motionHeadings.forEach(el => { el.style.transform = `skewY(${skew}deg)`; el.style.filter = `blur(${Math.abs(skew) * .3}px)`; });
    if (Math.abs(scrollVelocity) > .05) scrollFrame = requestAnimationFrame(updateScrollMotion);
    else { motionHeadings.forEach(el => { el.style.transform = ''; el.style.filter = ''; }); scrollFrame = 0; }
  } else scrollFrame = 0;
}
window.addEventListener('scroll', () => { scrollVelocity = scrollY - previousScroll; previousScroll = scrollY; if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollMotion); }, { passive: true });
updateScrollMotion();

function setupParticles() {
  const canvas = $('#particles'), ctx = canvas.getContext('2d'); if (!ctx) return;
  const section = canvas.parentElement, pointer = { x: -1000, y: -1000 }; let points = [], w, h, active = false, raf = 0, frameCount = 0;
  function resize() {
    w = section.clientWidth; h = section.clientHeight; const dpr = Math.min(devicePixelRatio, 2); canvas.width = w*dpr; canvas.height = h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    const sample = document.createElement('canvas'), s = sample.getContext('2d'); sample.width = w; sample.height = h;
    s.fillStyle = '#fff'; s.textAlign = 'center'; s.textBaseline = 'middle'; s.font = `700 ${Math.min(w*.22, 260)}px Space Grotesk, sans-serif`; s.fillText('CODEX', w/2, h*.61);
    const pixels = s.getImageData(0,0,w,h).data; points = []; const gap = w < 600 ? 4 : 5;
    for (let y=0; y<h; y+=gap) for (let x=0; x<w; x+=gap) if (pixels[(y*w+x)*4+3]>128) points.push({ x: x+(Math.random()-.5)*12, y: y+(Math.random()-.5)*12, tx:x, ty:y, vx:0, vy:0, size: Math.random()*1.3+.5 });
    draw();
  }
  function draw() { ctx.clearRect(0,0,w,h); const colour = getComputedStyle(document.body).getPropertyValue('--accent').trim(); ctx.fillStyle = colour || '#c8f36b'; for (const p of points) { if (!reduced) { const dx=p.x-pointer.x, dy=p.y-pointer.y, dist=Math.hypot(dx,dy); if (dist<110 && dist>0) { const force=(110-dist)/110; p.vx+=dx/dist*force*2.4; p.vy+=dy/dist*force*2.4; } p.vx+=(p.tx-p.x)*.025; p.vy+=(p.ty-p.y)*.025; p.vx*=.88; p.vy*=.88; p.x+=p.vx; p.y+=p.vy; } ctx.globalAlpha=.45 + p.size*.3; ctx.fillRect(p.x,p.y,p.size,p.size); } ctx.globalAlpha=1; }
  function frame() { if (!active) return; frameCount++; draw(); raf=requestAnimationFrame(frame); }
  section.addEventListener('pointermove', e => { const r=canvas.getBoundingClientRect(); pointer.x=e.clientX-r.left; pointer.y=e.clientY-r.top; }, { passive:true }); section.addEventListener('pointerleave', () => { pointer.x=pointer.y=-1000; });
  const previousThemeUpdate = updateCanvasThemes; updateCanvasThemes = () => { previousThemeUpdate(); draw(); };
  resize(); document.fonts.ready.then(resize); window.addEventListener('resize', resize); visibility(section, visible => { active=visible&&!reduced; cancelAnimationFrame(raf); if(active) raf=requestAnimationFrame(frame); else if(visible) draw(); });
}
setupParticles();

function setupFilm() {
  const canvas=$('#film-canvas'), ctx=canvas.getContext('2d'), video=$('#film-video'), frameEl=$('.film-frame'), button=$('.film-control'); if (!ctx) return;
  let active=false, playing=!reduced, raf=0, time=0, last=0;
  function resize() { const ratio=Math.min(devicePixelRatio,2); canvas.width=Math.min(1600,frameEl.clientWidth*ratio); canvas.height=Math.min(1000,frameEl.clientHeight*ratio); draw(); }
  function draw() {
    const w=canvas.width, h=canvas.height, colours=palettes[theme], cx=w/2, cy=h/2;
    ctx.fillStyle='#090b12'; ctx.fillRect(0,0,w,h);
    const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,w*.58);
    glow.addColorStop(0,colours[0]+'35'); glow.addColorStop(1,'#090b1200'); ctx.fillStyle=glow; ctx.fillRect(0,0,w,h);
    // Nested rotating frames and vanishing lines create a moving wireframe tunnel.
    ctx.save(); ctx.translate(cx,cy); ctx.lineWidth=Math.max(1,w/1200);
    const corners=[];
    for(let i=0;i<15;i++) {
      const depth=((i/15 + time*.045)%1), size=(.035+depth*depth*.7)*Math.max(w,h);
      const angle=time*.12+depth*.7, aspect=h/w;
      ctx.save(); ctx.rotate(angle); ctx.strokeStyle=colours[i%2]; ctx.globalAlpha=.12+depth*.55;
      ctx.strokeRect(-size,-size*aspect,size*2,size*aspect); ctx.restore();
      corners.push({size,angle,depth});
    }
    ctx.globalAlpha=.35; ctx.strokeStyle=colours[1];
    for(let corner=0;corner<4;corner++) {
      ctx.beginPath(); corners.sort((a,b)=>a.depth-b.depth).forEach((p,i)=>{
        const x=(corner<2?-1:1)*p.size, y=(corner%2?-1:1)*p.size*h/w;
        const px=x*Math.cos(p.angle)-y*Math.sin(p.angle), py=x*Math.sin(p.angle)+y*Math.cos(p.angle);
        if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
      }); ctx.stroke();
    }
    ctx.restore();
    for(let i=0;i<12;i++) { const y=h*(.14+i*.065), x=((time*(25+i*5)+i*w*.21)%(w*1.4))-w*.2; ctx.globalAlpha=.15+(i%3)*.1; ctx.strokeStyle=colours[i%2]; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w*(.08+i*.006),y); ctx.stroke(); }
    ctx.globalAlpha=1; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`600 ${Math.max(12, Math.min(w*.035,h*.055))}px Space Grotesk, sans-serif`; ctx.letterSpacing=`${Math.max(1,w*.004)}px`;
    ctx.fillStyle='#f4f2ec'; ctx.fillText('CODEX — A FILM BY AN AI',cx,cy); ctx.letterSpacing='0px';
    const scanY=h*(.15+(time*.09)% .7); ctx.fillStyle=colours[1]+'55'; ctx.fillRect(0,scanY,w,Math.max(1,h*.002));
    ctx.fillStyle='#050508'; ctx.fillRect(0,0,w,h*.1); ctx.fillRect(0,h*.9,w,h*.1);
    // Sparse animated grain keeps the image textured without softening the geometry.
    for(let i=0;i<Math.min(1000,w*h/700);i++){ const x=Math.random()*w,y=Math.random()*h; ctx.fillStyle=i%2?'#ffffff18':'#00000035'; ctx.fillRect(x,y,1.5,1.5); }
    const seconds=Math.floor(time), minutes=Math.floor(seconds/60); $('.film-time').textContent=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  function animate(now){if(!active||!playing)return; time+=Math.min((now-last)/1000||0,.05);last=now;draw();raf=requestAnimationFrame(animate);}
  function sync(){cancelAnimationFrame(raf); if(active&&playing){last=performance.now();raf=requestAnimationFrame(animate);video.play().catch(()=>{});}else video.pause();}
  const previousThemeUpdate = updateCanvasThemes; updateCanvasThemes = () => { previousThemeUpdate(); draw(); };
  resize(); window.addEventListener('resize',resize);
  try { if (!canvas.captureStream) throw new Error('unsupported'); video.srcObject=canvas.captureStream(30); video.play().catch(() => { frameEl.classList.add('fallback'); }); } catch { frameEl.classList.add('fallback'); }
  button.addEventListener('click',()=>{playing=!playing;button.querySelector('span').textContent=playing?'Ⅱ':'▶';button.setAttribute('aria-label',playing?'Pause animation':'Play animation');sync();});
  if(reduced){button.querySelector('span').textContent='▶';button.setAttribute('aria-label','Play animation');frameEl.classList.add('fallback');}
  visibility(frameEl,visible=>{active=visible;sync();});
}
setupFilm();
