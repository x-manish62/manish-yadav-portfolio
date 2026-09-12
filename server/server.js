require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');

const app = express();

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

const DATA_DIR = path.join(ROOT, 'data');
const DATA = path.join(DATA_DIR, 'submissions.json');

/* --------------------------------------------------
   Ensure data directory exists
-------------------------------------------------- */

fs.mkdirSync(DATA_DIR, {
    recursive: true
});

/* --------------------------------------------------
   Middleware
-------------------------------------------------- */

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
    express.static(
        path.join(ROOT, 'public')
    )
);

/* --------------------------------------------------
   Local JSON Storage
-------------------------------------------------- */

function safeRead() {
    try {
        return JSON.parse(
            fs.readFileSync(DATA, 'utf8') || '[]'
        );
    } catch {
        return [];
    }
}

function safeWrite(items) {
    fs.writeFileSync(
        DATA,
        JSON.stringify(items, null, 2)
    );
}

/* --------------------------------------------------
   MySQL Database
-------------------------------------------------- */

let pool = null;

async function db() {
    if (pool) {
        return pool;
    }

    if (process.env.DB_HOST) {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database:
                process.env.DB_NAME ||
                'manish_portfolio',
            connectionLimit: 5
        });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(30),
                created_at DATETIME,
                payload JSON
            )
        `);

        return pool;
    }

    return null;
}

/* --------------------------------------------------
   Save Submission
-------------------------------------------------- */

async function saveSubmission(type, data) {
    const record = {
        id: Date.now().toString(),
        type,
        createdAt: new Date().toISOString(),
        data
    };

    const items = safeRead();

    items.unshift(record);

    safeWrite(items);

    const p = await db();

    if (p) {
        await p.query(
            `
            INSERT INTO submissions
            (type, created_at, payload)
            VALUES (?, ?, ?)
            `,
            [
                type,
                new Date(),
                JSON.stringify(data)
            ]
        );
    }

    return record;
}

/* --------------------------------------------------
   Email Notification
-------------------------------------------------- */

async function notify(type, data) {
    if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
    ) {
        return false;
    }

    const transporter =
        nodemailer.createTransport({
            host: process.env.SMTP_HOST,

            port: Number(
                process.env.SMTP_PORT || 587
            ),

            secure:
                String(
                    process.env.SMTP_SECURE
                ) === 'true',

            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

    const lines = Object.entries(data)
        .filter(([key]) => key !== 'website')
        .map(
            ([key, value]) =>
                `${key}: ${value}`
        )
        .join('\n');

    await transporter.sendMail({
        from:
            process.env.SMTP_FROM ||
            process.env.SMTP_USER,

        to:
            process.env.NOTIFY_EMAIL ||
            'yadavmanishmky2004@gmail.com',

        subject:
            `Portfolio ${type}: ${
                data.name || 'New submission'
            }`,

        text:
            `New ${type} submission from Manish Yadav portfolio.\n\n${lines}`
    });

    return true;
}

/* --------------------------------------------------
   Spam Protection
-------------------------------------------------- */

function validate(req, res, next) {
    if (req.body.website) {
        return res
            .status(400)
            .json({
                message: 'Spam detected.'
            });
    }

    next();
}

/* --------------------------------------------------
   Contact Form API
-------------------------------------------------- */

app.post(
    '/api/contact',
    validate,
    async (req, res) => {
        try {
            const data = req.body;

            await saveSubmission(
                'contact',
                data
            );

            const emailed =
                await notify(
                    'contact',
                    data
                );

            res.json({
                message: emailed
                    ? 'Message sent. Email notification delivered.'
                    : 'Message saved. Configure SMTP in .env for email notifications.'
            });
        } catch (e) {
            console.error(e);

            res
                .status(500)
                .json({
                    message:
                        'Could not save the message.'
                });
        }
    }
);

/* --------------------------------------------------
   Hire Form API
-------------------------------------------------- */

app.post(
    '/api/hire',
    validate,
    async (req, res) => {
        try {
            const data = req.body;

            await saveSubmission(
                'hire',
                data
            );

            const emailed =
                await notify(
                    'hire',
                    data
                );

            res.json({
                message: emailed
                    ? 'Hiring request sent. Email notification delivered.'
                    : 'Hiring request saved. Configure SMTP in .env for email notifications.'
            });
        } catch (e) {
            console.error(e);

            res
                .status(500)
                .json({
                    message:
                        'Could not save the hiring request.'
                });
        }
    }
);

/* --------------------------------------------------
   Admin Submissions
-------------------------------------------------- */

app.get(
    '/api/admin/submissions',
    async (req, res) => {
        if (
            !process.env.ADMIN_KEY ||
            req.query.key !==
                process.env.ADMIN_KEY
        ) {
            return res
                .status(401)
                .json({
                    message:
                        'Invalid admin key.'
                });
        }

        try {
            const p = await db();

            if (p) {
                const [rows] =
                    await p.query(
                        `
                        SELECT *
                        FROM submissions
                        ORDER BY created_at DESC
                        LIMIT 200
                        `
                    );

                return res.json({
                    items: rows.map(
                        (r) => ({
                            id: r.id,
                            type: r.type,
                            createdAt:
                                r.created_at,
                            data:
                                typeof r.payload ===
                                'string'
                                    ? JSON.parse(
                                          r.payload
                                      )
                                    : r.payload
                        })
                    )
                });
            }

            res.json({
                items: safeRead().slice(
                    0,
                    200
                )
            });
        } catch (e) {
            console.error(e);

            res
                .status(500)
                .json({
                    message:
                        'Could not load submissions.'
                });
        }
    }
);

/* --------------------------------------------------
   Health Check
-------------------------------------------------- */

app.get(
    '/health',
    (req, res) => {
        res.json({
            ok: true
        });
    }
);

/* --------------------------------------------------
   Start Server
-------------------------------------------------- */

app.listen(
    PORT,
    () => {
        console.log(
            `Portfolio running on http://localhost:${PORT}`
        );
    }
);