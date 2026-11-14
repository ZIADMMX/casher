import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Clock,
  ConeGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';

/**
 * Three3DLogo
 * ثعلب ثلاثي الأبعاد بأسلوب الإيموجي (🦊): أسطح ناعمة وألوان دافئة مريحة للعين.
 * - برتقالي دافئ للرأس والجسم والذيل
 * - كريمي للخدين والصدر وطرف الذيل
 * - بني داكن للأنف وأطراف الأذنين والأقدام
 * حركة هادئة: طفو، رمشة، تحريك الذيل، وميل الرأس نحو الماوس.
 */
export default function Three3DLogo({
  width = 240,
  height = 240,
  interactive = true,
  accentColor = 0xf0892b, // برتقالي دافئ
  whiteColor = 0xfff3e2,  // كريمي
  darkColor = 0x2e231d,   // بني داكن دافئ
  showParticles = true,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new Scene();
    const camera = new PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.05, 5.6);

    const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // أسطح ناعمة (بدون flatShading) لشكل لطيف مثل الإيموجي
    const mat = (color, roughness = 0.62) => new MeshStandardMaterial({ color, roughness, metalness: 0 });
    const orangeMat = mat(accentColor);
    const creamMat = mat(whiteColor, 0.7);
    const darkMat = mat(darkColor, 0.45);
    const eyeMat = mat(0x1b1410, 0.25);
    const glintMat = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });

    const sphere = (material, r, [x, y, z], [sx, sy, sz] = [1, 1, 1], parent) => {
      const m = new Mesh(new SphereGeometry(r, 40, 28), material);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      parent.add(m);
      return m;
    };
    const cone = (material, r, h, pos, rot, parent) => {
      const m = new Mesh(new ConeGeometry(r, h, 40, 1), material);
      m.position.set(...pos);
      m.rotation.set(...rot);
      parent.add(m);
      return m;
    };

    const rootGroup = new Group();
    scene.add(rootGroup);
    const fox = new Group();
    fox.position.y = -0.1;
    rootGroup.add(fox);

    // ---- الجسم والصدر والأقدام ----
    const body = new Group();
    fox.add(body);
    sphere(orangeMat, 0.62, [0, -0.78, -0.05], [0.95, 1.2, 0.8], body);
    sphere(creamMat, 0.4, [0, -0.72, 0.27], [0.85, 1.3, 0.45], body);
    sphere(darkMat, 0.17, [-0.25, -1.36, 0.22], [1.05, 0.75, 1.3], body);
    sphere(darkMat, 0.17, [0.25, -1.36, 0.22], [1.05, 0.75, 1.3], body);

    // ---- الرأس ----
    const head = new Group();
    head.position.set(0, 0.1, 0.05);
    fox.add(head);
    sphere(orangeMat, 0.66, [0, 0, 0], [1.22, 0.95, 1.0], head);

    // الوجه السفلي الكريمي + خصلات الخدين المدببة للخارج والأسفل (علامة الثعلب)
    [-1, 1].forEach((s) => {
      sphere(creamMat, 0.34, [s * 0.28, -0.26, 0.42], [1, 0.7, 0.8], head);
      cone(creamMat, 0.24, 0.62, [s * 0.5, -0.27, 0.24], [0.15, 0, s * (Math.PI / 2 + 0.55)], head);
    });
    sphere(creamMat, 0.26, [0, -0.3, 0.56], [1, 0.7, 0.8], head);

    // الخطم البرتقالي والأنف
    cone(orangeMat, 0.21, 0.52, [0, -0.06, 0.74], [Math.PI / 2, 0, 0], head);
    sphere(darkMat, 0.075, [0, -0.1, 1.0], [1.2, 0.85, 1], head);

    // العينان + لمعة + رمشة
    const eyes = new Group();
    head.add(eyes);
    [-1, 1].forEach((s) => {
      const eye = sphere(eyeMat, 0.082, [s * 0.27, 0.12, 0.58], [0.9, 1.15, 0.7], eyes);
      eye.rotation.z = s * 0.15;
      sphere(glintMat, 0.022, [s * 0.255, 0.16, 0.63], [1, 1, 1], eyes);
    });

    // الأذنان: خارجي برتقالي + داخلي كريمي + طرف داكن
    const ears = [-1, 1].map((s) => {
      const ear = new Group();
      ear.position.set(s * 0.42, 0.86, -0.04);
      ear.rotation.set(-0.1, 0, -s * 0.22);
      cone(orangeMat, 0.33, 0.95, [0, 0, 0], [0, 0, 0], ear);
      cone(creamMat, 0.19, 0.62, [0, -0.12, 0.08], [0, 0, 0], ear);
      cone(darkMat, 0.0764, 0.22, [0, 0.365, 0], [0, 0, 0], ear).scale.set(1.15, 1.01, 1.15);
      head.add(ear);
      return { ear, s };
    });

    // ---- الذيل الكثيف: كرات متدرجة الحجم على قوس، طرفه كريمي ----
    const tail = new Group();
    tail.position.set(0.42, -1.1, -0.25);
    fox.add(tail);
    [
      [0.00, 0.00, 0.00, 0.2],
      [0.26, 0.12, -0.02, 0.27],
      [0.5, 0.34, -0.04, 0.33],
      [0.66, 0.62, -0.06, 0.35],
      [0.7, 0.92, -0.08, 0.31],
    ].forEach(([x, y, z, r]) => sphere(orangeMat, r, [x, y, z], [1, 1.1, 1], tail));
    sphere(creamMat, 0.25, [0.68, 1.2, -0.09], [1, 1.15, 1], tail);

    // ---- شرارات دافئة هادئة ----
    let particles;
    let particlesMaterial;
    if (showParticles) {
      const count = 22;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i += 3) {
        const rad = 1.7 + Math.random() * 0.9;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        positions[i] = rad * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = rad * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = rad * Math.cos(phi);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(positions, 3));
      particlesMaterial = new PointsMaterial({ color: 0xffc27a, size: 0.04, transparent: true, opacity: 0.6 });
      particles = new Points(geo, particlesMaterial);
      rootGroup.add(particles);
    }

    // ---- إضاءة ناعمة دافئة ----
    scene.add(new AmbientLight(0xfff1e0, 0.9));
    scene.add(new HemisphereLight(0xfff6ea, 0x8a5a3a, 0.8));
    const key = new DirectionalLight(0xffffff, 1.7);
    key.position.set(2.5, 3.5, 5);
    scene.add(key);
    const rim = new PointLight(0xffa24d, 2.2, 12);
    rim.position.set(-3, 2, -2.5);
    scene.add(rim);

    // ---- التفاعل ----
    let targetRotY = 0.12;
    let targetRotX = 0;
    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      targetRotY = 0.12 + ((e.clientX - rect.left) / rect.width - 0.5) * 0.8;
      targetRotX = ((e.clientY - rect.top) / rect.height - 0.5) * 0.35;
    };
    if (interactive) window.addEventListener('mousemove', handleMouseMove);

    let animId;
    const clock = new Clock();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      fox.position.y = -0.1 + Math.sin(t * 1.6) * 0.06;
      tail.rotation.z = Math.sin(t * 2.0) * 0.1;
      tail.rotation.y = Math.cos(t * 1.4) * 0.12;
      ears.forEach(({ ear, s }) => { ear.rotation.z = -s * 0.22 + Math.sin(t * 3 + s) * 0.02; });
      // رمشة قصيرة كل ~3.5 ثوانٍ
      eyes.scale.y = (t % 3.5) > 3.38 ? 0.12 : 1;

      if (particles) particles.rotation.y = t * 0.06;

      if (interactive) {
        fox.rotation.y += (targetRotY - fox.rotation.y) * 0.06;
        fox.rotation.x += (targetRotX - fox.rotation.x) * 0.06;
      } else {
        fox.rotation.y = Math.sin(t * 0.8) * 0.3 + 0.1;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (interactive) window.removeEventListener('mousemove', handleMouseMove);
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      [orangeMat, creamMat, darkMat, eyeMat, glintMat, particlesMaterial].forEach((m) => m?.dispose());
      renderer.dispose();
    };
  }, [width, height, interactive, accentColor, whiteColor, darkColor, showParticles]);

  return (
    <div
      ref={containerRef}
      style={{ width, height, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}
    />
  );
}
