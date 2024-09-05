import { UserModel } from '../routes/schemas/user';

import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { verifyToken, TokenPayload } from '../authentication/authUser';  // Asegúrate de que la ruta es correcta

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'No se proporcionó un token de autorización' });
    }

    const payload = verifyToken(token);
    const userId = payload.userId;
    const user = await UserModel.findById(userId).exec(); // Asegúrate de que la ruta e importación de UserModel son correctas

    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Usuario no encontrado' });
    }

    // Continuar con el middleware
    next();
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Token de autorización inválido' });
  }
}

