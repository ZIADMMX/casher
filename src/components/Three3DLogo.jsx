import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Clock,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three';

/**
 * Three3DLogo
 * مجسم ثلاثي الأبعاد تفاعلي لشعار الثعلب الذكي (FOX.CLOUD) مبني بـ Three.js
 * يعتمد على تصميم Low-Poly عصري بألوان وهوية المشروع:
 * - البرتقالي الناري (Fox Orange)
 * - الأبيض الثلجي (Fox White)
 * - الرمادي الداكن / الفحمي (Fox Charcoal)
 * - حركة حية (تأرجح خفيف، ذيل متحرك، وتفاعل مع حركة الماوس)
 */
export default function Three3DLogo({
  width = 240,
  height = 240,
  interactive = true,
  accentColor = 0xf05a24, // برتقالي الثعلب
  whiteColor = 0xf8f9fa,  // أبيض الصدر والأذنين
  darkColor = 0x1a1a20,   // الفحمي للأنف وحواف الأذنين
  showParticles = true,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. المشهد والكاميرا
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.3, 4.6);

    // 2. المحرك مع الشفافية وتنعيم الحواف
    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // المجموعة الشاملة للثعلب
    const rootGroup = new Group();
    scene.add(rootGroup);

    // خامات الثعلب بنمط Low-Poly (Flat Shading) لإبراز تفاصيل الهوية
    const orangeMat = new MeshStandardMaterial({
      color: accentColor,
      roughness: 0.35,
      metalness: 0.15,
      flatShading: true,
    });

    const whiteMat = new MeshStandardMaterial({
      color: whiteColor,
      roughness: 0.4,
      metalness: 0.05,
      flatShading: true,
    });

    const darkMat = new MeshStandardMaterial({
      color: darkColor,
      roughness: 0.25,
      metalness: 0.3,
      flatShading: true,
    });

    const eyeMat = new MeshStandardMaterial({
      color: 0x050508,
      emissive: 0x111116,
      roughness: 0.1,
      metalness: 0.9,
    });

    const goldEyeMat = new MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff7700,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.8,
    });

    // 3. بناء مجسم الثعلب
    const foxGroup = new Group();
    rootGroup.add(foxGroup);

    // --- الرأس (Head Group) ---
    const headGroup = new Group();
    headGroup.position.set(0, 0.35, 0.1);
    foxGroup.add(headGroup);

    // قبة الرأس والوجنتين (Main Head Shape)
    const craniumGeo = new DodecahedronGeometry(0.62, 0);
    const craniumMesh = new Mesh(craniumGeo, orangeMat);
    craniumMesh.scale.set(1.05, 0.95, 1.0);
    headGroup.add(craniumMesh);

    // الخطم / الفم البارز (Snout / Muzzle)
    const snoutGeo = new ConeGeometry(0.32, 0.72, 4);
    const snoutMesh = new Mesh(snoutGeo, orangeMat);
    snoutMesh.rotation.x = Math.PI / 2.3;
    snoutMesh.position.set(0, -0.15, 0.62);
    snoutMesh.scale.set(1.0, 1.0, 0.75);
    headGroup.add(snoutMesh);

    // فراء الخدين الأبيض (White Cheek Tufts)
    const leftCheekGeo = new ConeGeometry(0.25, 0.5, 3);
    const leftCheek = new Mesh(leftCheekGeo, whiteMat);
    leftCheek.position.set(-0.48, -0.18, 0.32);
    leftCheek.rotation.set(-0.2, 0.4, -1.2);
    headGroup.add(leftCheek);

    const rightCheekGeo = new ConeGeometry(0.25, 0.5, 3);
    const rightCheek = new Mesh(rightCheekGeo, whiteMat);
    rightCheek.position.set(0.48, -0.18, 0.32);
    rightCheek.rotation.set(-0.2, -0.4, 1.2);
    headGroup.add(rightCheek);

    // الفراء الأبيض أسفل الخطم (Muzzle underfur)
    const muzzleWhiteGeo = new ConeGeometry(0.24, 0.58, 3);
    const muzzleWhite = new Mesh(muzzleWhiteGeo, whiteMat);
    muzzleWhite.rotation.x = Math.PI / 2.3;
    muzzleWhite.position.set(0, -0.22, 0.58);
    muzzleWhite.scale.set(0.9, 0.9, 0.6);
    headGroup.add(muzzleWhite);

    // الأنف الأسود الصغير (Nose)
    const noseGeo = new ConeGeometry(0.08, 0.16, 4);
    const noseMesh = new Mesh(noseGeo, darkMat);
    noseMesh.rotation.x = Math.PI / 2.2;
    noseMesh.position.set(0, -0.06, 0.98);
    headGroup.add(noseMesh);

    // الأذن اليسرى (Left Ear)
    const leftEarGroup = new Group();
    leftEarGroup.position.set(-0.35, 0.52, 0.05);
    leftEarGroup.rotation.set(-0.2, 0.15, 0.35);

    const earOuterGeo = new ConeGeometry(0.28, 0.72, 3);
    const leftEarOuter = new Mesh(earOuterGeo, orangeMat);
    leftEarGroup.add(leftEarOuter);

    const earInnerGeo = new ConeGeometry(0.2, 0.58, 3);
    const leftEarInner = new Mesh(earInnerGeo, whiteMat);
    leftEarInner.position.set(0, -0.04, 0.05);
    leftEarGroup.add(leftEarInner);

    const earTipGeo = new ConeGeometry(0.12, 0.24, 3);
    const leftEarTip = new Mesh(earTipGeo, darkMat);
    leftEarTip.position.set(0, 0.25, 0.01);
    leftEarGroup.add(leftEarTip);
    headGroup.add(leftEarGroup);

    // الأذن اليمنى (Right Ear)
    const rightEarGroup = new Group();
    rightEarGroup.position.set(0.35, 0.52, 0.05);
    rightEarGroup.rotation.set(-0.2, -0.15, -0.35);

    const rightEarOuter = new Mesh(earOuterGeo, orangeMat);
    rightEarGroup.add(rightEarOuter);

    const rightEarInner = new Mesh(earInnerGeo, whiteMat);
    rightEarInner.position.set(0, -0.04, 0.05);
    rightEarGroup.add(rightEarInner);

    const rightEarTip = new Mesh(earTipGeo, darkMat);
    rightEarTip.position.set(0, 0.25, 0.01);
    rightEarGroup.add(rightEarTip);
    headGroup.add(rightEarGroup);

    // العينان الذكيتان (Fox Eyes)
    const eyeGeo = new ConeGeometry(0.07, 0.18, 4);
    const leftEye = new Mesh(eyeGeo, goldEyeMat);
    leftEye.position.set(-0.24, 0.02, 0.52);
    leftEye.rotation.set(0.6, 0.5, -0.8);
    leftEye.scale.set(0.7, 1.2, 0.5);
    headGroup.add(leftEye);

    const rightEye = new Mesh(eyeGeo, goldEyeMat);
    rightEye.position.set(0.24, 0.02, 0.52);
    rightEye.rotation.set(0.6, -0.5, 0.8);
    rightEye.scale.set(0.7, 1.2, 0.5);
    headGroup.add(rightEye);

    // --- الجسد والصدر (Body & Chest) ---
    const bodyGroup = new Group();
    bodyGroup.position.set(0, -0.45, -0.05);
    foxGroup.add(bodyGroup);

    // الجذع البرتقالي الأنيق
    const torsoGeo = new CylinderGeometry(0.42, 0.56, 1.05, 6);
    const torsoMesh = new Mesh(torsoGeo, orangeMat);
    torsoMesh.scale.set(1.0, 1.0, 0.85);
    bodyGroup.add(torsoMesh);

    // وشاح الصدر الأبيض الملكي (White Chest Fur)
    const chestGeo = new ConeGeometry(0.35, 0.85, 3);
    const chestMesh = new Mesh(chestGeo, whiteMat);
    chestMesh.position.set(0, 0.12, 0.32);
    chestMesh.rotation.set(-0.15, 0, 0);
    chestMesh.scale.set(1.1, 1.0, 0.6);
    bodyGroup.add(chestMesh);

    // الشريط الجانبي الفحمي المستوحى من اللوجو
    const flankGeo = new ConeGeometry(0.2, 0.7, 3);
    const flankMesh = new Mesh(flankGeo, darkMat);
    flankMesh.position.set(-0.25, -0.05, 0.25);
    flankMesh.rotation.set(0.2, 0.3, 0.4);
    flankMesh.scale.set(0.8, 0.9, 0.5);
    bodyGroup.add(flankMesh);

    // --- الذيل الرشيق الملتف (Sweeping Curved Tail) ---
    const tailGroup = new Group();
    tailGroup.position.set(0.22, -0.85, -0.2);
    foxGroup.add(tailGroup);

    // قاعدة الذيل
    const tailBaseGeo = new CylinderGeometry(0.26, 0.16, 0.6, 5);
    const tailBase = new Mesh(tailBaseGeo, orangeMat);
    tailBase.position.set(0.18, 0.22, 0.1);
    tailBase.rotation.set(0.4, 0.3, -0.7);
    tailGroup.add(tailBase);

    // وسط الذيل الكثيف الملتف للأمام
    const tailMidGeo = new CylinderGeometry(0.38, 0.28, 0.75, 6);
    const tailMid = new Mesh(tailMidGeo, orangeMat);
    tailMid.position.set(0.48, 0.55, 0.25);
    tailMid.rotation.set(0.3, 0.5, -0.4);
    tailGroup.add(tailMid);

    // طرف الذيل الأبيض المميز للثعلب (White Tail Tip)
    const tailTipGeo = new ConeGeometry(0.32, 0.65, 5);
    const tailTip = new Mesh(tailTipGeo, whiteMat);
    tailTip.position.set(0.62, 1.05, 0.38);
    tailTip.rotation.set(-0.2, 0.4, 0.4);
    tailGroup.add(tailTip);

    // --- جزيئات الشرار والضوء المدارية (Floating Embers) ---
    let particles;
    let particlesGeometry;
    let particlesMaterial;
    if (showParticles) {
      const pCount = 35;
      const positions = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount * 3; i += 3) {
        const rad = 1.3 + Math.random() * 1.1;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        positions[i] = rad * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = rad * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = rad * Math.cos(phi);
      }
      particlesGeometry = new BufferGeometry();
      particlesGeometry.setAttribute('position', new BufferAttribute(positions, 3));
      particlesMaterial = new PointsMaterial({
        color: 0xffa040,
        size: 0.045,
        transparent: true,
        opacity: 0.85,
      });
      particles = new Points(particlesGeometry, particlesMaterial);
      rootGroup.add(particles);
    }

    // 4. الإضاءة السينمائية
    const ambientLight = new AmbientLight(0xfff7ed, 1.1);
    scene.add(ambientLight);

    // ضوء أمامي دافئ يبرز خطوط الثعلب
    const dirLight = new DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(3, 4, 5);
    scene.add(dirLight);

    // ضوء خلفي ملون لإبراز حواف الأذنين والذيل (Rim Light)
    const rimLight = new PointLight(0xff6a00, 3.2, 12);
    rimLight.position.set(-3, 2, -2.5);
    scene.add(rimLight);

    const softFillLight = new PointLight(0x4080ff, 1.2, 10);
    softFillLight.position.set(2, -2, 2);
    scene.add(softFillLight);

    // 5. التفاعل وحركة الماوس
    let targetRotY = 0.15; // زاوية مائلة أنيقة افتراضياً
    let targetRotX = 0;

    const handleMouseMove = (e) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetRotY = 0.15 + x * 0.9;
      targetRotX = y * 0.5;
    };

    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    // 6. حلقة الرندرة والتحريك (Animation Loop)
    let animId;
    const clock = new Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // طفو لطيف للثعلب (Breathing / Floating)
      foxGroup.position.y = Math.sin(elapsed * 1.8) * 0.08;

      // حركة ذيل مرنة وحيوية (Tail Swish)
      tailGroup.rotation.y = Math.sin(elapsed * 2.2) * 0.18;
      tailGroup.rotation.z = Math.cos(elapsed * 1.5) * 0.08;

      // حركة أذنين خفيفة تنبض بالحياة
      leftEarGroup.rotation.z = 0.35 + Math.sin(elapsed * 3.5) * 0.02;
      rightEarGroup.rotation.z = -0.35 - Math.sin(elapsed * 3.5) * 0.02;

      // دوران الجزيئات حول الثعلب
      if (particles) {
        particles.rotation.y = elapsed * 0.08;
        particles.rotation.x = Math.sin(elapsed * 0.05) * 0.1;
      }

      // سلاسة توجيه الرأس والمجسم نحو الماوس (Smooth Interpolation)
      if (interactive) {
        foxGroup.rotation.y += (targetRotY - foxGroup.rotation.y) * 0.06;
        foxGroup.rotation.x += (targetRotX - foxGroup.rotation.x) * 0.06;
      } else {
        // دوران بطيء تلقائي إذا كان التفاعل مغلقاً
        foxGroup.rotation.y = Math.sin(elapsed * 0.8) * 0.3 + 0.1;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 7. التنظيف وإلغاء استهلاك الذاكرة
    return () => {
      cancelAnimationFrame(animId);
      if (interactive) {
        window.removeEventListener('mousemove', handleMouseMove);
      }
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      // التخلص من الخامات والأشكال الهندسية
      craniumGeo.dispose();
      snoutGeo.dispose();
      leftCheekGeo.dispose();
      rightCheekGeo.dispose();
      muzzleWhiteGeo.dispose();
      noseGeo.dispose();
      earOuterGeo.dispose();
      earInnerGeo.dispose();
      earTipGeo.dispose();
      eyeGeo.dispose();
      torsoGeo.dispose();
      chestGeo.dispose();
      flankGeo.dispose();
      tailBaseGeo.dispose();
      tailMidGeo.dispose();
      tailTipGeo.dispose();

      orangeMat.dispose();
      whiteMat.dispose();
      darkMat.dispose();
      eyeMat.dispose();
      goldEyeMat.dispose();

      if (particlesGeometry) particlesGeometry.dispose();
      if (particlesMaterial) particlesMaterial.dispose();
      renderer.dispose();
    };
  }, [width, height, interactive, accentColor, whiteColor, darkColor, showParticles]);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    />
  );
}
