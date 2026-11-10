"use client";

import { useEffect, useRef } from "react";

/**
 * 3D-сцена первого экрана: «нейронная сфера» из светящихся точек + орбита + звёздная пыль.
 * Лёгкая по построению:
 *  - three.js грузится отдельным чанком после отрисовки страницы;
 *  - одна draw-call на слой, точки считает шейдер (CPU свободен);
 *  - на телефоне в 2–3 раза меньше точек, pixel ratio ≤ 1.5;
 *  - рендер стоит, когда сцена вне экрана или вкладка скрыта;
 *  - prefers-reduced-motion — один статичный кадр; нет WebGL — остаётся CSS-градиент.
 */

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aRand;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 dir = normalize(position);
    float wave = sin(dir.x * 3.1 + uTime * 0.55) * sin(dir.y * 2.7 + uTime * 0.45) * sin(dir.z * 3.3 + uTime * 0.6);
    float pulse = sin(uTime * 1.6 + aRand * 6.2831) * 0.015;
    vec3 p = dir * (length(position) + wave * 0.16 + pulse);

    vec3 blue = vec3(0.24, 0.42, 1.0);
    vec3 violet = vec3(0.64, 0.27, 0.96);
    vec3 cyan = vec3(0.13, 0.83, 0.93);
    vec3 c = mix(blue, violet, smoothstep(-0.8, 0.9, dir.y + wave * 0.6));
    c = mix(c, cyan, smoothstep(0.35, 0.95, wave + aRand * 0.25) * 0.55);
    vColor = c;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Точки на дальней стороне сферы тусклее — читается объём.
    vAlpha = smoothstep(-7.8, -3.6, mv.z) * (0.62 + aRand * 0.5);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.55 + aRand * 0.9) / -mv.z;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    // Яркое ядро + мягкий ореол: точка светится, а не просто рисуется.
    float core = smoothstep(0.18, 0.0, d);
    gl_FragColor = vec4(vColor + core * 0.35, (a * a * 0.85 + core * 0.6) * vAlpha);
  }
`;

function fibonacciSphere(count: number, radius: number) {
  const pos = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    const jitter = radius * (1 + (Math.random() - 0.5) * 0.05);
    pos.set([Math.cos(t) * r * jitter, y * jitter, Math.sin(t) * r * jitter], i * 3);
  }
  return pos;
}

function ring(count: number, radius: number, spread: number) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = radius + (Math.random() - 0.5) * spread;
    pos.set([Math.cos(a) * r, (Math.random() - 0.5) * spread * 0.25, Math.sin(a) * r], i * 3);
  }
  return pos;
}

function dust(count: number) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) pos.set([(Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8 - 2], i * 3);
  return pos;
}

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function HeroScene({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !supportsWebGL()) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      const small = window.innerWidth < 768;
      const lowPower = small || (navigator.hardwareConcurrency ?? 8) <= 4;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.5);

      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(pixelRatio);
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(0, 0, 6.2);

      const group = new THREE.Group();
      scene.add(group);

      const uniforms = {
        uTime: { value: 0 },
        uSize: { value: lowPower ? 46 : 44 },
        uPixelRatio: { value: pixelRatio },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const layer = (positions: Float32Array) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const rand = new Float32Array(positions.length / 3);
        for (let i = 0; i < rand.length; i++) rand[i] = Math.random();
        geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
        return new THREE.Points(geo, material);
      };

      const sphere = layer(fibonacciSphere(lowPower ? 1800 : 4200, 1.55));
      const orbit = layer(ring(lowPower ? 500 : 1200, 2.45, 0.35));
      orbit.rotation.set(1.15, 0.2, 0.35);
      const orbit2 = layer(ring(lowPower ? 250 : 600, 2.95, 0.2));
      orbit2.rotation.set(-0.9, 0.5, -0.2);
      const stars = layer(dust(lowPower ? 220 : 500));
      group.add(sphere, orbit, orbit2);
      scene.add(stars);

      const layout = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Десктоп: сфера справа от текста; телефон: по центру, за текстом.
        const wide = w >= 1024;
        group.position.set(wide ? 1.75 : 0, wide ? 0 : 0.35, 0);
        group.scale.setScalar(wide ? 1 : w < 480 ? 0.78 : 0.9);
      };
      layout();
      const resize = new ResizeObserver(layout);
      resize.observe(el);

      // Наклон за мышью — плавно, без рывков.
      const target = { x: 0, y: 0 };
      const tilt = { x: 0, y: 0 };
      const onPointer = (e: PointerEvent) => {
        target.x = (e.clientY / window.innerHeight - 0.5) * 0.35;
        target.y = (e.clientX / window.innerWidth - 0.5) * 0.5;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      let visible = true;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      io.observe(el);

      const clock = new THREE.Clock();
      let frame = 0;
      const render = () => {
        const t = clock.getElapsedTime();
        uniforms.uTime.value = t;
        tilt.x += (target.x - tilt.x) * 0.04;
        tilt.y += (target.y - tilt.y) * 0.04;
        group.rotation.set(tilt.x, t * 0.08 + tilt.y, 0);
        orbit.rotation.z = 0.35 + t * 0.12;
        orbit2.rotation.z = -0.2 - t * 0.07;
        stars.rotation.y = t * 0.01;
        renderer.render(scene, camera);
      };

      const loop = () => {
        frame = requestAnimationFrame(loop);
        if (visible && document.visibilityState === "visible") render();
      };

      if (reduced) render();
      else loop();
      el.dataset.ready = "true";

      cleanup = () => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onPointer);
        [sphere, orbit, orbit2, stars].forEach((p) => p.geometry.dispose());
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => {
      /* без WebGL остаётся градиентный фон */
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div ref={host} aria-hidden className={className} />;
}
