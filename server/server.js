require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');

const app = express();

/* ==================================================
   BASIC CONFIGURATION
================================================== */

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

/* ==================================================
   CREATE DATA DIRECTORY
================================================== */

try {
    fs.mkdirSync(DATA_DIR, {
        recursive: true
    });

    console.log('Data directory ready:', DATA_DIR);
} catch (error) {
    console.error(
        'Could not create data directory:',
        error
    );
}

/* ==================================================
   MIDDLEWARE
================================================== */

app.use(
    express.json({
        limit: '1mb'
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(
    express.static(
        path.join(ROOT, 'public')
    )
);

/* ==================================================
   LOCAL JSON STORAGE
================================================== */

function safeRead() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(
                DATA_FILE,
                '[]',
                'utf8'
            );

            return [];
        }

        const content = fs.readFileSync(
            DATA_FILE,
            'utf8'
        );

        if (!content.trim()) {
            return [];
        }

        const parsed = JSON.parse(content);

        return Array.isArray(parsed)
            ? parsed
            : [];
    } catch (error) {
        console.error(
            'Could not read submissions file:',
            error
        );

        return [];
    }
}

function safeWrite(items) {
    try {
        fs.mkdirSync(DATA_DIR, {
            recursive: true
        });

        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(
                items,
                null,
                2
            ),
            'utf8'
        );

        return true;
    } catch (error) {
        console.error(
            'Could not write submissions file:',
            error
        );

        return false;
    }
}

/* ==================================================
   IN-MEMORY BACKUP
================================================== */

let memorySubmissions = [];

/* ==================================================
   MYSQL CONNECTION
================================================== */

let pool = null;

async function getDatabase() {
    if (pool) {
        return pool;
    }

    if (
        !process.env.DB_HOST ||
        !process.env.DB_USER ||
        !process.env.DB_PASSWORD
    ) {
        return null;
    }

    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,

            port: Number(
                process.env.DB_PORT || 3306
            ),

            user: process.env.DB_USER,

            password:
                process.env.DB_PASSWORD,

            database:
                process.env.DB_NAME ||
                'manish_portfolio',

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

        console.log('MySQL database connected.');

        return pool;
    } catch (error) {
        console.error(
            'MySQL connection failed:',
            error
        );

        pool = null;

        return null;
    }
}

/* ==================================================
   SAVE SUBMISSION
================================================== */

async function saveSubmission(
    type,
    data
) {
    const record = {
        id: Date.now().toString(),

        type,

        createdAt:
            new Date().toISOString(),

        data
    };

    /*
       Always keep an in-memory copy.
       This prevents the form from failing
       just because file storage is unavailable.
    */

    memorySubmissions.unshift(record);

    /*
       Try local JSON storage.
       Failure here will NOT break the form.
    */

    const existing = safeRead();

    existing.unshift(record);

    const fileSaved =
        safeWrite(existing);

    if (!fileSaved) {
        console.warn(
            'Submission kept in memory because JSON storage failed.'
        );
    }

    /*
       Try MySQL if configured.
       Failure here will NOT break the form.
    */

    const database =
        await getDatabase();

    if (database) {
        try {
            await database.query(
                `
                INSERT INTO submissions
                (
                    type,
                    created_at,
                    payload
                )
                VALUES (?, ?, ?)
                `,
                [
                    type,
                    new Date(),

                    JSON.stringify(data)
                ]
            );

            console.log(
                'Submission saved to MySQL.'
            );
        } catch (error) {
            console.error(
                'MySQL save failed:',
                error
            );
        }
    }

    return record;
}

/* ==================================================
   EMAIL NOTIFICATION
================================================== */

async function notify(
    type,
    data
) {
    /*
       SMTP not configured
    */

    if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
    ) {
        console.warn(
            'SMTP is not configured.'
        );

        return false;
    }

    try {
        const transporter =
            nodemailer.createTransport({
                host:
                    process.env.SMTP_HOST,

                port: Number(
                    process.env.SMTP_PORT ||
                        587
                ),

                secure:
                    String(
                        process.env.SMTP_SECURE
                    ) === 'true',

                auth: {
                    user:
                        process.env.SMTP_USER,

                    pass:
                        process.env.SMTP_PASS
                },

                connectionTimeout: 10000,

                greetingTimeout: 10000,

                socketTimeout: 10000
            });

        const lines =
            Object.entries(data)
                .filter(
                    ([key]) =>
                        key !== 'website'
                )
                .map(
                    ([key, value]) =>
                        `${key}: ${value}`
                )
                .join('\n');

        const recipient =
            process.env.NOTIFY_EMAIL ||
            process.env.SMTP_USER;

        await transporter.sendMail({
            from:
                process.env.SMTP_FROM ||
                process.env.SMTP_USER,

            to: recipient,

            replyTo:
                data.email ||
                undefined,

            subject:
                `Portfolio ${type}: ${
                    data.name ||
                    'New submission'
                }`,

            text:
                `New ${type} submission from Manish Yadav portfolio.

--------------------------------

${lines}

--------------------------------

This message was generated by the portfolio contact system.`
        });

        console.log(
            `Email notification sent for ${type}.`
        );

        return true;
    } catch (error) {
        /*
           Email failure must NOT break
           the contact form.
        */

        console.error(
            'Email notification failed:',
            error
        );

        return false;
    }
}

/* ==================================================
   SPAM PROTECTION
================================================== */

function validate(
    req,
    res,
    next
) {
    if (
        req.body &&
        req.body.website
    ) {
        return res
            .status(400)
            .json({
                success: false,

                message:
                    'Spam detected.'
            });
    }

    next();
}

/* ==================================================
   CONTACT FORM
================================================== */

app.post(
    '/api/contact',
    validate,
    async (req, res) => {
        try {
            const data =
                req.body || {};

            /*
               Save the submission.
            */

            await saveSubmission(
                'contact',
                data
            );

            /*
               Send email notification.
               Email failure will NOT fail
               the contact form.
            */

            const emailed =
                await notify(
                    'contact',
                    data
                );

            if (emailed) {
                return res.json({
                    success: true,

                    message:
                        'Message sent successfully. Email notification delivered.'
                });
            }

            return res.json({
                success: true,

                message:
                    'Message sent successfully. Email notification is currently unavailable.'
            });
        } catch (error) {
            console.error(
                'CONTACT API ERROR:',
                error
            );

            /*
               Always return valid JSON.
            */

            return res
                .status(500)
                .json({
                    success: false,

                    message:
                        'Something went wrong while processing the message.'
                });
        }
    }
);

/* ==================================================
   HIRE FORM
================================================== */

app.post(
    '/api/hire',
    validate,
    async (req, res) => {
        try {
            const data =
                req.body || {};

            await saveSubmission(
                'hire',
                data
            );

            const emailed =
                await notify(
                    'hire',
                    data
                );

            if (emailed) {
                return res.json({
                    success: true,

                    message:
                        'Hiring request sent successfully. Email notification delivered.'
                });
            }

            return res.json({
                success: true,

                message:
                    'Hiring request sent successfully. Email notification is currently unavailable.'
            });
        } catch (error) {
            console.error(
                'HIRE API ERROR:',
                error
            );

            return res
                .status(500)
                .json({
                    success: false,

                    message:
                        'Something went wrong while processing the hiring request.'
                });
        }
    }
);

/* ==================================================
   ADMIN SUBMISSIONS
================================================== */

app.get(
    '/api/admin/submissions',
    async (req, res) => {
        try {
            if (
                !process.env.ADMIN_KEY ||
                req.query.key !==
                    process.env.ADMIN_KEY
            ) {
                return res
                    .status(401)
                    .json({
                        success: false,

                        message:
                            'Invalid admin key.'
                    });
            }

            /*
               Prefer MySQL if available.
            */

            const database =
                await getDatabase();

            if (database) {
                try {
                    const [rows] =
                        await database.query(
                            `
                            SELECT
                                id,
                                type,
                                created_at,
                                payload
                            FROM submissions
                            ORDER BY created_at DESC
                            LIMIT 200
                            `
                        );

                    return res.json({
                        success: true,

                        items:
                            rows.map(
                                (row) => ({
                                    id:
                                        row.id,

                                    type:
                                        row.type,

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
                        'Admin MySQL read failed:',
                        error
                    );
                }
            }

            /*
               Fall back to local JSON.
            */

            const fileItems =
                safeRead();

            /*
               Also include memory items
               if file storage failed.
            */

            const combined = [
                ...memorySubmissions,
                ...fileItems
            ];

            /*
               Remove duplicate IDs.
            */

            const unique =
                Array.from(
                    new Map(
                        combined.map(
                            (item) => [
                                item.id,
                                item
                            ]
                        )
                    ).values()
                );

            return res.json({
                success: true,

                items:
                    unique.slice(
                        0,
                        200
                    )
            });
        } catch (error) {
            console.error(
                'ADMIN API ERROR:',
                error
            );

            return res
                .status(500)
                .json({
                    success: false,

                    message:
                        'Could not load submissions.'
                });
        }
    }
);

/* ==================================================
   HEALTH CHECK
================================================== */

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

/* ==================================================
   404 API HANDLER
================================================== */

app.use(
    '/api',
    (req, res) => {
        res
            .status(404)
            .json({
                success: false,

                message:
                    'API endpoint not found.'
            });
    }
);

/* ==================================================
   GLOBAL ERROR HANDLER
================================================== */

app.use(
    (error, req, res, next) => {
        console.error(
            'GLOBAL SERVER ERROR:',
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        res
            .status(500)
            .json({
                success: false,

                message:
                    'Internal server error.'
            });
    }
);

/* ==================================================
   START SERVER
================================================== */

app.listen(
    PORT,
    '0.0.0.0',
    () => {
        console.log(
            `Portfolio running on port ${PORT}`
        );

        console.log(
            `Environment: ${
                process.env.NODE_ENV ||
                'development'
            }`
        );

        console.log(
            `Data directory: ${DATA_DIR}`
        );
    }
);