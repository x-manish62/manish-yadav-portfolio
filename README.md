# Manish Yadav — Portfolio v3

A lightweight multi-page portfolio for VS Code. Every major section is a separate HTML page, not a single-page scroll site.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Pages

- `index.html` — Home
- `about.html` — About
- `education.html` — Education
- `skills.html` — Skills
- `projects.html` — Projects
- `experience.html` — Experience
- `achievements.html` — Achievements
- `certifications.html` — Certifications
- `content.html` — YouTube / Content
- `blog.html` — Blog
- `documents.html` — Resume, CV and professional links
- `contact.html` — General contact form
- `hire.html` — Separate hiring form
- `project-*.html` — Individual project detail pages

## Easy editing

Edit the page you need directly. For example:

- Contact → `public/contact.html`
- Skills → `public/skills.html`
- Projects → `public/projects.html`
- Certificates → `public/certifications.html`
- Home → `public/index.html`

Shared visual styling is in `public/styles.css`; navigation, network background, page transitions and forms are in `public/js/common.js`.

## Photos

Replace these files with your six photos:

`public/assets/hero-1.jpg` through `public/assets/hero-6.jpg`

Your main profile image is `public/assets/image.jpg`.

## Resume / CV

- Resume: `public/assets/Manish-Yadav-Resume.pdf`
- CV: `public/assets/Manish-Yadav-CV.pdf`

The Documents page provides separate download/open buttons.

## Forms / email / database

The Express backend stores Contact and Hire submissions in `data/submissions.json`. Optional MySQL and SMTP settings are available in `server/.env.example`. Copy it to `server/.env` and fill in your values.

For Gmail notifications, use an App Password rather than your normal Gmail password.

## Easy visual editing
Shared styles live in `public/css/shared.css`. Every page also has its own file under `public/css/pages/`, so page-specific changes can be made without hunting through one giant stylesheet. Home-specific hero/carousel styling is in `public/css/pages/home.css`.
