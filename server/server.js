require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');

const app = express();

// ======================================================
// BASIC CONFIGURATION
// ======================================================

const PORT = process.env.PORT || 3000;

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(PUBLIC_DIR));

// ======================================================
// LOCAL DATA STORAGE
// ======================================================

function ensureDataStorage() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, '[]', 'utf8');
        }

        return true;
    } catch (error) {
        console.error('DATA STORAGE ERROR:', error);
        return false;
    }
}

function readSubmissions() {
    try {
        ensureDataStorage();

        const fileContent = fs.readFileSync(
            DATA_FILE,
            'utf8'
        );

        if (!fileContent.trim()) {
            return [];
        }

        const data = JSON.parse(fileContent);

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('READ SUBMISSIONS ERROR:', error);
        return [];
    }
}

function writeSubmissions(items) {
    try {
        ensureDataStorage();

        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(items, null, 2),
            'utf8'
        );

        return true;
    } catch (error) {
        console.error('WRITE SUBMISSIONS ERROR:', error);
        return false;
    }
}

// ======================================================
// MYSQL DATABASE - OPTIONAL
// ======================================================

let dbPool = null;

async function getDatabase() {
    if (dbPool) {
        return dbPool;
    }

    if (!process.env.DB_HOST) {
        return null;
    }

    try {
        dbPool = mysql.createPool({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database:
                process.env.DB_NAME ||
                'manish_portfolio',
            connectionLimit: 5
        });

        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(30) NOT NULL,
                created_at DATETIME NOT NULL,
                payload JSON NOT NULL
            )
        `);

        console.log('MySQL connected successfully.');

        return dbPool;
    } catch (error) {
        console.error(
            'MYSQL CONNECTION ERROR:',
            error.message
        );

        dbPool = null;

        return null;
    }
}

// ======================================================
// SAVE SUBMISSION
// ======================================================

async function saveSubmission(type, data) {
    const record = {
        id: Date.now().toString(),
        type,
        createdAt: new Date().toISOString(),
        data
    };

    // ------------------------------
    // Save to JSON
    // ------------------------------

    const submissions = readSubmissions();

    submissions.unshift(record);

    const saved = writeSubmissions(
        submissions
    );

    if (!saved) {
        throw new Error(
            'Could not write submission data.'
        );
    }

    // ------------------------------
    // Optional MySQL
    // ------------------------------

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

            console.log(
                `Saved ${type} submission to MySQL.`
            );
        } catch (error) {
            console.error(
                'MYSQL SAVE ERROR:',
                error.message
            );
        }
    }

    console.log(
        `Saved ${type} submission:`,
        record.id
    );

    return record;
}

// ======================================================
// CREATE SMTP TRANSPORTER
// ======================================================

function createTransporter(port) {
    return nodemailer.createTransport({
        host:
            process.env.SMTP_HOST ||
            'smtp.gmail.com',

        port,

        secure: port === 465,

        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },

        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
    });
}

// ======================================================
// SEND EMAIL
// ======================================================

async function sendEmail(type, data) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
        console.error(
            'SMTP ERROR: SMTP_HOST, SMTP_USER or SMTP_PASS is missing.'
        );

        return false;
    }

    const recipient =
        process.env.NOTIFY_EMAIL ||
        smtpUser;

    const sender =
        process.env.SMTP_FROM ||
        smtpUser;

    const lines = Object.entries(data)
        .filter(([key]) => key !== 'website')
        .map(
            ([key, value]) =>
                `${key}: ${value}`
        )
        .join('\n');

    const mailOptions = {
        from: sender,

        to: recipient,

        replyTo:
            data.email || undefined,

        subject:
            `Portfolio ${type}: ${
                data.name ||
                'New submission'
            }`,

        text:
            `New ${type} submission from Manish Yadav Portfolio.\n\n` +
            `${lines}\n\n` +
            `Submitted at: ${new Date().toISOString()}`
    };

    // ==================================================
    // TRY SMTP PORT 465
    // ==================================================

    try {
        console.log(
            'Trying Gmail SMTP port 465...'
        );

        const transporter465 =
            createTransporter(465);

        await transporter465.sendMail(
            mailOptions
        );

        console.log(
            'EMAIL SENT SUCCESSFULLY using port 465.'
        );

        return true;
    } catch (error465) {
        console.error(
            'SMTP 465 FAILED:',
            error465.message
        );
    }

    // ==================================================
    // TRY SMTP PORT 587
    // ==================================================

    try {
        console.log(
            'Trying Gmail SMTP port 587...'
        );

        const transporter587 =
            createTransporter(587);

        await transporter587.sendMail(
            mailOptions
        );

        console.log(
            'EMAIL SENT SUCCESSFULLY using port 587.'
        );

        return true;
    } catch (error587) {
        console.error(
            'SMTP 587 FAILED:',
            error587.message
        );
    }

    console.error(
        'EMAIL FAILED: Both Gmail SMTP ports failed.'
    );

    return false;
}

// ======================================================
// ANTI-SPAM VALIDATION
// ======================================================

function validateRequest(req, res, next) {
    if (
        req.body &&
        req.body.website
    ) {
        return res.status(400).json({
            success: false,
            message: 'Spam detected.'
        });
    }

    next();
}

// ======================================================
// CONTACT FORM
// ======================================================

app.post(
    '/api/contact',
    validateRequest,
    async (req, res) => {
        try {
            const data = req.body || {};

            // Save first
            const record =
                await saveSubmission(
                    'contact',
                    data
                );

            // Email second
            const emailSent =
                await sendEmail(
                    'contact',
                    data
                );

            if (emailSent) {
                return res.status(200).json({
                    success: true,
                    saved: true,
                    emailed: true,
                    id: record.id,
                    message:
                        'Message sent successfully. Email notification delivered.'
                });
            }

            return res.status(200).json({
                success: true,
                saved: true,
                emailed: false,
                id: record.id,
                message:
                    'Message sent successfully. Email notification is currently unavailable.'
            });

        } catch (error) {
            console.error(
                'CONTACT FORM ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                saved: false,
                emailed: false,
                message:
                    'Could not save the message.'
            });
        }
    }
);

// ======================================================
// HIRE FORM
// ======================================================

app.post(
    '/api/hire',
    validateRequest,
    async (req, res) => {
        try {
            const data = req.body || {};

            const record =
                await saveSubmission(
                    'hire',
                    data
                );

            const emailSent =
                await sendEmail(
                    'hire',
                    data
                );

            if (emailSent) {
                return res.status(200).json({
                    success: true,
                    saved: true,
                    emailed: true,
                    id: record.id,
                    message:
                        'Hiring request sent successfully. Email notification delivered.'
                });
            }

            return res.status(200).json({
                success: true,
                saved: true,
                emailed: false,
                id: record.id,
                message:
                    'Hiring request saved successfully. Email notification is currently unavailable.'
            });

        } catch (error) {
            console.error(
                'HIRE FORM ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                saved: false,
                emailed: false,
                message:
                    'Could not save the hiring request.'
            });
        }
    }
);

// ======================================================
// ADMIN SUBMISSIONS
// ======================================================

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
                    message:
                        'Invalid admin key.'
                });
            }

            const database =
                await getDatabase();

            if (database) {
                try {
                    const [rows] =
                        await database.query(`
                            SELECT *
                            FROM submissions
                            ORDER BY created_at DESC
                            LIMIT 200
                        `);

                    return res.json({
                        success: true,

                        items: rows.map(
                            row => ({
                                id: row.id,
                                type: row.type,
                                createdAt:
                                    row.created_at,
                                data:
                                    typeof row.payload ===
                                    'string'
                                        ? JSON.parse(
                                            row.payload
                                        )
                                        : row.payload
                            })
                        )
                    });
                } catch (error) {
                    console.error(
                        'ADMIN MYSQL ERROR:',
                        error.message
                    );
                }
            }

            return res.json({
                success: true,
                items:
                    readSubmissions()
                        .slice(0, 200)
            });

        } catch (error) {
            console.error(
                'ADMIN API ERROR:',
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

// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
    '/health',
    (req, res) => {
        res.json({
            success: true,
            ok: true,
            service:
                'Manish Yadav Portfolio',
            smtpConfigured:
                Boolean(
                    process.env.SMTP_HOST &&
                    process.env.SMTP_USER &&
                    process.env.SMTP_PASS
                ),
            timestamp:
                new Date().toISOString()
        });
    }
);

// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,
    () => {
        console.log(
            `Manish Yadav Portfolio running on port ${PORT}`
        );
    }
);