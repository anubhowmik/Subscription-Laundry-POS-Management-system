import dotenv from "dotenv";

dotenv.config();

// Reports, accounting and the scheduled jobs build business days with local-time Date maths
// (`new Date(\`${ymd}T00:00:00\`)`, getFullYear/getMonth, cron times), so the process must run in
// the business's time zone. Without this a server in UTC - or a developer machine anywhere else -
// shifts every "today" window away from the Saudi business day (sales just after midnight land on
// the previous day). An explicit TZ in the environment still wins. Imported first in server.ts.
if (!process.env.TZ) process.env.TZ = process.env.DEFAULT_TIMEZONE || "Asia/Riyadh";
