require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');

const app = express();

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA = path.join(DATA_DIR, 'submissions.json');

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC));

// --------------------------------------------------
// Data Storage
// --------------------------------------------------

function ensureDataFile() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        if (!fs.existsSync(DATA)) {
            fs.writeFileSync(DATA, '[]', 'utf8');
        }

        return true;
    } catch (error) {
        console.error('Data initialization error:', error);
        return false;
    }
}

function safeRead() {
    try {
        ensureDataFile();

        const content = fs.readFileSync(DATA, 'utf8');

        if (!content.trim()) {
            return [];
        }

        const parsed = JSON.parse(content);

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Read submissions error:', error);
        return [];
    }
}

function safeWrite(items) {
    try {
        ensureDataFile();

        fs.writeFileSync(
            DATA,
            JSON.stringify(items, null, 2),
            'utf8'
        );

        return true;
    } catch (error) {
        console.error('Write submissions error:', error);
        return false;
    }
}

// --------------------------------------------------
// MySQL
// --------------------------------------------------

let pool = null;

async function getDatabase() {
    if (pool) {
        return pool;
    }

    if (!process.env.DB_HOST) {
        return null;
    }

    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'manish_portfolio',
            connectionLimit: 5
        });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(30) NOT NULL,
                created_at DATETIME NOT NULL,
                payload JSON NOT NULL
            )
        `);

        console.log('MySQL connected successfully.');

        return pool;
    } catch (error) {
        console.error('MySQL connection error:', error);
        pool = null;
        return null;
    }
}

// --------------------------------------------------
// Save Submission
// --------------------------------------------------

async function saveSubmission(type, data) {
    const record = {
        id: Date.now().toString(),
        type: type,
        createdAt: new Date().toISOString(),
        data: data
    };

    // Always try local JSON storage
    const items = safeRead();
    items.unshift(record);

    const saved = safeWrite(items);

    if (!saved) {
        throw new Error('Could not write submission data.');
    }

    // Optional MySQL storage
    const database = await getDatabase();

    if (database) {
        try {
            await database.query(
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
        } catch (error) {
            console.error('MySQL save error:', error);
        }
    }

    return record;
}

// --------------------------------------------------
// Email Notification
// --------------------------------------------------

async function notify(type, data) {
    const required = [
        process.env.SMTP_HOST,
        process.env.SMTP_USER,
        process.env.SMTP_PASS
    ];

    if (required.some(value => !value)) {
        console.warn('SMTP is not configured.');
        return false;
    }

    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',

            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        await transporter.verify();

        const lines = Object.entries(data)
            .filter(([key]) => key !== 'website')
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');

        const recipient =
            process.env.NOTIFY_EMAIL ||
            process.env.SMTP_USER;

        await transporter.sendMail({
            from:
                process.env.SMTP_FROM ||
                process.env.SMTP_USER,

            to: recipient,

            replyTo: data.email || undefined,

            subject:
                `Portfolio ${type}: ${
                    data.name || 'New submission'
                }`,

            text:
                `New ${type} submission from Manish Yadav Portfolio.\n\n` +
                `${lines}\n\n` +
                `Submitted at: ${new Date().toISOString()}`
        });

        console.log(`Email notification sent for ${type}.`);

        return true;
    } catch (error) {
        console.error('SMTP email error:', error);
        return false;
    }
}

// --------------------------------------------------
// Validation / Anti-Spam
// --------------------------------------------------

function validate(req, res, next) {
    if (req.body && req.body.website) {
        return res.status(400).json({
            success: false,
            message: 'Spam detected.'
        });
    }

    next();
}

// --------------------------------------------------
// Contact API
// --------------------------------------------------

app.post(
    '/api/contact',
    validate,
    async (req, res) => {
        try {
            const data = req.body || {};

            const record = await saveSubmission(
                'contact',
                data
            );

            const emailed = await notify(
                'contact',
                data
            );

            return res.status(200).json({
                success: true,
                saved: true,
                emailed: emailed,
                message: emailed
                    ? 'Message sent successfully. Email notification delivered.'
                    : 'Message sent successfully. Email notification is currently unavailable.',
                id: record.id
            });

        } catch (error) {
            console.error(
                'CONTACT API ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                saved: false,
                message:
                    'Could not save the message.'
            });
        }
    }
);

// --------------------------------------------------
// Hire API
// --------------------------------------------------

app.post(
    '/api/hire',
    validate,
    async (req, res) => {
        try {
            const data = req.body || {};

            const record = await saveSubmission(
                'hire',
                data
            );

            const emailed = await notify(
                'hire',
                data
            );

            return res.status(200).json({
                success: true,
                saved: true,
                emailed: emailed,
                message: emailed
                    ? 'Hiring request sent successfully. Email notification delivered.'
                    : 'Hiring request saved successfully. Email notification is currently unavailable.',
                id: record.id
            });

        } catch (error) {
            console.error(
                'HIRE API ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                saved: false,
                message:
                    'Could not save the hiring request.'
            });
        }
    }
);

// --------------------------------------------------
// Admin Submissions
// --------------------------------------------------

app.get(
    '/api/admin/submissions',
    async (req, res) => {
        try {
            const adminKey =
                process.env.ADMIN_KEY;

            if (
                !adminKey ||
                req.query.key !== adminKey
            ) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid admin key.'
                });
            }

            const database =
                await getDatabase();

            if (database) {
                try {
                    const [rows] =
                        await database.query(
                            `
                            SELECT *
                            FROM submissions
                            ORDER BY created_at DESC
                            LIMIT 200
                            `
                        );

                    return res.json({
                        success: true,
                        items: rows.map(row => ({
                            id: row.id,
                            type: row.type,
                            createdAt:
                                row.created_at,
                            data:
                                typeof row.payload === 'string'
                                    ? JSON.parse(row.payload)
                                    : row.payload
                        }))
                    });
                } catch (error) {
                    console.error(
                        'Admin MySQL error:',
                        error
                    );
                }
            }

            return res.json({
                success: true,
                items: safeRead().slice(0, 200)
            });

        } catch (error) {
            console.error(
                'Admin API error:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Could not load submissions.'
            });
        }
    }
);

// --------------------------------------------------
// Health Check
// --------------------------------------------------

app.get(
    '/health',
    (req, res) => {
        res.json({
            success: true,
            ok: true,
            service:
                'Manish Yadav Portfolio',
            timestamp:
                new Date().toISOString()
        });
    }
);

// --------------------------------------------------
// Start Server
// --------------------------------------------------

app.listen(
    PORT,
    () => {
        console.log(
            `Portfolio running on port ${PORT}`
        );
    }
);