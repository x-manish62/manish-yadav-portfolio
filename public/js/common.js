const NAV = [
  ["Home", "index.html"],
  ["About", "about.html"],
  ["Education", "education.html"],
  ["Skills", "skills.html"],
  ["Projects", "projects.html"],
  ["Experience", "experience.html"],
  ["Achievements", "achievements.html"],
  ["Certifications", "certifications.html"],
  ["Content", "content.html"],
  ["Blog", "blog.html"]
];

const ACTIONS = [
  ["Documents", "documents.html", "link"],
  ["Contact", "contact.html", "link"],
  ["Hire Me", "hire.html", "primary"]
];

function renderShell() {
  const header = document.querySelector("#site-header");
  if (header) {
    const navHtml = NAV.map(([name, href]) => `<a href="${href}" data-nav="${href}">${name}</a>`).join("");
    const actionHtml = ACTIONS.map(([name, href, cls]) => `<a class="btn small ${cls}" href="${href}">${name}</a>`).join("");
    const mobileHtml = [...NAV, ...ACTIONS.map(([name, href]) => [name, href])]
      .map(([name, href]) => `<a href="${href}">${name}</a>`).join("");

    header.innerHTML = `
      <div class="container">
        <div class="nav">
          <a class="brand" href="index.html" aria-label="Manish Yadav home">
            <span class="brand-mark">MY</span>
            <span>
              <span class="brand-name">Manish Yadav</span>
              <span class="brand-sub">IT • Full Stack • AI</span>
            </span>
          </a>
          <nav class="navlinks" aria-label="Primary navigation">${navHtml}</nav>
          <div class="header-actions">${actionHtml}</div>
          <button class="mobile-toggle" id="menuBtn" aria-label="Open navigation">☰</button>
        </div>
        <div class="mobile-menu" id="mobileMenu">${mobileHtml}</div>
      </div>
    `;

    const page = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === page) link.classList.add("active");
    });

    document.querySelector("#menuBtn")?.addEventListener("click", () => {
      document.querySelector("#mobileMenu")?.classList.toggle("open");
    });
  }

  const footer = document.querySelector("#site-footer");
  if (footer) {
    footer.innerHTML = `
      <div class="container footer-inner">
        <span>© ${new Date().getFullYear()} Manish Yadav · Professional portfolio</span>
        <span>
          <a href="mailto:yadavmanishmky2004@gmail.com">Email</a> ·
          <a href="https://github.com/x-manish62" target="_blank" rel="noreferrer">GitHub</a> ·
          <a href="https://www.linkedin.com/in/manish-yadav-359412340" target="_blank" rel="noreferrer">LinkedIn</a>
        </span>
      </div>
    `;
  }
}

function networkBackground() {
  const canvas = document.querySelector("#network");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let points = [];
  const density = () => Math.min(78, Math.max(34, Math.round(innerWidth / 17)));

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.width = Math.floor(innerWidth * ratio);
    height = canvas.height = Math.floor(innerHeight * ratio);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    points = Array.from({ length: density() }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - .5) * 1,
      vy: (Math.random() - .5) * 1,
      r: Math.random() * 1.6 + .6
    }));
  }

  resize();
  addEventListener("resize", resize);

  function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    for (const point of points) {
      point.x += point.vx;
      point.y += point.vy;
      if (point.x < -20 || point.x > innerWidth + 20) point.vx *= -1;
      if (point.y < -20 || point.y > innerHeight + 20) point.vy *= -1;
    }

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < 175) {
          ctx.strokeStyle = `rgba(88, 166, 255, ${(1 - distance / 175) * .13})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const point of points) {
      ctx.fillStyle = "rgba(77, 217, 255, .34)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  draw();
}

function pageTransitions() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    if (link.origin !== location.origin) return;
    if (!link.href.includes(location.origin)) return;

    const target = new URL(link.href);
    if (target.pathname === location.pathname && !target.hash) return;

    if (document.startViewTransition) return;
    event.preventDefault();
    document.body.classList.add("leaving");
    setTimeout(() => { location.href = link.href; }, 180);
  });
}

function initViewTransitionStyle() {
  const style = document.createElement("style");
  style.textContent = `
    @supports (view-transition-name: page) {
      ::view-transition-old(root) { animation: pageOut .22s ease both; }
      ::view-transition-new(root) { animation: pageIn .42s ease both; }
    }
    @keyframes pageOut { to { opacity: 0; transform: translateY(-6px); } }
    body.leaving { opacity: 0; transform: translateY(-6px); transition: opacity .18s ease, transform .18s ease; }
  `;
  document.head.appendChild(style);
}

function initCarousel() {
  const track = document.querySelector(".carousel-track");
  if (!track) return;

  const slides = [...track.children];
  const counter = document.querySelector("#carouselCounter");
  const dots = [...document.querySelectorAll(".carousel-dot")];
  let index = 0;
  let paused = false;
  let timer;

  function updateUi() {
    if (counter) {
      counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    }

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === index);
    });
  }

  function go(nextIndex) {
    index = (nextIndex + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    updateUi();
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!paused) go(index + 1);
    }, 4200);
  }

  document.querySelector("#prev")?.addEventListener("click", () => go(index - 1));
  document.querySelector("#next")?.addEventListener("click", () => go(index + 1));

  document.querySelector("#pause")?.addEventListener("click", (event) => {
    paused = !paused;
    event.currentTarget.textContent = paused ? "▶" : "Ⅱ";
  });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => go(Number(dot.dataset.slide)));
  });

  updateUi();
  startTimer();
}

function formSubmit(form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector(".form-status");
    button.disabled = true;
    button.textContent = "Sending…";

    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const response = await fetch(form.dataset.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to send.");
      status.textContent = data.message || "Submitted successfully.";
      status.className = "notice form-status";
      form.reset();
    } catch (error) {
      status.textContent = error.message || "Something went wrong.";
      status.className = "notice form-status";
    } finally {
      button.disabled = false;
      button.textContent = form.dataset.button || "Send";
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderShell();
  networkBackground();
  initCarousel();
  pageTransitions();
  initViewTransitionStyle();
  document.querySelectorAll("form[data-endpoint]").forEach(formSubmit);
});
