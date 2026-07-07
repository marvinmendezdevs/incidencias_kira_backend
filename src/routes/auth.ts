import { Router, Request, Response } from 'express';
import {
  verifyGoogleIdToken,
  upsertUser,
  issueToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from '../auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.post(
  '/google',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { idToken } = req.body || {};
      if (!idToken) {
        res.status(400).json({ error: 'Falta idToken.' });
        return;
      }
      const payload = await verifyGoogleIdToken(idToken);
      const user = await upsertUser(payload);
      const token = issueToken(user);
      setAuthCookie(res, token);
      res.json({ user });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[auth/google]', (err as Error).message);
      res.status(401).json({ error: 'No se pudo verificar la sesion de Google.' });
    }
  })
);

router.post('/logout', (req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
