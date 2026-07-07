"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../auth");
const router = (0, express_1.Router)();
router.post('/google', async (req, res) => {
    try {
        const { idToken } = req.body || {};
        if (!idToken) {
            res.status(400).json({ error: 'Falta idToken.' });
            return;
        }
        const payload = await (0, auth_1.verifyGoogleIdToken)(idToken);
        const user = await (0, auth_1.upsertUser)(payload);
        const token = (0, auth_1.issueToken)(user);
        (0, auth_1.setAuthCookie)(res, token);
        res.json({ user });
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[auth/google]', err.message);
        res.status(401).json({ error: 'No se pudo verificar la sesion de Google.' });
    }
});
router.post('/logout', (req, res) => {
    (0, auth_1.clearAuthCookie)(res);
    res.json({ ok: true });
});
router.get('/me', auth_1.requireAuth, (req, res) => {
    res.json({ user: req.user });
});
exports.default = router;
