"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_1 = __importDefault(require("./routes/auth"));
const sections_1 = __importDefault(require("./routes/sections"));
const incidentTypes_1 = __importDefault(require("./routes/incidentTypes"));
const incidents_1 = __importDefault(require("./routes/incidents"));
const app = (0, express_1.default)();
const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
app.use((0, cors_1.default)({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.get('/health', (_req, res) => res.json({ ok: true, service: 'incidencias-kira-backend' }));
app.use('/api/auth', auth_1.default);
app.use('/api', sections_1.default); // /api/schools, /api/sections, /api/admin/sections/import
app.use('/api/incident-types', incidentTypes_1.default);
app.use('/api/incidents', incidents_1.default);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
});
const PORT = Number(process.env.PORT) || 4000;
if (require.main === module) {
    app.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log('Backend Incidencias KIRA escuchando en puerto ' + PORT);
    });
}
exports.default = app;
