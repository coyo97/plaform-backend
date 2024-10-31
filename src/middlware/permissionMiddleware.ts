// src/middlware/permissionMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserModel } from '../routes/schemas/user';
import App from '../app';

export const permissionMiddleware = (module: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId;

    try {
      const app = req.app.get('appInstance') as App;
      const user = await UserModel(app.getClientMongoose()).findById(userId).populate('roles').exec();

      if (!user) {
        return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no encontrado' });
      }

      const hasPermission = user.roles.some(role =>
        role.permissions.some(permission => permission.module === module && permission.action === action)
      );

      if (!hasPermission) {
        return res.status(StatusCodes.FORBIDDEN).json({ message: 'No tienes permiso para realizar esta acción' });
      }

      next();
    } catch (error) {
      console.error('Error en permissionMiddleware:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al verificar permisos', error });
    }
  };
};

