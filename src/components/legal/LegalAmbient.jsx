import { useEffect, useRef } from 'react';
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color,
  OrthographicCamera, Points, PointsMaterial, Scene, WebGLRenderer,
} from 'three';
import '../../styles/legalMotion.css';

const COUNT = 16;

// Soft warm light motes drifting behind the law-firm page. Purely decorative.
export default function LegalAmbient() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    let renderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch {
      return undefined; // no WebGL (tests, old GPUs): the CSS background alone is enough
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);

    const positions = new Float32Array(COUNT * 3);
    const seeds = Array.from({ length: COUNT }, () => ({
      x: Math.random() * 2 - 1, y: Math.random() * 2 - 1,
      speed: 0.012 + Math.random() * 0.03, sway: Math.random() * Math.PI * 2,
    }));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));

    // A radial-gradient sprite so every mote is a soft glow, not a square.
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const ctx = sprite.getContext('2d');
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new CanvasTexture(sprite);

    const brand = getComputedStyle(host).getPropertyValue('--color-primary').trim() || '#C2410C';
    const material = new PointsMaterial({
      // big, faint bokeh: reads as warm light, never as specks on the page
      size: 140 * renderer.getPixelRatio(), map: texture, color: new Color(brand), transparent: true,
      opacity: 0.07, depthWrite: false, sizeAttenuation: false,
    });
    scene.add(new Points(geometry, material));

    // Viewport-sized at most: long pages (reports) would otherwise get a canvas thousands of px tall,
    // costing GPU fill and spreading the motes so thin they vanish. CSS keeps it sticky on scroll.
    const resize = () => renderer.setSize(host.clientWidth, Math.min(host.clientHeight, window.innerHeight), false);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    window.addEventListener('resize', resize);
    resize();

    let frame = 0;
    const start = performance.now();
    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      const t = (now - start) / 1000;
      seeds.forEach((seed, i) => {
        const y = ((seed.y + t * seed.speed + 1) % 2) - 1;
        positions[i * 3] = seed.x + Math.sin(t * 0.4 + seed.sway) * 0.04;
        positions[i * 3 + 1] = y;
      });
      geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      // dispose() keeps the GL context alive; Chromium caps live contexts (~16), so page hopping would exhaust them.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="lt-ambient" aria-hidden="true" />;
}
